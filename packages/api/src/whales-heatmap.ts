/**
 * Whales-subject heatmap handler.
 *
 * Pivot rows from categories to top-N whale addresses. Supports all
 * three view modes:
 *   live    → 4 ranges × 12 buckets, whale × time grid
 *   macro   → 168 hour buckets / 84 day buckets per whale
 *   pattern → 12 hour-of-day or 7 day-of-week slots, averaged over
 *             90d cycles per whale
 *
 * Top-50 whales ranked by 90d realized PnL across all modes — single
 * ranking query (queryTopWhalesByReputation) is shared so trades /
 * pattern / macro stay consistent.
 *
 * Was inline in api.ts as a ~190 LOC branch inside the heatmap route
 * handler. Extracted because it doesn't share much with the trades
 * branches (separate aggregation paths, separate response shape via
 * whaleMeta) and the inline form pushed the route handler past 700
 * LOC. Now api.ts dispatches to this with a wide-signature call.
 */

import type { Sql } from "postgres";

import {
  assembleHeatmap,
  buildBuckets,
  fetchTopWhale,
  fetchUniqueWhalesInWindow,
  type HeatmapCell,
  type HeatmapRange,
  MACRO_CONFIG,
  queryActiveWhalesInWindow,
  queryTopWhalesByReputation,
  queryWhalesAggRows,
  queryWhalesMacroAggRows,
  queryWhalesPatternAggRows,
  RANGE_CONFIG,
} from "./heatmap-query";
import { computeReputation } from "./whale-profile";
import { whaleAlias, whaleAliasInfo, whaleColor } from "./whale-display";

/** Which set of whales to render as rows in the WHALES subject view.
 *   - "online"    → top-N currently-active addresses in the LIVE window
 *                   (or in the current mode's lookback for PATTERN/MACRO)
 *   - "watchlist" → user's pinned set (passed in via `watchlistAddrs`).
 *                   Empty = empty heatmap, no fallback to top-N (the UI
 *                   shows an empty-state CTA instead).
 *   - "top"       → existing top-50 by 90-day realised PnL reputation
 *                   (the previous default; kept for anonymous fallback). */
export type WhaleSet = "online" | "watchlist" | "top";

export type WhalesHandlerInput = {
  sql: Sql;
  query: {
    range?: HeatmapRange;
    macroKind?: "hour-week" | "day-12w";
    kind?: "hour-of-day" | "day-of-week";
  };
  mode: "live" | "pattern" | "macro";
  metric: string;
  trackedWhales: number;
  dataSpan: { earliestTs: string | null; daysOfData: number };
  now: Date;
  /** Source of the whale row set. Default "top" preserves the previous
   *  behaviour for anonymous users + clients that haven't been updated
   *  to send the param. */
  whaleSet?: WhaleSet;
  /** Lowercased pinned addresses. Only used when whaleSet === "watchlist".
   *  Server-side cap of 100 (enforced at the /api/me/watchlist endpoint)
   *  keeps the worst-case row count bounded. */
  watchlistAddrs?: ReadonlyArray<string>;
};

export async function handleWhalesSubject(
  input: WhalesHandlerInput,
): Promise<unknown> {
  const { sql, query, mode, metric, trackedWhales, dataSpan, now } = input;
  const whaleSet: WhaleSet = input.whaleSet ?? "top";
  const range: HeatmapRange = query.range ?? "1h";

  // Pick the row set:
  //   online    → active in the current mode's window. For LIVE use the
  //               selected range, for MACRO/PATTERN use a fixed lookback
  //               that matches the mode's rendered span (7d / 30d).
  //   watchlist → exactly what the user pinned, no top-N filtering. UI
  //               surfaces an empty-state when this is empty.
  //   top       → existing reputation-ranked top-50.
  let topAddrs: ReadonlyArray<string>;
  if (whaleSet === "watchlist") {
    topAddrs = input.watchlistAddrs ?? [];
  } else if (whaleSet === "online") {
    const windowMinutes = mode === "live"
      ? RANGE_CONFIG[range].windowMinutes
      : mode === "macro"
        ? (query.macroKind === "day-12w" ? 12 * 7 * 24 * 60 : 7 * 24 * 60)
        : 30 * 24 * 60; // pattern: 30d lookback by default
    topAddrs = await queryActiveWhalesInWindow(sql, windowMinutes, 50);
  } else {
    topAddrs = await queryTopWhalesByReputation(sql);
  }

  // Build buckets + cells by mode. PATTERN gets a custom assembly
  // path because each cell needs current_*+avg_* + delta+sampleCount
  // populated (mirrors trades pattern), so the standard single-value
  // AggRow shape isn't enough.
  let buckets: ReadonlyArray<{ ts: string; index: number }>;
  let assembleRange: HeatmapRange = range;
  let cells: Record<string, HeatmapCell[]> = {};
  if (mode === "macro") {
    const macroKind = query.macroKind ?? "hour-week";
    const macroCfg = MACRO_CONFIG[macroKind];
    buckets = buildBuckets(now, macroCfg.bucketMinutes, macroCfg.slots);
    const aggRows = await queryWhalesMacroAggRows(sql, macroKind, topAddrs);
    assembleRange = "1h";
    cells = assembleHeatmap(
      aggRows,
      [],
      buckets,
      assembleRange,
      now,
      { rowKeys: topAddrs as string[] },
      [],
    ).cells as Record<string, HeatmapCell[]>;
  } else if (mode === "pattern") {
    const kind = query.kind ?? "hour-of-day";
    const slotCount = kind === "hour-of-day" ? 12 : 7;
    buckets = Array.from({ length: slotCount }, (_, i) => ({
      ts: `slot:${i}`,
      index: i,
    }));
    const patternRows = await queryWhalesPatternAggRows(sql, kind, topAddrs);
    // Manual assembly — cell.count/volume/pnl/winRate hold the most-
    // recent-cycle values (the headline number in the cell). cell.full
    // carries the cycle-averaged baseline so Cell.tsx can render the
    // avg in the delta paren. cell.delta = current − avg, drives the
    // ▲/▼ arrow + sign-coloured percent paren same as trades pattern.
    for (const addr of topAddrs) {
      cells[addr] = Array.from({ length: slotCount }, () => ({
        count: 0, volume: 0, pnl: 0, winRate: null, uniqueWhales: 1,
        markets: [], topWhales: [],
      }));
    }
    for (const r of patternRows) {
      const row = cells[r.whale_addr];
      if (!row || r.slot < 0 || r.slot >= slotCount) continue;
      const decidedCur = r.current_wins + r.current_losses;
      const curWR = decidedCur > 0 ? r.current_wins / decidedCur : null;
      const decidedAvg = r.total_wins + r.total_losses;
      const avgWR = decidedAvg > 0 ? r.total_wins / decidedAvg : null;
      row[r.slot] = {
        count: r.current_count,
        volume: r.current_volume,
        pnl: r.current_pnl,
        winRate: curWR,
        uniqueWhales: 1,
        markets: [],
        topWhales: [],
        full: {
          count: r.avg_count,
          volume: r.avg_volume,
          pnl: r.avg_pnl,
          winRate: avgWR,
          uniqueWhales: 1,
        },
        delta: {
          count: r.current_count - r.avg_count,
          volume: r.current_volume - r.avg_volume,
          pnl: r.current_pnl - r.avg_pnl,
          winRate:
            curWR !== null && avgWR !== null ? curWR - avgWR : null,
          uniqueWhales: 0,
        },
        sampleCount: r.sample_count,
      };
    }
  } else {
    const cfg = RANGE_CONFIG[range];
    buckets = buildBuckets(now, cfg.bucketMinutes, cfg.slots);
    const live = await queryWhalesAggRows(sql, range, topAddrs);
    cells = assembleHeatmap(
      live.rows,
      [],
      buckets,
      range,
      now,
      { rowKeys: topAddrs as string[] },
      [],
    ).cells as Record<string, HeatmapCell[]>;
  }

  // 90-day reputation inputs for the top addrs — same window and
  // formula as the LVL badge in WhaleDrawer. Single batch query
  // keyed on the top-N set, computed per-whale in JS so we can reuse
  // the canonical computeReputation helper.
  type ReputationRow = {
    whale_addr: string;
    trades: number | string;
    wins: number | string;
    losses: number | string;
    pnl: number | string | null;
  };
  const repRows = topAddrs.length === 0
    ? []
    : await sql<ReputationRow[]>`
        SELECT
          whale_addr,
          COUNT(*)::bigint                                              AS trades,
          COUNT(*) FILTER (WHERE realized_pnl > 0)::bigint              AS wins,
          COUNT(*) FILTER (WHERE realized_pnl < 0)::bigint              AS losses,
          COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS pnl
        FROM signals
        WHERE ts >= NOW() - INTERVAL '90 days'
          AND whale_addr = ANY(${topAddrs as string[]}::text[])
        GROUP BY whale_addr
      `;
  const repByAddr = new Map<string, number>();
  for (const r of repRows) {
    const trades = Number(r.trades);
    const wins = Number(r.wins);
    const losses = Number(r.losses);
    const decided = wins + losses;
    const winRate = decided > 0 ? wins / decided : null;
    const pnl = r.pnl === null ? 0 : Number(r.pnl);
    repByAddr.set(
      r.whale_addr,
      computeReputation({ pnl, trades, winRate }),
    );
  }

  const whaleMeta: Record<
    string,
    { alias: string; color: string; profileImage: string | null; score?: number }
  > = {};
  for (const addr of topAddrs) {
    whaleMeta[addr] = {
      alias: whaleAlias(addr),
      color: whaleColor(addr),
      profileImage: whaleAliasInfo(addr)?.profileImage ?? null,
      score: repByAddr.get(addr),
    };
  }

  // ── Totals for the StatsBar ───────────────────────────────────────
  // Trades subject populates totals via fetchTopWhale +
  // fetchUniqueWhalesInWindow. Same shape works for whales subject —
  // ACTIVE WHALES + TOP WHALE tile read from data.totals on the client,
  // and showing 0 / — in the WHALES view when the same numbers are
  // visible right above in the heatmap reads as "broken stats".
  // PATTERN keeps totals: null because it has no real-time semantics
  // (the heatmap aggregates across cycles, so "active in this window"
  // doesn't apply).
  let totals: {
    signals: number;
    volume: number;
    pnl: number;
    uniqueWhales: number;
    activeWhales: number;
    topWhale: {
      addr: string;
      alias: string;
      color: string;
      profileImage: string | null;
    } | null;
  } | null = null;
  if (mode !== "pattern") {
    const windowMinutes = mode === "macro"
      ? MACRO_CONFIG[query.macroKind ?? "hour-week"].windowMinutes
      : RANGE_CONFIG[range].windowMinutes;
    const [topWhaleAddr, uniqueWhales] = await Promise.all([
      fetchTopWhale(sql, windowMinutes),
      fetchUniqueWhalesInWindow(sql, windowMinutes),
    ]);
    // Sum across the displayed cells for signals/volume/pnl so the
    // headline tiles match what's visible in the grid.
    let signalsSum = 0;
    let volumeSum = 0;
    let pnlSum = 0;
    for (const addr of topAddrs) {
      for (const c of cells[addr] ?? []) {
        signalsSum += c.count;
        volumeSum += c.volume;
        pnlSum += c.pnl;
      }
    }
    totals = {
      signals: signalsSum,
      volume: volumeSum,
      pnl: pnlSum,
      uniqueWhales,
      activeWhales: uniqueWhales,
      topWhale: topWhaleAddr
        ? {
            addr: topWhaleAddr,
            alias: whaleAlias(topWhaleAddr),
            color: whaleColor(topWhaleAddr),
            profileImage: whaleAliasInfo(topWhaleAddr)?.profileImage ?? null,
          }
        : null,
    };
  }
  return {
    generatedAt: new Date().toISOString(),
    range: assembleRange,
    windowEnd: now.toISOString(),
    windowStart: new Date(now.getTime() - 60 * 60_000).toISOString(),
    windowMinutes: 60,
    bucketMinutes: 5,
    drillCategory: null,
    categories: topAddrs as ReadonlyArray<string>,
    buckets,
    cells,
    // Populated above for live/macro, null for pattern.
    totals,
    mode,
    subject: "whales" as const,
    // Surface kind / macroKind so the client knows which pattern /
    // macro variant the response represents.
    ...(mode === "pattern"
      ? { patternKind: query.kind ?? "hour-of-day", lookbackDays: 90 }
      : {}),
    ...(mode === "macro"
      ? { macroKind: query.macroKind ?? "hour-week" }
      : {}),
    trackedWhales,
    whaleMeta,
    metric,
    dataSpan,
    whaleSet,
  };
}

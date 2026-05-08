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
  type HeatmapCell,
  type HeatmapRange,
  MACRO_CONFIG,
  queryActiveWhalesInWindow,
  queryReputationInputs,
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
  // formula as the LVL badge in WhaleDrawer. Reads the per-whale
  // hourly CAGG so a 90d aggregate over 10 addrs is a couple of
  // indexed point lookups instead of a full chunk-walk.
  const repRows = await queryReputationInputs(sql, topAddrs);
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
  // Derive totals straight from the already-fetched cells instead of
  // calling fetchTopWhale + fetchUniqueWhalesInWindow. Those two
  // queries scan the full `signals` window (12d / 12w on the wide
  // ranges) and stacking them on top of the whales-subject's own
  // heavy 90d reputation scan + per-whale aggregation pushed total
  // request time over Caddy's 60s proxy timeout → 502.
  //
  // Tradeoff: ACTIVE WHALES count is now scoped to the rows the user
  // actually sees (top-50 by reputation / online / pinned set) rather
  // than the full corpus. That's actually closer to the intent of the
  // tile in this view ("how many of MY rows are firing right now").
  // TOP WHALE is the highest-volume row in the visible set, picked by
  // summing cell volume — same answer the user can read off the grid.
  // PATTERN keeps null because cells aggregate across cycles and the
  // tile would be misleading.
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
  // Per-row sums lifted out so they can feed BOTH the totals tile and
  // the TOP WHALES popover list — no need to walk cells twice.
  type RowStat = {
    addr: string;
    signals: number;
    volume: number;
    pnl: number;
  };
  const rowStats: RowStat[] = topAddrs.map((addr) => {
    let signals = 0;
    let volume = 0;
    let pnl = 0;
    for (const c of cells[addr] ?? []) {
      signals += c.count;
      volume += c.volume;
      pnl += c.pnl;
    }
    return { addr, signals, volume, pnl };
  });

  if (mode !== "pattern") {
    let signalsSum = 0;
    let volumeSum = 0;
    let pnlSum = 0;
    let activeRows = 0;
    let topAddr: string | null = null;
    let topAddrVolume = 0;
    for (const r of rowStats) {
      signalsSum += r.signals;
      volumeSum += r.volume;
      pnlSum += r.pnl;
      if (r.signals > 0) activeRows += 1;
      if (r.volume > topAddrVolume) {
        topAddrVolume = r.volume;
        topAddr = r.addr;
      }
    }
    totals = {
      signals: signalsSum,
      volume: volumeSum,
      pnl: pnlSum,
      uniqueWhales: activeRows,
      activeWhales: activeRows,
      topWhale: topAddr
        ? {
            addr: topAddr,
            alias: whaleAlias(topAddr),
            color: whaleColor(topAddr),
            profileImage: whaleAliasInfo(topAddr)?.profileImage ?? null,
          }
        : null,
    };
  }

  // TOP WHALES popover list — same shape as trades-subject. Sort by
  // reputation score so the list reflects "our rating" regardless of
  // which whaleSet (online / watchlist / top) is active. Falls back to
  // volume for whales that don't have a 90d reputation score yet.
  const topWhalesList = rowStats
    .map((r) => ({
      addr: r.addr,
      alias: whaleAlias(r.addr),
      color: whaleColor(r.addr),
      profileImage: whaleAliasInfo(r.addr)?.profileImage ?? null,
      signals: r.signals,
      volume: r.volume,
      pnl: r.pnl,
      score: repByAddr.get(r.addr) ?? 0,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.volume - a.volume;
    })
    .slice(0, 10);
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
    // TOP WHALES popover list — visible row set ranked by reputation
    // score (falls back to volume on ties / score=0). Same shape as
    // the trades-subject response so StatsBar reads it identically.
    topWhales: topWhalesList,
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

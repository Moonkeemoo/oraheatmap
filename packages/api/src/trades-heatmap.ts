/**
 * Trades-subject heatmap handler.
 *
 * Three branches by mode (live / pattern / macro). All share the drill
 * vocabulary: L1 (no params, 9 categories) → L2 (?category=X,
 * subcategories) → L3 (?category=X&subcategory=Y, individual markets).
 *
 *   live    → 4 ranges × 12 buckets, category × time grid, with per-cell
 *             top markets + top whales hydrated for the tooltip.
 *   pattern → 12 hour-of-day or 7 day-of-week slots, averaged over the
 *             lookback range. PATTERN intentionally drops L3 — at
 *             individual-market resolution slot averages are too noisy.
 *   macro   → 168 hour buckets / 84 day buckets, dense matrix. Skips
 *             per-cell top-markets / top-whales — at this density they
 *             would dominate the JSON payload.
 *
 * Was inline in api.ts as a 460 LOC route handler. Extracted because
 * the three branches are big and self-contained, the route handler
 * had grown past 700 LOC, and pivoting on `mode` here lets api.ts
 * dispatch trades-vs-whales subjects symmetrically.
 */

import type { Sql } from "postgres";

import { CATEGORIES, type Category } from "./categorize";
import {
  assembleHeatmap,
  buildBuckets,
  fetchMarketMeta,
  fetchResolvedMarkets,
  fetchTopWhale,
  fetchUniqueWhalesInWindow,
  type HeatmapRange,
  MACRO_CONFIG,
  queryHeatmapAggRows,
  queryMacroAggRows,
  queryReputationInputs,
  queryTopMarketsPerCell,
  queryTopWhales,
  queryTopWhalesPerCell,
  RANGE_CONFIG,
} from "./heatmap-query";
import { type PatternKind, queryPattern } from "./pattern-query";
import { SUBCATEGORY_LABELS, subcategoriesOf } from "./subcategorize";
import { computeReputation } from "./whale-profile";
import { whaleAlias, whaleAliasInfo, whaleColor } from "./whale-display";

/** Top-N markets per (category, bucket) cell. UI re-sorts client-side
 *  by active metric and slices to top-5; the small buffer above the
 *  display cap lets metric switches happen without refetching. */
export const TOP_MARKETS_PER_CELL = 6;
/** Top whales per (category, bucket) cell, surfaced in the tooltip's
 *  "Top whales" section. UI re-sorts by active metric and slices to
 *  top-5. Was 20; trimmed to 8 because the per-cell whale array
 *  dominated /api/heatmap payload size (~260KB raw). */
export const TOP_WHALES_PER_CELL = 8;
/** Whales surfaced in the StatsBar "Top Whale" hover popover. */
export const TOP_WHALES_LIMIT = 10;
/** Hard cap on rows in the L3 "markets in subcategory" heatmap —
 *  anything beyond this would make the grid unreadable. Sorted by
 *  total signals desc. */
export const MAX_MARKETS_IN_DRILL = 30;

export type TradesHandlerInput = {
  sql: Sql;
  query: {
    range?: HeatmapRange;
    kind?: PatternKind;
    macroKind?: "hour-week" | "day-12w";
    lookbackDays?: number;
    category?: string;
    subcategory?: string;
  };
  mode: "live" | "pattern" | "macro";
  metric: string;
  trackedWhales: number;
  dataSpan: { earliestTs: string | null; daysOfData: number };
  now: Date;
};

export async function handleTradesSubject(
  input: TradesHandlerInput,
): Promise<unknown> {
  const { sql, query, mode, metric, trackedWhales, dataSpan, now } = input;

  // Drill levels — same vocab across all three modes.
  //   L1 (no params):                rows = 9 categories
  //   L2 (?category=X):              rows = subcategories of X
  //   L3 (?category=X&subcategory=Y): rows = individual markets in (X, Y)
  // Unknown values silently fall back to a higher level.
  const drillCategory: Category | null =
    query.category && (CATEGORIES as ReadonlyArray<string>).includes(query.category)
      ? (query.category as Category)
      : null;
  const drillRules = drillCategory ? subcategoriesOf(drillCategory) : [];
  const isDrill = drillCategory !== null && drillRules.length > 0;
  const drillSubcategory: string | null =
    isDrill && query.subcategory && drillRules.some((r) => r.slug === query.subcategory)
      ? query.subcategory
      : null;
  const isDrillL3 = drillSubcategory !== null;

  if (mode === "pattern") {
    const kind: PatternKind = query.kind ?? "hour-of-day";
    // HOUR cycle = 1 day → 30 cycles by default (~30 days).
    // DOW  cycle = 1 week → 12 cycles by default (~12 weeks = 84 days).
    const lookbackDays = query.lookbackDays ?? (kind === "day-of-week" ? 84 : 30);
    const rowKeys = isDrill ? drillRules.map((r) => r.slug) : undefined;
    const pattern = await queryPattern(sql, kind, lookbackDays, {
      drillCategory: isDrill ? drillCategory : null,
      rowKeys,
    });
    const patternSubcategoryLabels = isDrill
      ? Object.fromEntries(drillRules.map((r) => [r.slug, SUBCATEGORY_LABELS[r.slug] ?? r.slug]))
      : null;
    return {
      mode: "pattern" as const,
      subject: "trades" as const,
      patternKind: kind,
      lookbackDays,
      generatedAt: now.toISOString(),
      trackedWhales,
      drillCategory: pattern.drillCategory,
      // L3 (per-market) drill not implemented in PATTERN; UI hides
      // the affordance there via `drillSubcategory: null`.
      drillSubcategory: null,
      drillSubcategoryLabel: null,
      categories: pattern.categories,
      subcategoryLabels: patternSubcategoryLabels,
      marketSlugs: null,
      marketIcons: null,
      marketQuestions: null,
      resolvedRows: [],
      topWhales: null,
      buckets: pattern.buckets,
      cells: pattern.cells,
      totals: null,
      metric,
      dataSpan,
    };
  }

  if (mode === "macro") {
    // macro mode — dense matrix. Two configs by macroKind:
    //   hour-week (default) → 1h × 7d × 168 cells
    //   day-12w             → 1d × 12w × 84 cells
    // Drill behaves the same as LIVE: L1 → L2 → L3. Skips per-cell
    // top-markets / top-whales — at this density they'd dominate the
    // payload and never render anyway.
    const macroKind = (query.macroKind ?? "hour-week") as
      | "hour-week"
      | "day-12w";
    const macroCfg = MACRO_CONFIG[macroKind];
    const macroBuckets = buildBuckets(now, macroCfg.bucketMinutes, macroCfg.slots);
    const [aggRows, macroTopWhaleAddr, macroUniqueWhales, macroTopWhaleRows] =
      await Promise.all([
        queryMacroAggRows(
          sql,
          macroKind,
          isDrill ? drillCategory : null,
          drillSubcategory,
        ),
        fetchTopWhale(sql, macroCfg.windowMinutes),
        fetchUniqueWhalesInWindow(sql, macroCfg.windowMinutes),
        queryTopWhales(
          sql,
          macroCfg.windowMinutes,
          isDrill ? drillCategory : null,
          TOP_WHALES_LIMIT,
        ),
      ]);

    // L2 → row keys are subcategory slugs; L3 → row keys are
    // condition_ids. Build the row-label map server-side so the grid
    // can render readable rows without a second round-trip.
    let rowKeys: string[] | undefined;
    let rowLabels: Record<string, string> | null = null;
    let marketSlugs: Record<string, string | null> | null = null;
    let marketIcons: Record<string, string | null> | null = null;
    let marketQuestions: Record<string, string | null> | null = null;
    let resolvedRows: ReadonlyArray<string> = [];
    if (isDrillL3) {
      // L3 — top markets in the (category, subcategory). Pull the
      // densest by signal count, capped at MAX_MARKETS_IN_DRILL.
      // Reads from signals_hourly_by_condition (per-market hourly CAGG, added
      // 2026-05-10). Without it, this scans 1.5M+ raw rows for high-volume
      // 12d L3 (Sports/nba etc.) and dominates request latency. The CAGG
      // makes this <100ms.
      const topMarketsRows = await sql<
        { condition_id: string; signals: number | string }[]
      >`
        SELECT condition_id, SUM(signal_count)::bigint AS signals
        FROM signals_hourly_by_condition
        WHERE bucket >= NOW() - (${macroCfg.windowMinutes} * INTERVAL '1 minute')
          AND category = ${drillCategory}
          AND subcategory = ${drillSubcategory}
        GROUP BY condition_id
        ORDER BY signals DESC
        LIMIT ${MAX_MARKETS_IN_DRILL}
      `;
      const conditionIds = topMarketsRows.map((r) => r.condition_id);
      const meta = conditionIds.length > 0
        ? await fetchMarketMeta(sql, conditionIds)
        : {};
      rowKeys = conditionIds;
      rowLabels = Object.fromEntries(
        conditionIds.map((cid) => [cid, meta[cid]?.question ?? cid]),
      );
      marketSlugs = Object.fromEntries(
        conditionIds.map((cid) => [cid, meta[cid]?.slug ?? null]),
      );
      marketIcons = Object.fromEntries(
        conditionIds.map((cid) => [cid, meta[cid]?.icon ?? null]),
      );
      marketQuestions = Object.fromEntries(
        conditionIds.map((cid) => [cid, meta[cid]?.question ?? null]),
      );
      const resolvedSet = await fetchResolvedMarkets(sql, conditionIds);
      resolvedRows = conditionIds.filter((cid) => resolvedSet.has(cid));
    } else if (isDrill) {
      rowKeys = drillRules.map((r) => r.slug);
      rowLabels = Object.fromEntries(
        drillRules.map((r) => [r.slug, SUBCATEGORY_LABELS[r.slug] ?? r.slug]),
      );
    }

    const grid = assembleHeatmap(
      aggRows,
      [], // no per-cell markets in macro
      macroBuckets,
      "1h", // range arg unused for macro shape
      now,
      { drillCategory: isDrill ? drillCategory : null, rowKeys },
      [], // no whale rows
    );
    // Hydrate StatsBar fields exactly like LIVE: top whale (decorated
    // with alias + colour + avatar), top-N leaderboard, unique whales
    // in the macro window. activeWhales = uniqueWhales for macro (we
    // don't separate "active in any window slot" vs "any window
    // signal" — at macro scope they collapse to the same number).
    const macroTopWhale = macroTopWhaleAddr
      ? {
          addr: macroTopWhaleAddr,
          alias: whaleAlias(macroTopWhaleAddr),
          color: whaleColor(macroTopWhaleAddr),
          profileImage: whaleAliasInfo(macroTopWhaleAddr)?.profileImage ?? null,
        }
      : null;
    // Same reputation lookup as the live branch. Reads the per-whale
    // hourly CAGG — the ~10 surfaced addrs each become two point
    // lookups instead of a 45-chunk planner walk + 90d scan.
    const macroTopAddrs = macroTopWhaleRows.map((r) => r.whale_addr);
    const macroRepRows = await queryReputationInputs(sql, macroTopAddrs);
    const macroRepByAddr = new Map<string, number>();
    for (const r of macroRepRows) {
      const trades = Number(r.trades);
      const wins = Number(r.wins);
      const losses = Number(r.losses);
      const decided = wins + losses;
      const winRate = decided > 0 ? wins / decided : null;
      const pnl = r.pnl === null ? 0 : Number(r.pnl);
      macroRepByAddr.set(
        r.whale_addr,
        computeReputation({ pnl, trades, winRate }),
      );
    }
    const macroTopWhalesDecorated = macroTopWhaleRows
      .map((r) => {
        const addr = r.whale_addr;
        const volume = typeof r.volume_usd === "number" ? r.volume_usd : Number(r.volume_usd);
        return {
          addr,
          alias: whaleAlias(addr),
          color: whaleColor(addr),
          profileImage: whaleAliasInfo(addr)?.profileImage ?? null,
          signals: typeof r.signals === "number" ? r.signals : Number(r.signals),
          volume,
          pnl: r.pnl_usd === null
            ? 0
            : typeof r.pnl_usd === "number"
              ? r.pnl_usd
              : Number(r.pnl_usd),
          score: macroRepByAddr.get(addr) ?? 0,
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.volume - a.volume;
      });
    return {
      ...grid,
      mode: "macro" as const,
      subject: "trades" as const,
      range: "1h" as const,
      macroKind,
      trackedWhales,
      drillSubcategory,
      drillSubcategoryLabel: drillSubcategory
        ? SUBCATEGORY_LABELS[drillSubcategory] ?? drillSubcategory
        : null,
      subcategoryLabels: rowLabels,
      marketSlugs,
      marketIcons,
      marketQuestions,
      resolvedRows,
      topWhales: macroTopWhalesDecorated,
      totals: {
        ...grid.totals,
        uniqueWhales: macroUniqueWhales,
        activeWhales: macroUniqueWhales,
        topWhale: macroTopWhale,
      },
      metric,
      dataSpan,
    };
  }

  // live (default)
  const range: HeatmapRange = query.range ?? "1h";
  const cfg = RANGE_CONFIG[range];
  const buckets = buildBuckets(now, cfg.bucketMinutes, cfg.slots);
  const [aggRows, marketRows, topWhaleAddr, uniqueWhales, topWhaleRows, perCellWhaleRows] =
    await Promise.all([
      queryHeatmapAggRows(
        sql,
        range,
        isDrill ? drillCategory : null,
        drillSubcategory,
      ),
      // L3 rows ARE individual markets — top-markets-per-cell becomes
      // self-referential and uninformative. Skip the extra query there.
      isDrillL3
        ? Promise.resolve([])
        : queryTopMarketsPerCell(
            sql,
            range,
            TOP_MARKETS_PER_CELL,
            isDrill ? drillCategory : null,
          ),
      fetchTopWhale(sql, RANGE_CONFIG[range].windowMinutes),
      fetchUniqueWhalesInWindow(sql, RANGE_CONFIG[range].windowMinutes),
      queryTopWhales(
        sql,
        RANGE_CONFIG[range].windowMinutes,
        isDrill ? drillCategory : null,
        TOP_WHALES_LIMIT,
      ),
      queryTopWhalesPerCell(
        sql,
        range,
        TOP_WHALES_PER_CELL,
        isDrill ? drillCategory : null,
        drillSubcategory,
      ),
    ]);

  // Row-key set differs by drill level:
  //   L1 → undefined (assembleHeatmap defaults to CATEGORIES)
  //   L2 → fixed list of subcategory slugs from rules
  //   L3 → dynamically derived from agg result (top-N condition_ids by signals)
  let rowKeys: ReadonlyArray<string> | undefined;
  let rowLabels: Record<string, string> | null = null;
  let marketSlugs: Record<string, string | null> | null = null;
  let marketIcons: Record<string, string | null> | null = null;
  let marketQuestions: Record<string, string | null> | null = null;
  let resolvedRows: ReadonlyArray<string> = [];
  if (isDrillL3) {
    const totals = new Map<string, number>();
    for (const r of aggRows) {
      totals.set(r.category, (totals.get(r.category) ?? 0) + Number(r.signal_count));
    }
    const sortedConditionIds = Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_MARKETS_IN_DRILL)
      .map(([k]) => k);
    rowKeys = sortedConditionIds;
    const [meta, resolvedSet] = await Promise.all([
      fetchMarketMeta(sql, sortedConditionIds),
      fetchResolvedMarkets(sql, sortedConditionIds),
    ]);
    // Trim each label so it fits a 2-line clamp without the layout
    // bursting. See shortenMarketLabel for the rules.
    const subLabel = drillSubcategory
      ? SUBCATEGORY_LABELS[drillSubcategory] ?? drillSubcategory
      : null;
    rowLabels = Object.fromEntries(
      sortedConditionIds.map((cid) => {
        const q = meta[cid]?.question ?? "(unknown)";
        return [cid, shortenMarketLabel(q, subLabel)];
      }),
    );
    marketSlugs = Object.fromEntries(
      sortedConditionIds.map((cid) => [cid, meta[cid]?.slug ?? null]),
    );
    marketIcons = Object.fromEntries(
      sortedConditionIds.map((cid) => [cid, meta[cid]?.icon ?? null]),
    );
    // Original (un-shortened) market questions — tooltip uses this for
    // the L3 header where there's room for the full text. rowLabels
    // above stays the shortened version for the cramped row badges.
    marketQuestions = Object.fromEntries(
      sortedConditionIds.map((cid) => [cid, meta[cid]?.question ?? null]),
    );
    resolvedRows = sortedConditionIds.filter((cid) => resolvedSet.has(cid));
  } else if (isDrill) {
    rowKeys = drillRules.map((r) => r.slug);
    rowLabels = Object.fromEntries(
      drillRules.map((r) => [r.slug, SUBCATEGORY_LABELS[r.slug] ?? r.slug]),
    );
  }

  const grid = assembleHeatmap(
    aggRows,
    marketRows,
    buckets,
    range,
    now,
    {
      rowKeys,
      drillCategory: isDrill ? drillCategory : null,
    },
    perCellWhaleRows,
  );
  // Decorate every cell.topWhales with alias + color so the tooltip
  // can render the chip without a per-row lookup. Aliases / colors are
  // deterministic from address — same address always resolves to the
  // same display. Cast through unknown because the published
  // HeatmapCell.topWhales is readonly { addr, signals, volume, pnl }
  // and we're augmenting it post-build with display fields.
  for (const rowKey of Object.keys(grid.cells)) {
    const row = grid.cells[rowKey] as unknown as Array<{
      topWhales: Array<{
        addr: string;
        alias?: string;
        color?: string;
        profileImage?: string | null;
      }>;
    }>;
    for (const cell of row) {
      for (const w of cell.topWhales) {
        w.alias = whaleAlias(w.addr);
        w.color = whaleColor(w.addr);
        w.profileImage = whaleAliasInfo(w.addr)?.profileImage ?? null;
      }
    }
  }
  const topWhale = topWhaleAddr
    ? {
        addr: topWhaleAddr,
        alias: whaleAlias(topWhaleAddr),
        color: whaleColor(topWhaleAddr),
        profileImage: whaleAliasInfo(topWhaleAddr)?.profileImage ?? null,
      }
    : null;
  // 90d reputation rows for the popover's top-N. Same shared helper as
  // the macro branch — small bounded read against the per-whale CAGG.
  const topAddrsForRep = topWhaleRows.map((r) => r.whale_addr);
  const repRowsForTop = await queryReputationInputs(sql, topAddrsForRep);
  const repByAddr = new Map<string, number>();
  for (const r of repRowsForTop) {
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
  const topWhales = topWhaleRows
    .map((r) => {
      const addr = r.whale_addr;
      const volume = typeof r.volume_usd === "number" ? r.volume_usd : Number(r.volume_usd);
      return {
        addr,
        alias: whaleAlias(addr),
        color: whaleColor(addr),
        profileImage: whaleAliasInfo(addr)?.profileImage ?? null,
        signals: typeof r.signals === "number" ? r.signals : Number(r.signals),
        volume,
        pnl: r.pnl_usd === null
          ? 0
          : typeof r.pnl_usd === "number"
            ? r.pnl_usd
            : Number(r.pnl_usd),
        score: repByAddr.get(addr) ?? 0,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.volume - a.volume;
    });
  const drillSubcategoryLabel = drillSubcategory
    ? SUBCATEGORY_LABELS[drillSubcategory] ?? drillSubcategory
    : null;
  return {
    ...grid,
    mode: "live" as const,
    subject: "trades" as const,
    trackedWhales,
    drillSubcategory,
    // Display name of the drilled subcategory — surfaced separately so
    // the breadcrumb can show it cleanly even when subcategoryLabels has
    // been re-purposed to hold conditionId→marketQuestion at L3.
    drillSubcategoryLabel,
    // Row-label map: at L2 it's slug→display, at L3 it's
    // conditionId→marketQuestion. Frontend reads it generically as
    // "give me a label for this row key".
    subcategoryLabels: rowLabels,
    // L3 only: conditionId → polymarket event slug for building the
    // public URL on the row label. NULL at L1/L2.
    marketSlugs,
    marketIcons,
    marketQuestions,
    resolvedRows,
    topWhales,
    totals: {
      ...grid.totals,
      uniqueWhales,
      activeWhales: uniqueWhales,
      topWhale,
    },
    metric,
    dataSpan,
  };
}

/** Trim a market question for the L3 row label so it fits a 2-line
 *  clamp. Stages run in order, each one a no-op when its pattern
 *  doesn't match. Full original label is still surfaced via the
 *  `title` attribute on hover.
 *
 *  Universal:
 *    1. drop subcategory prefix ("Bitcoin Up or Down" → "Up or Down")
 *    2. drop leading "Will the " / "Will "
 *    3. drop subcategory prefix again ("Will Bitcoin reach…" → "reach…")
 *    4. drop trailing "?"
 *
 *  Targeted shortenings:
 *    5. "{team} wins (the)? (YEAR)? (LEAGUE)? {Cup|Series|Finals}"
 *       → "{team} · {Cup|Series|Finals}"
 *    6. "Up or Down - {date}, {T1}-{T2} {TZ}"
 *       e.g. "Up or Down - May 3, 3:15PM-3:30PM ET" → "Up/Down 3:15PM–3:30PM"
 *    7. "{highest|lowest} temperature in {City} be {Val} on {Date}"
 *       → "{City} {max|min} {Val} · {Date}"
 */
export function shortenMarketLabel(label: string, subcategoryLabel: string | null): string {
  let out = label.trim();
  const stripPrefix = (s: string, pfx: string): string => {
    const re = new RegExp(`^${pfx.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i");
    return s.replace(re, "");
  };

  // 1-3 — universal prefixes
  if (subcategoryLabel) out = stripPrefix(out, subcategoryLabel);
  out = out.replace(/^Will\s+(the\s+)?/i, "");
  if (subcategoryLabel) out = stripPrefix(out, subcategoryLabel);

  // 5 — league finals / championship / cup
  out = out.replace(
    /^(.+?)\s+wins?\s+(?:the\s+)?(?:\d{4}\s+)?(?:[A-Z]{2,5}\s+)?(Finals?|Championship|Stanley Cup|World Series|World Cup|Super Bowl|Cup|League)\??$/,
    "$1 · $2",
  );

  // 6 — crypto perpetual "Up or Down - <date>, <T1>-<T2> [TZ]"
  out = out.replace(
    /^Up or Down\s*-?\s*(?:[A-Z][a-z]+\s+\d+,?\s*)?(\d{1,2}(?::\d{2})?\s*(?:AM|PM))-(\d{1,2}(?::\d{2})?\s*(?:AM|PM))(?:\s+(?:ET|UTC|GMT|EST|EDT))?\??$/i,
    "Up/Down $1–$2",
  );
  // Single-time variant: "Up or Down - May 3, 2PM ET"
  out = out.replace(
    /^Up or Down\s*-?\s*(?:[A-Z][a-z]+\s+\d+,?\s*)?(\d{1,2}(?::\d{2})?\s*(?:AM|PM))(?:\s+(?:ET|UTC|GMT|EST|EDT))?\??$/i,
    "Up/Down $1",
  );

  // 7 — temperature markets
  out = out.replace(
    /^(highest|lowest)\s+temperature\s+in\s+(.+?)\s+be\s+(.+?)\s+on\s+(.+?)\??$/i,
    (_match, hl: string, city: string, val: string, date: string) =>
      `${city} ${hl.toLowerCase() === "highest" ? "max" : "min"} ${val} · ${date}`,
  );

  // 7b — generic event prefix strip: "{long-preamble}: {actual-content}"
  // → "{actual-content}". Matches any "Tournament, Round: P1 vs P2",
  // "MLB World Series 2026: Yankees in 7 games", "ECB Decision Sept:
  // 25bp hike", etc. — the part before ": " is almost always
  // tournament/event context already shown by the breadcrumb at L3.
  //
  // Safety: requires literal ": " (colon + whitespace), so it won't
  // touch time formats like "3:15PM" (rule 6's output) or fractional-
  // odds notation. Runs AFTER all the targeted shortenings (rules
  // 5/6/7) so those still get their bespoke treatment first.
  out = out.replace(/^[^:]{4,}:\s+(.+)$/, "$1");

  // 8 — football clubs: strip the " FC" / " F.C." suffix from team
  // names ("Manchester City FC win" → "Manchester City win") wherever
  // it appears, not just at the end. Same for ", end in a draw" →
  // " draw".
  out = out.replace(/\s+F\.?C\.?\b/g, "");
  out = out.replace(/\s+end\s+in\s+a\s+draw/i, " draw");

  // 9 — drop redundant "win on YYYY-MM-DD" date when it's today /
  // tomorrow. Most sports markets resolve same-day, so the date is
  // noise.
  const today = new Date().toISOString().slice(0, 10);
  const tomorrowDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  for (const d of [today, tomorrowDate]) {
    out = out.replace(new RegExp(`\\s+on\\s+${d}\\b`, "i"), "");
  }

  // 10 — "Spread: X (-N.N)" → "X -N.N" (the "Spread:" prefix is dead
  // weight — the tooltip section heading and the parenthesized number
  // make it obvious what kind of market this is).
  out = out.replace(/^Spread:\s*(.+?)\s*\(([+-]?\d+(?:\.\d+)?)\)\s*$/, "$1 $2");

  // 4 — trailing "?"
  out = out.replace(/\?\s*$/, "");
  return out.length > 0 ? out : label;
}

import type { Sql } from "postgres";

import { CATEGORIES, type Category } from "./categorize";
import { subcategoriesOf } from "./subcategorize";

// ─── Range definitions ───────────────────────────────────────────────────────
//
// Every range has exactly 12 buckets — same grid shape across the UI, just
// different bucket sizes. Ranges that span >1 day query the signals_hourly
// continuous aggregate (pre-computed); 1h queries raw signals.

export type HeatmapRange = "1h" | "24h" | "12d" | "12w";
export type HeatmapMetric = "signals" | "volume" | "pnl" | "winrate";

type RangeConfig = {
  /** Width of each grid bucket */
  bucketMinutes: number;
  /** Total visible window = bucketMinutes × 12 */
  windowMinutes: number;
  /** Always 12 — kept for clarity at call sites */
  slots: number;
  /** Which storage layer to query for this range */
  source: "raw" | "hourly_agg";
};

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export const RANGE_CONFIG: Readonly<Record<HeatmapRange, RangeConfig>> = Object.freeze({
  "1h":  { bucketMinutes: 5 * MIN,  windowMinutes: 60 * MIN,    slots: 12, source: "raw"        },
  "24h": { bucketMinutes: 2 * HOUR, windowMinutes: 24 * HOUR,   slots: 12, source: "hourly_agg" },
  "12d": { bucketMinutes: 1 * DAY,  windowMinutes: 12 * DAY,    slots: 12, source: "hourly_agg" },
  "12w": { bucketMinutes: 1 * WEEK, windowMinutes: 12 * WEEK,   slots: 12, source: "hourly_agg" },
});

// ─── Macro view ──────────────────────────────────────────────────────────────
// Macro mode trades fine-grained "now" focus for a wider span. Two
// configurations:
//
//   hour-week → 1h bucket × 7d window = 168 cells
//                Best for "what hours of which days were hot in the past
//                week". Day-of-week + time-of-day patterns pop visually.
//
//   day-12w   → 1d bucket × 12w window = 84 cells
//                Best for "macro trend over a quarter" — month-level
//                seasonality, multi-week PnL waves, single hot weeks.
//
// Both stream from signals_hourly. day-12w re-buckets to 1-day; the cost
// of re-bucketing 84 days × 9 cats = 756 rows is negligible.
export type MacroKind = "hour-week" | "day-12w";
export const MACRO_CONFIG: Readonly<Record<MacroKind, RangeConfig>> = Object.freeze({
  "hour-week": {
    bucketMinutes: 1 * HOUR,
    windowMinutes: 7 * DAY,
    slots: 168,
    source: "hourly_agg",
  },
  "day-12w": {
    bucketMinutes: 1 * DAY,
    windowMinutes: 12 * WEEK,
    slots: 84,
    source: "hourly_agg",
  },
});

// ─── Wire types ──────────────────────────────────────────────────────────────

export type MarketSummary = {
  conditionId: string;
  marketQuestion: string | null;
  /** Polymarket event slug for the public URL. NULL for legacy rows that
   *  predate slug capture. */
  marketSlug: string | null;
  /** Polymarket-hosted thumbnail. NULL on legacy rows. */
  marketIcon: string | null;
  count: number;
  volume: number;
  pnl: number;
  winRate: number | null;
  /** Unique top-corpus whales who traded this market in this bucket. The
   *  convergence indicator at market level. */
  uniqueWhales: number;
};

export type HeatmapCell = {
  count: number;
  /** USD entered (BUY only). */
  volume: number;
  /** Sum of realized PnL on exits (SELL or SETTLEMENT) in this cell. */
  pnl: number;
  /** Wins / total exits. null when there are no exits in this cell. */
  winRate: number | null;
  uniqueWhales: number;
  /** Top markets in this cell sorted by signal count (server-side). UI re-sorts
   *  client-side by the active metric and slices to top-5. Empty for ranges
   *  whose source is not `raw` (24h/12d/12w) — too expensive to scan. */
  markets: MarketSummary[];
  /** Top whales by USD volume in this cell. Empty for the same heavy ranges
   *  as `markets`. UI surfaces clickable rows that open the whale drawer. */
  topWhales: WhaleSummary[];
  /** PATTERN-only — full-window cycle averages. The cell's main fields
   *  carry the most-recent cycle's value (the headline number); this
   *  block carries the average across all cycles in the lookback so
   *  Cell.tsx can render the avg in the delta paren. */
  full?: {
    count: number;
    volume: number;
    pnl: number;
    winRate: number | null;
    uniqueWhales: number;
  };
  /** PATTERN-only — current minus avg per metric. Drives the ▲/▼
   *  arrow + sign-coloured paren under the headline. */
  delta?: {
    count: number;
    volume: number;
    pnl: number;
    winRate: number | null;
    uniqueWhales: number;
  };
  /** PATTERN-only — number of cycles aggregated (e.g. 30 for HOUR-of-day,
   *  12 for DOW). Surfaced in the cell tooltip to communicate the
   *  reliability of the avg. */
  sampleCount?: number;
};

export type WhaleSummary = {
  addr: string;
  signals: number;
  volume: number;
  pnl: number;
  /** wins / (wins + losses) for trades that closed in this cell. NULL when
   *  no closed trades — typical for active markets. */
  winRate: number | null;
  /** Raw wins/losses counts so the UI can show sample size next to the
   *  winRate ("5/5 100%" reads honestly; "155× tr 100%" was misleading
   *  because most of those trades were unmatched BUYs). */
  wins: number;
  losses: number;
};

export type HeatmapTotals = {
  signals: number;
  volume: number;
  pnl: number;
  winRate: number | null;
  uniqueWhales: number;
  activeWhales: number;
  topCategory: Category | null;
  topWhale: { addr: string; alias: string; color: string } | null;
};

export type HeatmapResponse = {
  generatedAt: string;
  range: HeatmapRange;
  windowEnd: string;
  windowStart: string;
  windowMinutes: number;
  bucketMinutes: number;
  /** When non-null, this response is a drill-down view of `drillCategory` —
   *  `categories` are subcategory slugs, not the 9 top-level buckets. */
  drillCategory: Category | null;
  categories: ReadonlyArray<string>;
  buckets: ReadonlyArray<{ ts: string; index: number }>;
  cells: Record<string, ReadonlyArray<HeatmapCell>>;
  totals: HeatmapTotals;
  /** Whales-mode only — display metadata for each whale-keyed row.
   *  In other modes rows are categories / subcategories / markets and
   *  the UI renders them via categoryMeta lookups. Whale addresses
   *  aren't in that map, so the API ships per-whale meta inline. */
  whaleMeta?: Record<
    string,
    {
      alias: string;
      color: string;
      profileImage: string | null;
    }
  >;
};

// ─── DB row shapes ───────────────────────────────────────────────────────────

type AggRow = {
  bucket: string;
  category: string;
  signal_count: string | number;
  buy_volume_usd: string | number;
  realized_pnl_sum: string | number | null;
  /** wins = exits with realized_pnl > 0 */
  win_count: string | number;
  /** losses = exits with realized_pnl < 0 */
  loss_count: string | number;
  unique_whales: string | number;
};

type MarketRow = {
  bucket: string;
  category: string;
  condition_id: string;
  market_question: string | null;
  market_slug: string | null;
  market_icon: string | null;
  signals: string | number;
  volume_usd: string | number;
  pnl_usd: string | number | null;
  win_count: string | number;
  loss_count: string | number;
  unique_whales: string | number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ZERO_CELL: HeatmapCell = Object.freeze({
  count: 0,
  volume: 0,
  pnl: 0,
  winRate: null,
  uniqueWhales: 0,
  markets: [],
  topWhales: [],
});

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toCategory(raw: string): Category {
  return (CATEGORIES as ReadonlyArray<string>).includes(raw) ? (raw as Category) : "Other";
}

/**
 * Wall-clock-aligned bucket starts (e.g. for 5-min granularity: 11:25, 11:30,
 * ..., 12:20). Latest bucket is the one containing `now`. Returns N buckets in
 * ascending order.
 */
export function buildBuckets(
  now: Date,
  bucketMinutes: number,
  slotCount: number,
): ReadonlyArray<{ ts: string; index: number }> {
  const bucketMs = bucketMinutes * 60_000;
  const nowMs = now.getTime();
  const latestBucketStart = Math.floor(nowMs / bucketMs) * bucketMs;
  const out: Array<{ ts: string; index: number }> = [];
  for (let i = slotCount - 1; i >= 0; i--) {
    const ts = new Date(latestBucketStart - i * bucketMs).toISOString();
    out.push({ ts, index: slotCount - 1 - i });
  }
  return out;
}

// ─── Pure assembler ──────────────────────────────────────────────────────────

export type AssembleOptions = {
  /** Row keys for the grid. Defaults to CATEGORIES (top-level view). In
   *  drill mode, pass the subcategory slugs for the chosen bucket. */
  rowKeys?: ReadonlyArray<string>;
  /** Non-null in drill mode — propagated to the response so the UI can
   *  render the breadcrumb. Doesn't affect aggregation. */
  drillCategory?: Category | null;
};

export function assembleHeatmap(
  aggRows: ReadonlyArray<AggRow>,
  marketRows: ReadonlyArray<MarketRow>,
  buckets: ReadonlyArray<{ ts: string; index: number }>,
  range: HeatmapRange,
  now: Date,
  options: AssembleOptions = {},
  whaleRows: ReadonlyArray<WhaleCellRow> = [],
): HeatmapResponse {
  const cfg = RANGE_CONFIG[range];
  const slotCount = buckets.length;
  const drillCategory = options.drillCategory ?? null;
  const isDrill = drillCategory !== null;
  const rowKeys = options.rowKeys ?? CATEGORIES;
  const rowKeySet = new Set(rowKeys);

  // Init zero grid
  const cells = Object.fromEntries(
    rowKeys.map((k) => [
      k,
      Array.from({ length: slotCount }, (): HeatmapCell => ({ ...ZERO_CELL, markets: [], topWhales: [] })),
    ]),
  ) as Record<string, HeatmapCell[]>;

  const bucketIndex = new Map(buckets.map((b) => [b.ts, b.index]));

  // In top-level mode, unknown categories fall into "Other". In drill mode we
  // simply drop rows whose key is not in the provided rowKeys (no catch-all).
  function pickRowKey(raw: string): string | null {
    if (rowKeySet.has(raw)) return raw;
    if (!isDrill && rowKeySet.has("Other")) return "Other";
    return null;
  }

  // Aggregate metrics. Win rate denominator = wins + losses (excludes
  // breakeven exits where realized_pnl == 0; rare but possible especially
  // for SETTLEMENT rows where avg_entry coincides with payout).
  let totalSignals = 0;
  let totalVolume = 0;
  let totalPnl = 0;
  let totalWins = 0;
  let totalLosses = 0;
  const perRowCount = new Map<string, number>();

  for (const r of aggRows) {
    const key = pickRowKey(r.category);
    if (key === null) continue;
    const idx = bucketIndex.get(r.bucket);
    if (idx === undefined) continue;
    const count = num(r.signal_count);
    const volume = num(r.buy_volume_usd);
    const pnl = num(r.realized_pnl_sum);
    const wins = num(r.win_count);
    const losses = num(r.loss_count);
    const unique = num(r.unique_whales);

    const cell = cells[key]?.[idx];
    if (!cell) continue;
    cell.count += count;
    cell.volume += volume;
    cell.pnl += pnl;
    cell.uniqueWhales += unique;
    const decided = wins + losses;
    if (decided > 0) {
      cell.winRate = wins / decided;
    }

    totalSignals += count;
    totalVolume += volume;
    totalPnl += pnl;
    totalWins += wins;
    totalLosses += losses;
    perRowCount.set(key, (perRowCount.get(key) ?? 0) + count);
  }

  // Markets — already sliced to top-N per (rowKey, bucket) by SQL, ordered by
  // signal count desc. UI re-sorts by active metric and slices to top-5.
  for (const m of marketRows) {
    const key = pickRowKey(m.category);
    if (key === null) continue;
    const idx = bucketIndex.get(m.bucket);
    if (idx === undefined) continue;
    const cell = cells[key]?.[idx];
    if (!cell) continue;
    const wins = num(m.win_count);
    const losses = num(m.loss_count);
    const decided = wins + losses;
    cell.markets.push({
      conditionId: m.condition_id,
      marketQuestion: m.market_question,
      marketSlug: m.market_slug,
      marketIcon: m.market_icon,
      count: num(m.signals),
      volume: num(m.volume_usd),
      pnl: num(m.pnl_usd),
      winRate: decided > 0 ? wins / decided : null,
      uniqueWhales: num(m.unique_whales),
    });
  }

  // Top whales per cell — same shape as markets, ordered by USD volume desc.
  for (const w of whaleRows) {
    const key = pickRowKey(w.category);
    if (key === null) continue;
    const idx = bucketIndex.get(w.bucket);
    if (idx === undefined) continue;
    const cell = cells[key]?.[idx];
    if (!cell) continue;
    const wins = num(w.wins);
    const losses = num(w.losses);
    const decided = wins + losses;
    cell.topWhales.push({
      addr: w.whale_addr,
      signals: num(w.signals),
      volume: num(w.volume_usd),
      pnl: num(w.pnl_usd),
      winRate: decided > 0 ? wins / decided : null,
      wins,
      losses,
    });
  }

  // Top category — only meaningful at the top level. In drill mode there's no
  // sensible single-bucket "top category" (we're already inside one), so we
  // leave it null to avoid misleading the UI.
  let topCategory: Category | null = null;
  if (!isDrill) {
    let topCount = 0;
    for (const [key, count] of perRowCount) {
      if (count > topCount) {
        topCount = count;
        topCategory = toCategory(key);
      }
    }
  }

  return {
    generatedAt: now.toISOString(),
    range,
    windowEnd: buckets[buckets.length - 1]?.ts ?? now.toISOString(),
    windowStart: buckets[0]?.ts ?? now.toISOString(),
    windowMinutes: cfg.windowMinutes,
    bucketMinutes: cfg.bucketMinutes,
    drillCategory,
    categories: rowKeys,
    buckets,
    cells,
    totals: {
      signals: totalSignals,
      volume: totalVolume,
      pnl: totalPnl,
      winRate: totalWins + totalLosses > 0 ? totalWins / (totalWins + totalLosses) : null,
      uniqueWhales: 0, // filled by API layer (DISTINCT across whole window)
      activeWhales: 0, // same
      topCategory,
      topWhale: null, // filled by API layer
    },
  };
}

// ─── DB queries ──────────────────────────────────────────────────────────────

/**
 * Per (bucket, category): count, BUY USD volume, sum of realized PnL on exits,
 * win/loss counts, unique whales touching the cell.
 *
 * Volume includes BUY only — entry-side money flow ("smart money entering").
 * PnL/winrate operate on rows where realized_pnl IS NOT NULL — i.e. SELLs and
 * SETTLEMENTS where we knew the entry price.
 *
 * For 1h we hit raw signals; for ≥24h we re-bucket the signals_hourly
 * continuous aggregate so we don't scan millions of raw rows per query.
 */
export async function queryHeatmapAggRows(
  sql: Sql,
  range: HeatmapRange,
  drillCategory: Category | null = null,
  drillSubcategory: string | null = null,
): Promise<ReadonlyArray<AggRow>> {
  const cfg = RANGE_CONFIG[range];
  const bucketInterval = `${cfg.bucketMinutes} minutes`;
  const windowInterval = `${cfg.windowMinutes} minutes`;

  // In drill mode we always read from raw signals — the hourly agg only
  // groups by category, not subcategory, so it's useless here. For 24h+ this
  // is more expensive but acceptable: the user only drills into one category
  // at a time, narrowing the row set substantially via the WHERE filter.
  const useRaw = cfg.source === "raw" || drillCategory !== null;

  if (useRaw) {
    // L3: drilled into (category, subcategory) → rows are individual markets.
    // The row key is condition_id; the API layer turns those into labels via
    // the freshest known market_question for each one.
    if (drillCategory !== null && drillSubcategory !== null) {
      const rows = await sql<AggRow[]>`
        SELECT
          to_char(time_bucket(${bucketInterval}::interval, ts) AT TIME ZONE 'UTC',
                  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS bucket,
          condition_id                                                  AS category,
          COUNT(*)::bigint                                              AS signal_count,
          COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)    AS buy_volume_usd,
          COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS realized_pnl_sum,
          COUNT(*) FILTER (WHERE realized_pnl > 0)::bigint              AS win_count,
          COUNT(*) FILTER (WHERE realized_pnl < 0)::bigint              AS loss_count,
          COUNT(DISTINCT whale_addr)::bigint                            AS unique_whales
        FROM signals
        WHERE ts >= NOW() - (${windowInterval}::interval) AND ts <= NOW()
          AND category = ${drillCategory}
          AND subcategory = ${drillSubcategory}
          AND condition_id IS NOT NULL
        GROUP BY bucket, condition_id
        ORDER BY bucket
      `;
      return rows;
    }
    if (drillCategory !== null) {
      const rows = await sql<AggRow[]>`
        SELECT
          to_char(time_bucket(${bucketInterval}::interval, ts) AT TIME ZONE 'UTC',
                  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS bucket,
          subcategory                                                   AS category,
          COUNT(*)::bigint                                              AS signal_count,
          COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)    AS buy_volume_usd,
          COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS realized_pnl_sum,
          COUNT(*) FILTER (WHERE realized_pnl > 0)::bigint              AS win_count,
          COUNT(*) FILTER (WHERE realized_pnl < 0)::bigint              AS loss_count,
          COUNT(DISTINCT whale_addr)::bigint                            AS unique_whales
        FROM signals
        WHERE ts >= NOW() - (${windowInterval}::interval) AND ts <= NOW()
          AND category = ${drillCategory}
          AND subcategory IS NOT NULL
        GROUP BY bucket, subcategory
        ORDER BY bucket
      `;
      return rows;
    }
    const rows = await sql<AggRow[]>`
      SELECT
        to_char(time_bucket(${bucketInterval}::interval, ts) AT TIME ZONE 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS bucket,
        category,
        COUNT(*)::bigint                                              AS signal_count,
        COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)    AS buy_volume_usd,
        COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS realized_pnl_sum,
        COUNT(*) FILTER (WHERE realized_pnl > 0)::bigint              AS win_count,
        COUNT(*) FILTER (WHERE realized_pnl < 0)::bigint              AS loss_count,
        COUNT(DISTINCT whale_addr)::bigint                            AS unique_whales
      FROM signals
      WHERE ts >= NOW() - (${windowInterval}::interval) AND ts <= NOW()
      GROUP BY bucket, category
      ORDER BY bucket
    `;
    return rows;
  }

  // hourly_agg: re-bucket signals_hourly into the requested grid bucket.
  // unique_whales here is approximate (sums across hourly buckets, may
  // double-count cross-hour activity). Acceptable for MVP — flagged.
  const rows = await sql<AggRow[]>`
    SELECT
      to_char(time_bucket(${bucketInterval}::interval, bucket) AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS bucket,
      category,
      COALESCE(SUM(signal_count), 0)::bigint           AS signal_count,
      COALESCE(SUM(buy_volume_usd), 0)                 AS buy_volume_usd,
      COALESCE(SUM(realized_pnl_sum), 0)               AS realized_pnl_sum,
      COALESCE(SUM(win_count), 0)::bigint              AS win_count,
      COALESCE(SUM(loss_count), 0)::bigint             AS loss_count,
      COALESCE(SUM(unique_whales), 0)::bigint          AS unique_whales
    FROM signals_hourly
    WHERE bucket >= NOW() - (${windowInterval}::interval) AND bucket <= NOW()
    GROUP BY 1, category
    ORDER BY 1
  `;
  return rows;
}

/**
 * Whales-subject aggregation. Same time grid as LIVE (4 ranges × 12
 * buckets), but rows are the top-N whale addresses ranked by 90-day
 * realized PnL — closest SQL approximation of the JS `computeReputation`
 * formula in whale-profile.ts (which combines PnL + winRate +
 * sample-confidence trust factor). Min 5 trades over 90d filters out
 * the noisy long-tail. Aggregates from raw signals (CAGG doesn't
 * carry whale_addr).
 */
const WHALES_TOP_N = 50;
const WHALES_REPUTATION_LOOKBACK_DAYS = 90;
const WHALES_MIN_TRADES = 5;

/** Top-N whales for any whales-subject heatmap. Single ranking
 *  query so live / pattern / macro all share the same row set.
 *  Process-level cache + background refresh keeps the cost off the
 *  hot heatmap-request path — the underlying 90d scan over signals
 *  costs 1-3 seconds, refreshing it once every 10 minutes is fine
 *  because reputation moves on a daily scale. */
const TOP_WHALES_TTL_MS = 10 * 60_000;
type CachedTopWhales = { value: ReadonlyArray<string>; ts: number };
let topWhalesCache: CachedTopWhales | null = null;
let topWhalesInflight: Promise<ReadonlyArray<string>> | null = null;

export async function queryTopWhalesByReputation(
  sql: Sql,
): Promise<ReadonlyArray<string>> {
  const now = Date.now();
  // Fresh cache → return synchronously, no DB hit at all.
  if (topWhalesCache && now - topWhalesCache.ts < TOP_WHALES_TTL_MS) {
    return topWhalesCache.value;
  }
  // Refresh inflight → coalesce — multiple parallel whales requests
  // share one DB call instead of stampeding the same query.
  if (topWhalesInflight) return topWhalesInflight;

  // If we have ANY stale value, return it immediately and refresh in
  // the background (stale-while-revalidate). Only the very first
  // cold request blocks on the DB.
  const fetchFresh = async (): Promise<ReadonlyArray<string>> => {
    type AddrRow = { whale_addr: string };
    const rows = await sql<AddrRow[]>`
      SELECT whale_addr
      FROM signals
      WHERE ts >= NOW() - (${`${WHALES_REPUTATION_LOOKBACK_DAYS} days`}::interval)
        AND ts <= NOW()
        AND whale_addr ~ '^0x[0-9a-f]{40}$'
      GROUP BY whale_addr
      HAVING COUNT(*) >= ${WHALES_MIN_TRADES}
      ORDER BY COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) DESC
      LIMIT ${WHALES_TOP_N}
    `;
    const value = rows.map((r) => r.whale_addr);
    topWhalesCache = { value, ts: Date.now() };
    return value;
  };

  topWhalesInflight = fetchFresh().finally(() => {
    topWhalesInflight = null;
  });

  if (topWhalesCache) {
    // Stale but usable — kick off the refresh and return immediately.
    void topWhalesInflight;
    return topWhalesCache.value;
  }
  return topWhalesInflight;
}

export async function queryWhalesAggRows(
  sql: Sql,
  range: HeatmapRange,
  topAddrs?: ReadonlyArray<string>,
): Promise<{ rows: ReadonlyArray<AggRow>; topAddrs: ReadonlyArray<string> }> {
  const cfg = RANGE_CONFIG[range];
  const bucketInterval = `${cfg.bucketMinutes} minutes`;
  const windowInterval = `${cfg.windowMinutes} minutes`;
  const addrs = topAddrs ?? (await queryTopWhalesByReputation(sql));
  if (addrs.length === 0) return { rows: [], topAddrs: addrs };

  // Second pass — per (whale, bucket) aggregation, scoped to the
  // top-N set so the cardinality stays bounded.
  const rows = await sql<AggRow[]>`
    SELECT
      to_char(time_bucket(${bucketInterval}::interval, ts) AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS bucket,
      whale_addr                                                    AS category,
      COUNT(*)::bigint                                              AS signal_count,
      COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)    AS buy_volume_usd,
      COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS realized_pnl_sum,
      COUNT(*) FILTER (WHERE realized_pnl > 0)::bigint              AS win_count,
      COUNT(*) FILTER (WHERE realized_pnl < 0)::bigint              AS loss_count,
      1::bigint                                                      AS unique_whales
    FROM signals
    WHERE ts >= NOW() - (${windowInterval}::interval) AND ts <= NOW()
      AND whale_addr = ANY(${addrs as string[]}::text[])
    GROUP BY bucket, whale_addr
    ORDER BY bucket
  `;
  return { rows, topAddrs: addrs };
}

/**
 * Whales × MACRO aggregation. Same time grid as MACRO (168 hour buckets
 * over 7d, or 84 day buckets over 12w), per (whale_addr, bucket).
 * Reuses the top-50 candidate set from queryWhalesAggRows-style
 * 90-day reputation ranking — passed in by the caller so the API
 * branch can share one ranking query across pattern / live / macro.
 */
export async function queryWhalesMacroAggRows(
  sql: Sql,
  macroKind: MacroKind,
  topAddrs: ReadonlyArray<string>,
): Promise<ReadonlyArray<AggRow>> {
  if (topAddrs.length === 0) return [];
  const cfg = MACRO_CONFIG[macroKind];
  const bucketInterval = `${cfg.bucketMinutes} minutes`;
  const windowInterval = `${cfg.windowMinutes} minutes`;
  return sql<AggRow[]>`
    SELECT
      to_char(time_bucket(${bucketInterval}::interval, ts) AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS bucket,
      whale_addr                                                    AS category,
      COUNT(*)::bigint                                              AS signal_count,
      COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)    AS buy_volume_usd,
      COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS realized_pnl_sum,
      COUNT(*) FILTER (WHERE realized_pnl > 0)::bigint              AS win_count,
      COUNT(*) FILTER (WHERE realized_pnl < 0)::bigint              AS loss_count,
      1::bigint                                                      AS unique_whales
    FROM signals
    WHERE ts >= NOW() - (${windowInterval}::interval) AND ts <= NOW()
      AND whale_addr = ANY(${topAddrs as string[]}::text[])
    GROUP BY bucket, whale_addr
    ORDER BY bucket
  `;
}

/**
 * Whales × PATTERN aggregation. Per (whale_addr, slot) where slot is
 *   - hour-of-day → UTC hour / 2 (12 slots, 0..11)
 *   - day-of-week → JS dow (0..6, Sun=0)
 *
 * Returns rich rows with BOTH the most-recent-cycle value (`current_*`,
 * what the cell shows as the headline number) and the cycle-averaged
 * baseline (`avg_*`, surfaced in cell.full + cell.delta computation).
 * Mirrors the trades-pattern shape so Cell.tsx can render the same
 * arrow + delta paren UX for whales rows.
 */
export type WhalesPatternRow = {
  slot: number;
  whale_addr: string;
  current_count: number;
  current_volume: number;
  current_pnl: number;
  current_wins: number;
  current_losses: number;
  avg_count: number;
  avg_volume: number;
  avg_pnl: number;
  total_wins: number;
  total_losses: number;
  sample_count: number;
};

export async function queryWhalesPatternAggRows(
  sql: Sql,
  kind: "hour-of-day" | "day-of-week",
  topAddrs: ReadonlyArray<string>,
  lookbackDays = 90,
): Promise<ReadonlyArray<WhalesPatternRow>> {
  if (topAddrs.length === 0) return [];
  const slotExpr =
    kind === "hour-of-day"
      ? sql`(EXTRACT(hour FROM ts AT TIME ZONE 'UTC')::int / 2)`
      : sql`EXTRACT(dow FROM ts AT TIME ZONE 'UTC')::int`;
  type DbRow = {
    whale_addr: string;
    slot: number | string;
    current_count: number | string | null;
    current_volume: number | string | null;
    current_pnl: number | string | null;
    current_wins: number | string | null;
    current_losses: number | string | null;
    avg_count: number | string;
    avg_volume: number | string;
    avg_pnl: number | string;
    total_wins: number | string;
    total_losses: number | string;
    sample_count: number | string;
  };
  const rows = await sql<DbRow[]>`
    WITH per_whale_cycle AS (
      SELECT
        whale_addr,
        ${kind === "hour-of-day"
          ? sql`DATE_TRUNC('day', ts AT TIME ZONE 'UTC')`
          : sql`DATE_TRUNC('week', ts AT TIME ZONE 'UTC')`} AS cycle,
        ${slotExpr} AS slot,
        COUNT(*)::bigint                                              AS slot_count,
        COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)    AS slot_volume,
        COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS slot_pnl,
        COUNT(*) FILTER (WHERE realized_pnl > 0)::bigint              AS slot_wins,
        COUNT(*) FILTER (WHERE realized_pnl < 0)::bigint              AS slot_losses
      FROM signals
      WHERE ts >= NOW() - (${`${lookbackDays} days`}::interval)
        AND ts <= NOW()
        AND whale_addr = ANY(${topAddrs as string[]}::text[])
      GROUP BY whale_addr, cycle, slot
    ),
    ranked AS (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY whale_addr, slot ORDER BY cycle DESC) AS rn
      FROM per_whale_cycle
    )
    SELECT
      whale_addr,
      slot::int                                          AS slot,
      MAX(slot_count)  FILTER (WHERE rn = 1)             AS current_count,
      MAX(slot_volume) FILTER (WHERE rn = 1)             AS current_volume,
      MAX(slot_pnl)    FILTER (WHERE rn = 1)             AS current_pnl,
      MAX(slot_wins)   FILTER (WHERE rn = 1)             AS current_wins,
      MAX(slot_losses) FILTER (WHERE rn = 1)             AS current_losses,
      AVG(slot_count)::numeric                            AS avg_count,
      AVG(slot_volume)::numeric                           AS avg_volume,
      AVG(slot_pnl)::numeric                              AS avg_pnl,
      SUM(slot_wins)::bigint                              AS total_wins,
      SUM(slot_losses)::bigint                            AS total_losses,
      COUNT(*)::bigint                                    AS sample_count
    FROM ranked
    GROUP BY whale_addr, slot
  `;
  return rows.map((r) => ({
    whale_addr: r.whale_addr,
    slot: Number(r.slot),
    current_count: r.current_count === null ? 0 : Number(r.current_count),
    current_volume: r.current_volume === null ? 0 : Number(r.current_volume),
    current_pnl: r.current_pnl === null ? 0 : Number(r.current_pnl),
    current_wins: r.current_wins === null ? 0 : Number(r.current_wins),
    current_losses: r.current_losses === null ? 0 : Number(r.current_losses),
    avg_count: Number(r.avg_count),
    avg_volume: Number(r.avg_volume),
    avg_pnl: Number(r.avg_pnl),
    total_wins: Number(r.total_wins),
    total_losses: Number(r.total_losses),
    sample_count: Number(r.sample_count),
  }));
}

/**
 * Macro-mode aggregation. Two configurations:
 *   hour-week → 1h × 7d (168 buckets)
 *   day-12w   → 1d × 12w (84 buckets)
 * Both stream from signals_hourly. hour-week reads it 1:1 (no
 * re-bucketing); day-12w re-buckets to 1-day. Drill modes fall back to
 * raw signals because the CAGG doesn't carry subcategory / condition_id.
 */
export async function queryMacroAggRows(
  sql: Sql,
  macroKind: MacroKind,
  drillCategory: Category | null = null,
  drillSubcategory: string | null = null,
): Promise<ReadonlyArray<AggRow>> {
  const cfg = MACRO_CONFIG[macroKind];
  const windowInterval = `${cfg.windowMinutes} minutes`;
  const bucketInterval = `${cfg.bucketMinutes} minutes`;

  // L3 drill: per-market.
  if (drillCategory !== null && drillSubcategory !== null) {
    const rows = await sql<AggRow[]>`
      SELECT
        to_char(time_bucket(${bucketInterval}::interval, ts) AT TIME ZONE 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS bucket,
        condition_id                                                  AS category,
        COUNT(*)::bigint                                              AS signal_count,
        COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)    AS buy_volume_usd,
        COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS realized_pnl_sum,
        COUNT(*) FILTER (WHERE realized_pnl > 0)::bigint              AS win_count,
        COUNT(*) FILTER (WHERE realized_pnl < 0)::bigint              AS loss_count,
        COUNT(DISTINCT whale_addr)::bigint                            AS unique_whales
      FROM signals
      WHERE ts >= NOW() - (${windowInterval}::interval) AND ts <= NOW()
        AND category = ${drillCategory}
        AND subcategory = ${drillSubcategory}
        AND condition_id IS NOT NULL
      GROUP BY bucket, condition_id
      ORDER BY bucket
    `;
    return rows;
  }
  // L2 drill: per-subcategory.
  if (drillCategory !== null) {
    const rows = await sql<AggRow[]>`
      SELECT
        to_char(time_bucket(${bucketInterval}::interval, ts) AT TIME ZONE 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS bucket,
        subcategory                                                   AS category,
        COUNT(*)::bigint                                              AS signal_count,
        COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)    AS buy_volume_usd,
        COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS realized_pnl_sum,
        COUNT(*) FILTER (WHERE realized_pnl > 0)::bigint              AS win_count,
        COUNT(*) FILTER (WHERE realized_pnl < 0)::bigint              AS loss_count,
        COUNT(DISTINCT whale_addr)::bigint                            AS unique_whales
      FROM signals
      WHERE ts >= NOW() - (${windowInterval}::interval) AND ts <= NOW()
        AND category = ${drillCategory}
        AND subcategory IS NOT NULL
      GROUP BY bucket, subcategory
      ORDER BY bucket
    `;
    return rows;
  }
  // L1: top-level. signals_hourly used as the source for both kinds —
  // hour-week reads it 1:1, day-12w re-buckets to 1-day. SUM() is safe
  // for count/volume/pnl; unique_whales summed across hour-buckets is
  // approximate (may double-count cross-hour activity), acceptable for
  // a density-mode visualisation.
  if (macroKind === "hour-week") {
    const rows = await sql<AggRow[]>`
      SELECT
        to_char(bucket AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS bucket,
        category,
        signal_count,
        buy_volume_usd,
        realized_pnl_sum,
        win_count,
        loss_count,
        unique_whales
      FROM signals_hourly
      WHERE bucket >= NOW() - (${windowInterval}::interval) AND bucket <= NOW()
      ORDER BY bucket
    `;
    return rows;
  }
  // day-12w: re-bucket to 1-day chunks.
  const rows = await sql<AggRow[]>`
    SELECT
      to_char(time_bucket(${bucketInterval}::interval, bucket) AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS bucket,
      category,
      COALESCE(SUM(signal_count), 0)::bigint           AS signal_count,
      COALESCE(SUM(buy_volume_usd), 0)                 AS buy_volume_usd,
      COALESCE(SUM(realized_pnl_sum), 0)               AS realized_pnl_sum,
      COALESCE(SUM(win_count), 0)::bigint              AS win_count,
      COALESCE(SUM(loss_count), 0)::bigint             AS loss_count,
      COALESCE(SUM(unique_whales), 0)::bigint          AS unique_whales
    FROM signals_hourly
    WHERE bucket >= NOW() - (${windowInterval}::interval) AND bucket <= NOW()
    GROUP BY 1, category
    ORDER BY 1
  `;
  return rows;
}

/**
 * Top-N markets per (category, bucket), grouped by condition_id, ordered by
 * signal count. The UI re-sorts these client-side by the active metric and
 * shows top-5 — so we send a few extras (default 10) to allow re-ranking
 * without a refetch when the user switches tabs.
 *
 * Only computed for `raw` source ranges (1h). For 24h/12d/12w we'd have to
 * scan millions of rows grouped by condition_id; not worth the latency for
 * MVP. Tooltip just shows aggregate metrics without the markets section
 * for those ranges.
 */
export async function queryTopMarketsPerCell(
  sql: Sql,
  range: HeatmapRange,
  perCellLimit: number,
  drillCategory: Category | null = null,
): Promise<ReadonlyArray<MarketRow>> {
  const cfg = RANGE_CONFIG[range];
  // Always scan raw signals (the hourly continuous aggregate doesn't carry
  // condition_id). For top-level views we cap at 24h — 12d/12w would mean
  // multi-million-row scans per request. Drill mode keeps it on for all
  // ranges since the WHERE category=X filter narrows the scan substantially.
  const heavy = range === "12d" || range === "12w";
  if (heavy && drillCategory === null) return [];

  const bucketInterval = `${cfg.bucketMinutes} minutes`;
  const windowInterval = `${cfg.windowMinutes} minutes`;

  if (drillCategory !== null) {
    const rows = await sql<MarketRow[]>`
      WITH per_market AS (
        SELECT
          time_bucket(${bucketInterval}::interval, ts)                          AS bucket_ts,
          subcategory                                                           AS category,
          condition_id,
          MAX(market_question)                                                  AS market_question,
          MAX(market_slug)                                                      AS market_slug,
          MAX(market_icon)                                                      AS market_icon,
          COUNT(*)::bigint                                                      AS signals,
          COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)            AS volume_usd,
          COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS pnl_usd,
          COUNT(*) FILTER (WHERE realized_pnl > 0)::bigint                      AS win_count,
          COUNT(*) FILTER (WHERE realized_pnl < 0)::bigint                      AS loss_count,
          COUNT(DISTINCT whale_addr)::bigint                                    AS unique_whales
        FROM signals
        WHERE ts >= NOW() - (${windowInterval}::interval) AND ts <= NOW()
          AND category = ${drillCategory}
          AND subcategory IS NOT NULL
          AND condition_id IS NOT NULL
        GROUP BY bucket_ts, subcategory, condition_id
      ),
      ranked AS (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY category, bucket_ts ORDER BY signals DESC) AS rn_signals,
          ROW_NUMBER() OVER (PARTITION BY category, bucket_ts ORDER BY volume_usd DESC) AS rn_volume,
          ROW_NUMBER() OVER (PARTITION BY category, bucket_ts ORDER BY pnl_usd DESC NULLS LAST) AS rn_pnl_winner,
          ROW_NUMBER() OVER (PARTITION BY category, bucket_ts ORDER BY pnl_usd ASC NULLS LAST) AS rn_pnl_loser
        FROM per_market
      )
      SELECT
        to_char(bucket_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS bucket,
        category, condition_id, market_question, market_slug, market_icon, signals, volume_usd, pnl_usd, win_count, loss_count, unique_whales
      FROM ranked
      WHERE rn_signals <= ${perCellLimit}
         OR rn_volume <= 5
         OR rn_pnl_winner <= 5
         OR rn_pnl_loser <= 5
    `;
    return rows;
  }

  const rows = await sql<MarketRow[]>`
    WITH per_market AS (
      SELECT
        time_bucket(${bucketInterval}::interval, ts)                          AS bucket_ts,
        category,
        condition_id,
        MAX(market_question)                                                  AS market_question,
        MAX(market_slug)                                                      AS market_slug,
        MAX(market_icon)                                                      AS market_icon,
        COUNT(*)::bigint                                                      AS signals,
        COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)            AS volume_usd,
        COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS pnl_usd,
        COUNT(*) FILTER (WHERE realized_pnl > 0)::bigint                      AS win_count,
        COUNT(*) FILTER (WHERE realized_pnl < 0)::bigint                      AS loss_count,
        COUNT(DISTINCT whale_addr)::bigint                                    AS unique_whales
      FROM signals
      WHERE ts >= NOW() - (${windowInterval}::interval) AND ts <= NOW()
        AND condition_id IS NOT NULL
      GROUP BY bucket_ts, category, condition_id
    ),
    ranked AS (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY category, bucket_ts ORDER BY signals DESC) AS rn_signals,
        ROW_NUMBER() OVER (PARTITION BY category, bucket_ts ORDER BY volume_usd DESC) AS rn_volume,
        ROW_NUMBER() OVER (PARTITION BY category, bucket_ts ORDER BY pnl_usd DESC NULLS LAST) AS rn_pnl_winner,
        ROW_NUMBER() OVER (PARTITION BY category, bucket_ts ORDER BY pnl_usd ASC NULLS LAST) AS rn_pnl_loser
      FROM per_market
    )
    SELECT
      to_char(bucket_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS bucket,
      category, condition_id, market_question, market_slug, market_icon, signals, volume_usd, pnl_usd, win_count, loss_count, unique_whales
    FROM ranked
    WHERE rn_signals <= ${perCellLimit}
       OR rn_volume <= 5
       OR rn_pnl_winner <= 5
       OR rn_pnl_loser <= 5
  `;
  return rows;
}

/** Per-cell top whales — one row per (category, bucket, whale) ranked into
 *  the top-N within the cell. Same shape contract as queryTopMarketsPerCell:
 *  scans raw signals (no continuous aggregate carries whale_addr), capped
 *  at 24h at the top level for cost control. Drill mode keeps it on for
 *  every range since the WHERE category=X filter narrows the scan. */
export type WhaleCellRow = {
  bucket: string;
  category: string;
  whale_addr: string;
  signals: string | number;
  volume_usd: string | number;
  pnl_usd: string | number | null;
  wins: string | number;
  losses: string | number;
};

export async function queryTopWhalesPerCell(
  sql: Sql,
  range: HeatmapRange,
  perCellLimit: number,
  drillCategory: Category | null = null,
  drillSubcategory: string | null = null,
): Promise<ReadonlyArray<WhaleCellRow>> {
  const cfg = RANGE_CONFIG[range];
  const heavy = range === "12d" || range === "12w";
  if (heavy && drillCategory === null) return [];

  const bucketInterval = `${cfg.bucketMinutes} minutes`;
  const windowInterval = `${cfg.windowMinutes} minutes`;

  // L3 drill: rows are individual markets (condition_id), group by that
  // instead of subcategory so the resulting WhaleCellRow.category lines up
  // with the L3 rowKeys (which are condition_ids).
  if (drillCategory !== null && drillSubcategory !== null) {
    const rows = await sql<WhaleCellRow[]>`
      WITH per_whale AS (
        SELECT
          time_bucket(${bucketInterval}::interval, ts)                          AS bucket_ts,
          condition_id                                                          AS category,
          whale_addr,
          COUNT(*)::bigint                                                      AS signals,
          COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)            AS volume_usd,
          COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS pnl_usd,
          COUNT(*) FILTER (WHERE realized_pnl > 0)::bigint                      AS wins,
          COUNT(*) FILTER (WHERE realized_pnl < 0)::bigint                      AS losses
        FROM signals
        WHERE ts >= NOW() - (${windowInterval}::interval) AND ts <= NOW()
          AND category = ${drillCategory}
          AND subcategory = ${drillSubcategory}
          AND condition_id IS NOT NULL
        GROUP BY bucket_ts, condition_id, whale_addr
      ),
      ranked AS (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY category, bucket_ts ORDER BY volume_usd DESC, signals DESC) AS rn_volume,
          ROW_NUMBER() OVER (PARTITION BY category, bucket_ts ORDER BY pnl_usd DESC NULLS LAST) AS rn_pnl_winner,
          ROW_NUMBER() OVER (PARTITION BY category, bucket_ts ORDER BY pnl_usd ASC NULLS LAST) AS rn_pnl_loser,
          ROW_NUMBER() OVER (PARTITION BY category, bucket_ts ORDER BY signals DESC) AS rn_signals
        FROM per_whale
      )
      SELECT
        to_char(bucket_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS bucket,
        category, whale_addr, signals, volume_usd, pnl_usd, wins, losses
      FROM ranked
      WHERE rn_volume <= ${perCellLimit}
         OR rn_pnl_winner <= 5
         OR rn_pnl_loser <= 5
         OR rn_signals <= 5
    `;
    return rows;
  }

  if (drillCategory !== null) {
    const rows = await sql<WhaleCellRow[]>`
      WITH per_whale AS (
        SELECT
          time_bucket(${bucketInterval}::interval, ts)                          AS bucket_ts,
          subcategory                                                           AS category,
          whale_addr,
          COUNT(*)::bigint                                                      AS signals,
          COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)            AS volume_usd,
          COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS pnl_usd,
          COUNT(*) FILTER (WHERE realized_pnl > 0)::bigint                      AS wins,
          COUNT(*) FILTER (WHERE realized_pnl < 0)::bigint                      AS losses
        FROM signals
        WHERE ts >= NOW() - (${windowInterval}::interval) AND ts <= NOW()
          AND category = ${drillCategory}
          AND subcategory IS NOT NULL
        GROUP BY bucket_ts, subcategory, whale_addr
      ),
      ranked AS (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY category, bucket_ts ORDER BY volume_usd DESC, signals DESC) AS rn_volume,
          ROW_NUMBER() OVER (PARTITION BY category, bucket_ts ORDER BY pnl_usd DESC NULLS LAST) AS rn_pnl_winner,
          ROW_NUMBER() OVER (PARTITION BY category, bucket_ts ORDER BY pnl_usd ASC NULLS LAST) AS rn_pnl_loser,
          ROW_NUMBER() OVER (PARTITION BY category, bucket_ts ORDER BY signals DESC) AS rn_signals
        FROM per_whale
      )
      SELECT
        to_char(bucket_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS bucket,
        category, whale_addr, signals, volume_usd, pnl_usd, wins, losses
      FROM ranked
      WHERE rn_volume <= ${perCellLimit}
         OR rn_pnl_winner <= 5
         OR rn_pnl_loser <= 5
         OR rn_signals <= 5
    `;
    return rows;
  }

  const rows = await sql<WhaleCellRow[]>`
    WITH per_whale AS (
      SELECT
        time_bucket(${bucketInterval}::interval, ts)                          AS bucket_ts,
        category,
        whale_addr,
        COUNT(*)::bigint                                                      AS signals,
        COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)            AS volume_usd,
        COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS pnl_usd,
        COUNT(*) FILTER (WHERE realized_pnl > 0)::bigint                      AS wins,
        COUNT(*) FILTER (WHERE realized_pnl < 0)::bigint                      AS losses
      FROM signals
      WHERE ts >= NOW() - (${windowInterval}::interval) AND ts <= NOW()
      GROUP BY bucket_ts, category, whale_addr
    ),
    ranked AS (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY category, bucket_ts ORDER BY volume_usd DESC, signals DESC) AS rn_volume,
        ROW_NUMBER() OVER (PARTITION BY category, bucket_ts ORDER BY pnl_usd DESC NULLS LAST) AS rn_pnl_winner,
        ROW_NUMBER() OVER (PARTITION BY category, bucket_ts ORDER BY pnl_usd ASC NULLS LAST) AS rn_pnl_loser,
        ROW_NUMBER() OVER (PARTITION BY category, bucket_ts ORDER BY signals DESC) AS rn_signals
      FROM per_whale
    )
    SELECT
      to_char(bucket_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS bucket,
      category, whale_addr, signals, volume_usd, pnl_usd, wins, losses
    FROM ranked
    WHERE rn_volume <= ${perCellLimit}
       OR rn_pnl_winner <= 5
       OR rn_pnl_loser <= 5
       OR rn_signals <= 5
  `;
  return rows;
}

/** Per-market metadata at L3: freshest known market_question + market_slug + icon.
 *  Frontend uses the question to label the row, the slug to build the
 *  polymarket.com/event/{slug} link with referral, and the icon to render
 *  the small thumbnail next to the row label. */
export type MarketMeta = { question: string | null; slug: string | null; icon: string | null };

export async function fetchMarketMeta(
  sql: Sql,
  conditionIds: ReadonlyArray<string>,
): Promise<Record<string, MarketMeta>> {
  if (conditionIds.length === 0) return {};
  const rows = await sql<
    {
      condition_id: string;
      market_question: string | null;
      market_slug: string | null;
      market_icon: string | null;
    }[]
  >`
    SELECT DISTINCT ON (condition_id) condition_id, market_question, market_slug, market_icon
    FROM signals
    WHERE condition_id IN ${sql(conditionIds)}
    ORDER BY condition_id, ts DESC
  `;
  const out: Record<string, MarketMeta> = {};
  for (const r of rows) {
    out[r.condition_id] = {
      question: r.market_question,
      slug: r.market_slug,
      icon: r.market_icon,
    };
  }
  return out;
}

/** Subset of `conditionIds` that have already resolved (per processed_resolutions).
 *  At L3 the UI fades resolved markets so the user sees what's still live. */
export async function fetchResolvedMarkets(
  sql: Sql,
  conditionIds: ReadonlyArray<string>,
): Promise<ReadonlySet<string>> {
  if (conditionIds.length === 0) return new Set();
  const rows = await sql<{ condition_id: string }[]>`
    SELECT condition_id
    FROM processed_resolutions
    WHERE condition_id IN ${sql(conditionIds)}
  `;
  return new Set(rows.map((r) => r.condition_id));
}

/** Top whale across the whole window by total USD entered (BUY only). */
export async function fetchTopWhale(
  sql: Sql,
  windowMinutes: number,
): Promise<string | null> {
  const windowInterval = `${windowMinutes} minutes`;
  const rows = await sql<{ whale_addr: string }[]>`
    SELECT whale_addr
    FROM signals
    WHERE ts >= NOW() - (${windowInterval}::interval) AND ts <= NOW()
      AND side = 'BUY'
    GROUP BY whale_addr
    ORDER BY COALESCE(SUM(size * price), 0) DESC
    LIMIT 1
  `;
  return rows[0]?.whale_addr ?? null;
}

/** Top-N whales by BUY USD volume in the window. Optionally restricted to a
 *  category — when drilled, the leaderboard only counts trades inside that
 *  bucket so the StatsBar matches what the user is looking at. */
export type TopWhaleRow = {
  whale_addr: string;
  signals: string | number;
  volume_usd: string | number;
  pnl_usd: string | number | null;
};

export async function queryTopWhales(
  sql: Sql,
  windowMinutes: number,
  drillCategory: Category | null,
  limit: number,
): Promise<ReadonlyArray<TopWhaleRow>> {
  const windowInterval = `${windowMinutes} minutes`;
  // Some upstream payloads put non-wallet identifiers in the `user` field
  // (e.g. "0xADDR-TIMESTAMP" composites). Skip anything that isn't a
  // canonical 42-char 0x-prefixed lowercase hex so the popover stays clean.
  if (drillCategory !== null) {
    return sql<TopWhaleRow[]>`
      SELECT whale_addr,
        COUNT(*)::bigint                                                       AS signals,
        COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)             AS volume_usd,
        COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS pnl_usd
      FROM signals
      WHERE ts >= NOW() - (${windowInterval}::interval) AND ts <= NOW()
        AND category = ${drillCategory}
        AND whale_addr ~ '^0x[0-9a-f]{40}$'
      GROUP BY whale_addr
      ORDER BY volume_usd DESC, signals DESC
      LIMIT ${limit}
    `;
  }
  return sql<TopWhaleRow[]>`
    SELECT whale_addr,
      COUNT(*)::bigint                                                       AS signals,
      COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)             AS volume_usd,
      COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS pnl_usd
    FROM signals
    WHERE ts >= NOW() - (${windowInterval}::interval) AND ts <= NOW()
      AND whale_addr ~ '^0x[0-9a-f]{40}$'
    GROUP BY whale_addr
    ORDER BY volume_usd DESC, signals DESC
    LIMIT ${limit}
  `;
}

/** Earliest signal ts → number of full days of data we have. UI uses this to
 *  enable/disable PATTERN mode (needs ≥7 days). */
export async function fetchDataSpan(
  sql: Sql,
): Promise<{ earliestTs: string | null; daysOfData: number }> {
  const rows = await sql<{ earliest: string | null; days: string | number | null }[]>`
    SELECT
      to_char(MIN(ts) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS earliest,
      EXTRACT(epoch FROM (NOW() - MIN(ts))) / 86400.0 AS days
    FROM signals
  `;
  const r = rows[0];
  if (!r || r.earliest === null) return { earliestTs: null, daysOfData: 0 };
  const days = typeof r.days === "number" ? r.days : Number(r.days);
  return {
    earliestTs: r.earliest,
    daysOfData: Number.isFinite(days) ? Math.max(0, days) : 0,
  };
}

/** DISTINCT whales seen in window (any trade kind). */
export async function fetchUniqueWhalesInWindow(
  sql: Sql,
  windowMinutes: number,
): Promise<number> {
  const windowInterval = `${windowMinutes} minutes`;
  const rows = await sql<{ n: string | number }[]>`
    SELECT COUNT(DISTINCT whale_addr) AS n
    FROM signals
    WHERE ts >= NOW() - (${windowInterval}::interval) AND ts <= NOW()
  `;
  return num(rows[0]?.n);
}

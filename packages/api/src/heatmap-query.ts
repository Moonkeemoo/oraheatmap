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

// ─── Wire types ──────────────────────────────────────────────────────────────

export type MarketSummary = {
  conditionId: string;
  marketQuestion: string | null;
  /** Polymarket event slug for the public URL. NULL for legacy rows that
   *  predate slug capture. */
  marketSlug: string | null;
  count: number;
  volume: number;
  pnl: number;
  winRate: number | null;
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
  signals: string | number;
  volume_usd: string | number;
  pnl_usd: string | number | null;
  win_count: string | number;
  loss_count: string | number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ZERO_CELL: HeatmapCell = Object.freeze({
  count: 0,
  volume: 0,
  pnl: 0,
  winRate: null,
  uniqueWhales: 0,
  markets: [],
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
      Array.from({ length: slotCount }, (): HeatmapCell => ({ ...ZERO_CELL, markets: [] })),
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
      count: num(m.signals),
      volume: num(m.volume_usd),
      pnl: num(m.pnl_usd),
      winRate: decided > 0 ? wins / decided : null,
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
        WHERE ts >= NOW() - (${windowInterval}::interval)
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
      WHERE ts >= NOW() - (${windowInterval}::interval)
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
    WHERE bucket >= NOW() - (${windowInterval}::interval)
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
          COUNT(*)::bigint                                                      AS signals,
          COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)            AS volume_usd,
          COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS pnl_usd,
          COUNT(*) FILTER (WHERE realized_pnl > 0)::bigint                      AS win_count,
          COUNT(*) FILTER (WHERE realized_pnl < 0)::bigint                      AS loss_count
        FROM signals
        WHERE ts >= NOW() - (${windowInterval}::interval)
          AND category = ${drillCategory}
          AND subcategory IS NOT NULL
          AND condition_id IS NOT NULL
        GROUP BY bucket_ts, subcategory, condition_id
      ),
      ranked AS (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY category, bucket_ts ORDER BY signals DESC) AS rn
        FROM per_market
      )
      SELECT
        to_char(bucket_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS bucket,
        category, condition_id, market_question, market_slug, signals, volume_usd, pnl_usd, win_count, loss_count
      FROM ranked
      WHERE rn <= ${perCellLimit}
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
        COUNT(*)::bigint                                                      AS signals,
        COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)            AS volume_usd,
        COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS pnl_usd,
        COUNT(*) FILTER (WHERE realized_pnl > 0)::bigint                      AS win_count,
        COUNT(*) FILTER (WHERE realized_pnl < 0)::bigint                      AS loss_count
      FROM signals
      WHERE ts >= NOW() - (${windowInterval}::interval)
        AND condition_id IS NOT NULL
      GROUP BY bucket_ts, category, condition_id
    ),
    ranked AS (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY category, bucket_ts ORDER BY signals DESC) AS rn
      FROM per_market
    )
    SELECT
      to_char(bucket_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS bucket,
      category, condition_id, market_question, market_slug, signals, volume_usd, pnl_usd, win_count, loss_count
    FROM ranked
    WHERE rn <= ${perCellLimit}
  `;
  return rows;
}

/** Top whale across the whole window by total USD entered (BUY only). */
export async function fetchTopWhale(
  sql: Sql,
  range: HeatmapRange,
): Promise<string | null> {
  const cfg = RANGE_CONFIG[range];
  const windowInterval = `${cfg.windowMinutes} minutes`;
  const rows = await sql<{ whale_addr: string }[]>`
    SELECT whale_addr
    FROM signals
    WHERE ts >= NOW() - (${windowInterval}::interval)
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
  range: HeatmapRange,
  drillCategory: Category | null,
  limit: number,
): Promise<ReadonlyArray<TopWhaleRow>> {
  const cfg = RANGE_CONFIG[range];
  const windowInterval = `${cfg.windowMinutes} minutes`;
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
      WHERE ts >= NOW() - (${windowInterval}::interval)
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
    WHERE ts >= NOW() - (${windowInterval}::interval)
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
  range: HeatmapRange,
): Promise<number> {
  const cfg = RANGE_CONFIG[range];
  const windowInterval = `${cfg.windowMinutes} minutes`;
  const rows = await sql<{ n: string | number }[]>`
    SELECT COUNT(DISTINCT whale_addr) AS n
    FROM signals
    WHERE ts >= NOW() - (${windowInterval}::interval)
  `;
  return num(rows[0]?.n);
}

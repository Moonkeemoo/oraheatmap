import type { Sql } from "postgres";

import { CATEGORIES, type Category } from "./categorize";

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
  categories: ReadonlyArray<Category>;
  buckets: ReadonlyArray<{ ts: string; index: number }>;
  cells: Record<Category, ReadonlyArray<HeatmapCell>>;
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

export function assembleHeatmap(
  aggRows: ReadonlyArray<AggRow>,
  marketRows: ReadonlyArray<MarketRow>,
  buckets: ReadonlyArray<{ ts: string; index: number }>,
  range: HeatmapRange,
  now: Date,
): HeatmapResponse {
  const cfg = RANGE_CONFIG[range];
  const slotCount = buckets.length;

  // Init zero grid
  const cells = Object.fromEntries(
    CATEGORIES.map((c) => [
      c,
      Array.from({ length: slotCount }, (): HeatmapCell => ({ ...ZERO_CELL, markets: [] })),
    ]),
  ) as Record<Category, HeatmapCell[]>;

  const bucketIndex = new Map(buckets.map((b) => [b.ts, b.index]));

  // Aggregate metrics. Win rate denominator = wins + losses (excludes
  // breakeven exits where realized_pnl == 0; rare but possible especially
  // for SETTLEMENT rows where avg_entry coincides with payout).
  let totalSignals = 0;
  let totalVolume = 0;
  let totalPnl = 0;
  let totalWins = 0;
  let totalLosses = 0;
  const perCategoryCount = new Map<Category, number>();

  for (const r of aggRows) {
    const cat = toCategory(r.category);
    const idx = bucketIndex.get(r.bucket);
    if (idx === undefined) continue;
    const count = num(r.signal_count);
    const volume = num(r.buy_volume_usd);
    const pnl = num(r.realized_pnl_sum);
    const wins = num(r.win_count);
    const losses = num(r.loss_count);
    const unique = num(r.unique_whales);

    const cell = cells[cat][idx];
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
    perCategoryCount.set(cat, (perCategoryCount.get(cat) ?? 0) + count);
  }

  // Markets — already sliced to top-N per (cat, bucket) by SQL, ordered by
  // signal count desc. UI re-sorts by active metric and slices to top-5.
  for (const m of marketRows) {
    const cat = toCategory(m.category);
    const idx = bucketIndex.get(m.bucket);
    if (idx === undefined) continue;
    const cell = cells[cat][idx];
    if (!cell) continue;
    const wins = num(m.win_count);
    const losses = num(m.loss_count);
    const decided = wins + losses;
    cell.markets.push({
      conditionId: m.condition_id,
      marketQuestion: m.market_question,
      count: num(m.signals),
      volume: num(m.volume_usd),
      pnl: num(m.pnl_usd),
      winRate: decided > 0 ? wins / decided : null,
    });
  }

  // Top category by signal count
  let topCategory: Category | null = null;
  let topCount = 0;
  for (const [cat, count] of perCategoryCount) {
    if (count > topCount) {
      topCount = count;
      topCategory = cat;
    }
  }

  return {
    generatedAt: now.toISOString(),
    range,
    windowEnd: buckets[buckets.length - 1]?.ts ?? now.toISOString(),
    windowStart: buckets[0]?.ts ?? now.toISOString(),
    windowMinutes: cfg.windowMinutes,
    bucketMinutes: cfg.bucketMinutes,
    categories: CATEGORIES,
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
): Promise<ReadonlyArray<AggRow>> {
  const cfg = RANGE_CONFIG[range];
  const bucketInterval = `${cfg.bucketMinutes} minutes`;
  const windowInterval = `${cfg.windowMinutes} minutes`;

  if (cfg.source === "raw") {
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
): Promise<ReadonlyArray<MarketRow>> {
  const cfg = RANGE_CONFIG[range];
  if (cfg.source !== "raw") return [];

  const bucketInterval = `${cfg.bucketMinutes} minutes`;
  const windowInterval = `${cfg.windowMinutes} minutes`;
  const rows = await sql<MarketRow[]>`
    WITH per_market AS (
      SELECT
        time_bucket(${bucketInterval}::interval, ts)                          AS bucket_ts,
        category,
        condition_id,
        MAX(market_question)                                                  AS market_question,
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
      category, condition_id, market_question, signals, volume_usd, pnl_usd, win_count, loss_count
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

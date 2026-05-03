import type { Sql } from "postgres";

import { CATEGORIES, type Category } from "./categorize";
import { whaleAlias, whaleColor } from "./whale-display";

// ─── Range definitions ───────────────────────────────────────────────────────

export type HeatmapRange = "1h" | "24h" | "7d" | "30d";
export type HeatmapMetric = "signals" | "volume" | "pnl" | "winrate";

type RangeConfig = {
  bucketMinutes: number;
  windowMinutes: number;
  slots: number;
};

export const RANGE_CONFIG: Readonly<Record<HeatmapRange, RangeConfig>> = Object.freeze({
  "1h": { bucketMinutes: 5, windowMinutes: 60, slots: 12 },
  "24h": { bucketMinutes: 60, windowMinutes: 24 * 60, slots: 24 },
  "7d": { bucketMinutes: 24 * 60, windowMinutes: 7 * 24 * 60, slots: 7 },
  "30d": { bucketMinutes: 24 * 60, windowMinutes: 30 * 24 * 60, slots: 30 },
});

// ─── Wire types ──────────────────────────────────────────────────────────────

export type TradeSummary = {
  whaleAddr: string;
  whaleAlias: string;
  whaleColor: string;
  side: "BUY" | "SELL" | "SETTLEMENT";
  sizeUsd: number;
  realizedPnl: number | null;
  marketQuestion: string | null;
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
  trades: TradeSummary[];
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

type TradeRow = {
  bucket: string;
  category: string;
  whale_addr: string;
  side: "BUY" | "SELL" | "SETTLEMENT";
  size: string | number;
  price: string | number;
  realized_pnl: string | number | null;
  market_question: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ZERO_CELL: HeatmapCell = Object.freeze({
  count: 0,
  volume: 0,
  pnl: 0,
  winRate: null,
  uniqueWhales: 0,
  trades: [],
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
  tradeRows: ReadonlyArray<TradeRow>,
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
      Array.from({ length: slotCount }, (): HeatmapCell => ({ ...ZERO_CELL, trades: [] })),
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

  // Trades — already sliced to top-N per (cat, bucket) by SQL. Convert to wire shape.
  for (const t of tradeRows) {
    const cat = toCategory(t.category);
    const idx = bucketIndex.get(t.bucket);
    if (idx === undefined) continue;
    const cell = cells[cat][idx];
    if (!cell) continue;
    cell.trades.push({
      whaleAddr: t.whale_addr,
      whaleAlias: whaleAlias(t.whale_addr),
      whaleColor: whaleColor(t.whale_addr),
      side: t.side,
      sizeUsd: num(t.size) * num(t.price),
      realizedPnl: t.realized_pnl === null ? null : num(t.realized_pnl),
      marketQuestion: t.market_question,
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
 * exit count, win count, unique whales touching the cell.
 *
 * Volume includes BUY only — entry-side money flow ("smart money entering").
 * PnL/winrate operate on rows where realized_pnl IS NOT NULL — i.e. SELLs and
 * SETTLEMENTS where we knew the entry price.
 */
export async function queryHeatmapAggRows(
  sql: Sql,
  range: HeatmapRange,
): Promise<ReadonlyArray<AggRow>> {
  const cfg = RANGE_CONFIG[range];
  const bucketInterval = `${cfg.bucketMinutes} minutes`;
  const windowInterval = `${cfg.windowMinutes} minutes`;
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

/** Top-N trades per (category, bucket) by USD size. Used for cell tooltips. */
export async function queryTopTradesPerCell(
  sql: Sql,
  range: HeatmapRange,
  perCellLimit: number,
): Promise<ReadonlyArray<TradeRow>> {
  const cfg = RANGE_CONFIG[range];
  const bucketInterval = `${cfg.bucketMinutes} minutes`;
  const windowInterval = `${cfg.windowMinutes} minutes`;
  const rows = await sql<TradeRow[]>`
    WITH ranked AS (
      SELECT
        to_char(time_bucket(${bucketInterval}::interval, ts) AT TIME ZONE 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS bucket,
        category, whale_addr, side, size, price, realized_pnl, market_question,
        ROW_NUMBER() OVER (
          PARTITION BY category, time_bucket(${bucketInterval}::interval, ts)
          ORDER BY size * price DESC NULLS LAST
        ) AS rn
      FROM signals
      WHERE ts >= NOW() - (${windowInterval}::interval)
    )
    SELECT bucket, category, whale_addr, side, size, price, realized_pnl, market_question
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

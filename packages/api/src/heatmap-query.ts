import type { Sql } from "postgres";

import { CATEGORIES, type Category } from "./categorize";

export type HeatmapMetric = "count" | "volume";

export type HeatmapCell = {
  count: number;
  volume: number;
  uniqueWhales: number;
};

export type HeatmapResponse = {
  generatedAt: string;
  /** end of the most recent bucket (inclusive — the "now" bucket) */
  windowEnd: string;
  /** start of the oldest bucket (inclusive) */
  windowStart: string;
  windowMinutes: number;
  bucketMinutes: number;
  /** explicit row order — guarantees the UI can render in a known order */
  categories: ReadonlyArray<Category>;
  /** ascending bucket starts; cells[i] aligns with buckets[i] */
  buckets: ReadonlyArray<{ ts: string; index: number }>;
  /** category → array indexed by bucket position */
  cells: Record<Category, ReadonlyArray<HeatmapCell>>;
  /** roll-up across the whole window for the stats bar */
  totals: {
    signals: number;
    volume: number;
    uniqueWhales: number;
    topCategory: Category | null;
    topWhale: string | null;
  };
};

type Row = {
  bucket: string;
  category: string;
  signal_count: string | number;
  total_volume: string | number;
  unique_whales: string | number;
};

const ZERO_CELL: HeatmapCell = Object.freeze({ count: 0, volume: 0, uniqueWhales: 0 });

function num(v: string | number): number {
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toCategory(raw: string): Category {
  return (CATEGORIES as ReadonlyArray<string>).includes(raw) ? (raw as Category) : "Other";
}

/**
 * Builds the bucket timeline aligned to wall-clock 5-minute boundaries (e.g.
 * 11:25, 11:30, ..., 12:20). The most recent bucket is the one containing
 * `now`. Returns N buckets ending at "now's bucket start", inclusive.
 */
export function buildBuckets(
  now: Date,
  bucketMinutes: number,
  windowMinutes: number,
): ReadonlyArray<{ ts: string; index: number }> {
  const bucketMs = bucketMinutes * 60_000;
  const slotCount = Math.floor(windowMinutes / bucketMinutes);
  const nowMs = now.getTime();
  const latestBucketStart = Math.floor(nowMs / bucketMs) * bucketMs;
  const out: Array<{ ts: string; index: number }> = [];
  for (let i = slotCount - 1; i >= 0; i--) {
    const ts = new Date(latestBucketStart - i * bucketMs).toISOString();
    out.push({ ts, index: slotCount - 1 - i });
  }
  return out;
}

/** Pure assembler — given query rows + bucket schema, produce the heatmap response. */
export function assembleHeatmap(
  rows: ReadonlyArray<Row>,
  buckets: ReadonlyArray<{ ts: string; index: number }>,
  bucketMinutes: number,
  windowMinutes: number,
  now: Date,
): HeatmapResponse {
  const slotCount = buckets.length;
  const cells = Object.fromEntries(
    CATEGORIES.map((c) => [c, Array.from({ length: slotCount }, () => ({ ...ZERO_CELL }))]),
  ) as Record<Category, HeatmapCell[]>;

  const bucketIndex = new Map(buckets.map((b) => [b.ts, b.index]));

  const totals: HeatmapResponse["totals"] = {
    signals: 0,
    volume: 0,
    uniqueWhales: 0,
    topCategory: null,
    topWhale: null,
  };

  const perCategoryTotals = new Map<Category, number>();

  for (const r of rows) {
    const cat = toCategory(r.category);
    const idx = bucketIndex.get(r.bucket);
    if (idx === undefined) continue; // row outside window; defensive
    const count = num(r.signal_count);
    const volume = num(r.total_volume);
    const uniqueWhales = num(r.unique_whales);

    const cellRow = cells[cat];
    const cell = cellRow[idx];
    if (!cell) continue;
    cell.count += count;
    cell.volume += volume;
    cell.uniqueWhales += uniqueWhales;

    totals.signals += count;
    totals.volume += volume;
    perCategoryTotals.set(cat, (perCategoryTotals.get(cat) ?? 0) + count);
  }

  // Top category by signal count
  let topCount = 0;
  for (const [cat, count] of perCategoryTotals) {
    if (count > topCount) {
      topCount = count;
      totals.topCategory = cat;
    }
  }

  return {
    generatedAt: now.toISOString(),
    windowEnd: buckets[buckets.length - 1]?.ts ?? now.toISOString(),
    windowStart: buckets[0]?.ts ?? now.toISOString(),
    windowMinutes,
    bucketMinutes,
    categories: CATEGORIES,
    buckets,
    cells,
    totals,
  };
}

/**
 * Query TimescaleDB for the last `windowMinutes` of signals, bucketed by
 * `bucketMinutes`. Returns raw rows; the caller passes them to
 * `assembleHeatmap`. Separated so that the assembler is unit-testable
 * without a live DB.
 */
export async function queryHeatmapRows(
  sql: Sql,
  bucketMinutes: number,
  windowMinutes: number,
): Promise<ReadonlyArray<Row>> {
  // Bucket the live `signals` table directly: 1h × 5min = 12 chunks max,
  // cheap enough that we don't need the continuous aggregate. Cont-aggs
  // become useful for 24h+ ranges (post-MVP).
  const rows = await sql<Row[]>`
    SELECT
      to_char(time_bucket(${`${bucketMinutes} minutes`}::interval, ts) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS bucket,
      category,
      COUNT(*)::bigint                       AS signal_count,
      -- size is in shares; USD volume = size * price (matches oralab convention)
      COALESCE(SUM(size * price), 0)         AS total_volume,
      COUNT(DISTINCT whale_addr)::bigint     AS unique_whales
    FROM signals
    WHERE ts >= NOW() - (${`${windowMinutes} minutes`}::interval)
    GROUP BY bucket, category
    ORDER BY bucket
  `;
  return rows;
}

export async function fetchTopWhale(
  sql: Sql,
  windowMinutes: number,
): Promise<string | null> {
  const rows = await sql<{ whale_addr: string; total_volume: number }[]>`
    SELECT whale_addr, COALESCE(SUM(size * price), 0) AS total_volume
    FROM signals
    WHERE ts >= NOW() - (${`${windowMinutes} minutes`}::interval)
    GROUP BY whale_addr
    ORDER BY total_volume DESC
    LIMIT 1
  `;
  return rows[0]?.whale_addr ?? null;
}

export async function fetchUniqueWhalesInWindow(
  sql: Sql,
  windowMinutes: number,
): Promise<number> {
  const rows = await sql<{ n: string | number }[]>`
    SELECT COUNT(DISTINCT whale_addr) AS n
    FROM signals
    WHERE ts >= NOW() - (${`${windowMinutes} minutes`}::interval)
  `;
  return num(rows[0]?.n ?? 0);
}

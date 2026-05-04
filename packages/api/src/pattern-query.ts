/**
 * Cyclical-pattern queries — "Hour-of-day" and "Day-of-week".
 *
 * Each cell shows the AVERAGE of the active metric for a recurring time slot
 * across the lookback period (default 30 days). To surface trend, we also
 * compute the same average over the *recent half* of the lookback and the
 * *older half*, so the UI can render "10 (+5)" — recent avg 10, +5 vs older.
 *
 * Source: `signals_hourly` continuous aggregate (already extended with PnL
 * fields). For day-of-week we sum hourly buckets to whole-day totals first,
 * then average across day-of-week occurrences.
 */

import type { Sql } from "postgres";

import { CATEGORIES, type Category } from "./categorize";

export type PatternKind = "hour-of-day" | "day-of-week";

export type PatternCellValues = {
  count: number;
  volume: number;
  pnl: number;
  winRate: number | null;
  /** Approximate unique-whale count for this slot — sum of per-hour
   *  COUNT(DISTINCT whale_addr) (over-counts whales active in multiple
   *  buckets). Acceptable for the convergence lens. */
  uniqueWhales: number;
};

export type PatternCell = PatternCellValues & {
  /** Recent-half minus older-half. winRate delta is null when either side has no decided exits. */
  delta: PatternCellValues;
  /** Average across the FULL lookback window (recent + older halves combined).
   *  Each half's avg with null tolerance — used by the tooltip parens so they
   *  show a meaningful baseline even when one half is empty. */
  full: PatternCellValues;
  /** Number of (day or week) observations contributing to the recent half. */
  sampleCount: number;
  /** Min/max raw observation values across the WHOLE lookback (recent + older). */
  min: { count: number; volume: number; pnl: number };
  max: { count: number; volume: number; pnl: number };
};

export type PatternBucket = { label: string; index: number };

export type PatternResponse = {
  kind: PatternKind;
  lookbackDays: number;
  /** Non-null when this is a per-subcategory drill of `drillCategory`. */
  drillCategory: Category | null;
  /** Row keys for the grid: top-level category names OR subcategory slugs. */
  categories: ReadonlyArray<string>;
  buckets: ReadonlyArray<PatternBucket>;
  cells: Record<string, PatternCell[]>;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ZERO_VALUES: PatternCellValues = { count: 0, volume: 0, pnl: 0, winRate: null, uniqueWhales: 0 };

function emptyCell(): PatternCell {
  return {
    ...ZERO_VALUES,
    delta: { ...ZERO_VALUES },
    full: { ...ZERO_VALUES },
    sampleCount: 0,
    min: { count: 0, volume: 0, pnl: 0 },
    max: { count: 0, volume: 0, pnl: 0 },
  };
}

/** Combine two half-window averages into a full-window average with null
 *  tolerance — if one half is empty (NULL from the SQL aggregate), the
 *  other half stands in alone. */
function avgOf(a: number | null, b: number | null): number {
  if (a !== null && b !== null) return (a + b) / 2;
  return a ?? b ?? 0;
}

function avgWinRate(a: number | null, b: number | null): number | null {
  if (a !== null && b !== null) return (a + b) / 2;
  return a ?? b ?? null;
}

function numOrNull(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toCategory(raw: string): Category {
  return (CATEGORIES as ReadonlyArray<string>).includes(raw) ? (raw as Category) : "Other";
}

function dayOfWeekLabel(dow: number): string {
  // Postgres EXTRACT(dow): 0=Sunday, 6=Saturday. Convert to Mon..Sun ordering for UX.
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return labels[dow] ?? String(dow);
}

/** Slot 0..11 → "00:00", "02:00", ..., "22:00" — start hour of the 2h slot,
 *  matches LIVE's HH:MM label format. (Frontend rotates these into local TZ
 *  and re-derives the visible label, so this is mostly cosmetic.) */
function hourSlotLabel(slot: number): string {
  const h = (slot * 2) % 24;
  return `${String(h).padStart(2, "0")}:00`;
}

/** Mon..Sun ordering — push Sunday to the end so the week reads naturally. */
const DOW_DISPLAY_ORDER: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6, 0];

// ─── Row shapes from SQL ─────────────────────────────────────────────────────

type AggRow = {
  slot: string | number;          // hour 0-23 OR dow 0-6
  category: string;
  // "Current" = most recent cycle's value at this slot. For HOUR pattern
  // a cycle = 1 day, so this is "today's" 2-hour bucket. For DOW a cycle
  // = 1 week, so this is "this week's" weekday total. Updates the static
  // table cell with the freshest observation.
  current_count: string | number | null;
  current_volume: string | number | null;
  current_pnl: string | number | null;
  current_wins: string | number | null;
  current_losses: string | number | null;
  current_unique_whales: string | number | null;
  // Average across ALL cycles in the lookback window (30 cycles for HOUR
  // = 30 days, 12 cycles for DOW = 12 weeks).
  avg_count: string | number | null;
  avg_volume: string | number | null;
  avg_pnl: string | number | null;
  avg_unique_whales: string | number | null;
  total_wins: string | number | null;
  total_losses: string | number | null;
  sample_count: string | number;
  min_count: string | number | null;
  max_count: string | number | null;
  min_volume: string | number | null;
  max_volume: string | number | null;
  min_pnl: string | number | null;
  max_pnl: string | number | null;
};

// ─── SQL ─────────────────────────────────────────────────────────────────────

async function queryHourOfDayRows(
  sql: Sql,
  lookbackDays: number,
  drillCategory: Category | null,
): Promise<ReadonlyArray<AggRow>> {
  // Top level reads from the hourly continuous aggregate (cheap). Drill mode
  // can't — the agg doesn't carry subcategory — so we scan raw signals.
  if (drillCategory !== null) {
    return sql<AggRow[]>`
      WITH per_day_slot AS (
        SELECT
          DATE_TRUNC('day', ts AT TIME ZONE 'UTC')                           AS day,
          (EXTRACT(hour FROM ts AT TIME ZONE 'UTC')::int / 2)                AS slot,
          subcategory                                                        AS category,
          COUNT(*)                                                           AS slot_signals,
          COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)         AS slot_volume,
          COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS slot_pnl,
          COUNT(*) FILTER (WHERE realized_pnl > 0)                           AS slot_wins,
          COUNT(*) FILTER (WHERE realized_pnl < 0)                           AS slot_losses,
          COUNT(DISTINCT whale_addr)                                         AS slot_uw
        FROM signals
        WHERE ts >= NOW() - (${`${lookbackDays} days`}::interval)
          AND category = ${drillCategory}
          AND subcategory IS NOT NULL
        GROUP BY day, slot, subcategory
      ),
      ranked AS (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY slot, category ORDER BY day DESC) AS rn
        FROM per_day_slot
      )
      SELECT
        slot, category,
        MAX(slot_signals) FILTER (WHERE rn = 1) AS current_count,
        MAX(slot_volume) FILTER (WHERE rn = 1) AS current_volume,
        MAX(slot_pnl) FILTER (WHERE rn = 1) AS current_pnl,
        MAX(slot_wins) FILTER (WHERE rn = 1) AS current_wins,
        MAX(slot_losses) FILTER (WHERE rn = 1) AS current_losses,
        MAX(slot_uw) FILTER (WHERE rn = 1) AS current_unique_whales,
        AVG(slot_signals) AS avg_count,
        AVG(slot_volume)  AS avg_volume,
        AVG(slot_pnl)     AS avg_pnl,
        AVG(slot_uw)      AS avg_unique_whales,
        SUM(slot_wins)    AS total_wins,
        SUM(slot_losses)  AS total_losses,
        COUNT(*)::bigint  AS sample_count,
        MIN(slot_signals) AS min_count,
        MAX(slot_signals) AS max_count,
        MIN(slot_volume)  AS min_volume,
        MAX(slot_volume)  AS max_volume,
        MIN(slot_pnl)     AS min_pnl,
        MAX(slot_pnl)     AS max_pnl
      FROM ranked
      GROUP BY slot, category
      ORDER BY slot
    `;
  }
  const rows = await sql<AggRow[]>`
    WITH per_day_slot AS (
      SELECT
        DATE_TRUNC('day', bucket AT TIME ZONE 'UTC')                         AS day,
        (EXTRACT(hour FROM bucket AT TIME ZONE 'UTC')::int / 2)              AS slot,
        category,
        SUM(signal_count)     AS slot_signals,
        SUM(buy_volume_usd)   AS slot_volume,
        SUM(realized_pnl_sum) AS slot_pnl,
        SUM(win_count)        AS slot_wins,
        SUM(loss_count)       AS slot_losses,
        SUM(unique_whales)    AS slot_uw
      FROM signals_hourly
      WHERE bucket >= NOW() - (${`${lookbackDays} days`}::interval)
      GROUP BY day, slot, category
    ),
    ranked AS (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY slot, category ORDER BY day DESC) AS rn
      FROM per_day_slot
    )
    SELECT
      slot, category,
      MAX(slot_signals) FILTER (WHERE rn = 1) AS current_count,
      MAX(slot_volume) FILTER (WHERE rn = 1) AS current_volume,
      MAX(slot_pnl) FILTER (WHERE rn = 1) AS current_pnl,
      MAX(slot_wins) FILTER (WHERE rn = 1) AS current_wins,
      MAX(slot_losses) FILTER (WHERE rn = 1) AS current_losses,
      MAX(slot_uw) FILTER (WHERE rn = 1) AS current_unique_whales,
      AVG(slot_signals) AS avg_count,
      AVG(slot_volume)  AS avg_volume,
      AVG(slot_pnl)     AS avg_pnl,
      AVG(slot_uw)      AS avg_unique_whales,
      SUM(slot_wins)    AS total_wins,
      SUM(slot_losses)  AS total_losses,
      COUNT(*)::bigint  AS sample_count,
      MIN(slot_signals) AS min_count,
      MAX(slot_signals) AS max_count,
      MIN(slot_volume)  AS min_volume,
      MAX(slot_volume)  AS max_volume,
      MIN(slot_pnl)     AS min_pnl,
      MAX(slot_pnl)     AS max_pnl
    FROM ranked
    GROUP BY slot, category
    ORDER BY slot
  `;
  return rows;
}

async function queryDayOfWeekRows(
  sql: Sql,
  lookbackDays: number,
  drillCategory: Category | null,
): Promise<ReadonlyArray<AggRow>> {
  // Same drill-vs-aggregate split as queryHourOfDayRows. For DOW each
  // "cycle" = a week, so the most-recent-day-with-this-dow logic gives
  // "this week's Monday" / "this week's Tuesday" / etc.
  if (drillCategory !== null) {
    return sql<AggRow[]>`
      WITH per_day AS (
        SELECT
          DATE_TRUNC('day', ts AT TIME ZONE 'UTC')                           AS day,
          EXTRACT(dow FROM ts AT TIME ZONE 'UTC')::int                       AS slot,
          subcategory                                                        AS category,
          COUNT(*)                                                           AS day_signals,
          COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)         AS day_volume,
          COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS day_pnl,
          COUNT(*) FILTER (WHERE realized_pnl > 0)                           AS day_wins,
          COUNT(*) FILTER (WHERE realized_pnl < 0)                           AS day_losses,
          COUNT(DISTINCT whale_addr)                                         AS day_uw
        FROM signals
        WHERE ts >= NOW() - (${`${lookbackDays} days`}::interval)
          AND category = ${drillCategory}
          AND subcategory IS NOT NULL
        GROUP BY day, slot, subcategory
      ),
      ranked AS (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY slot, category ORDER BY day DESC) AS rn
        FROM per_day
      )
      SELECT
        slot, category,
        MAX(day_signals) FILTER (WHERE rn = 1) AS current_count,
        MAX(day_volume) FILTER (WHERE rn = 1) AS current_volume,
        MAX(day_pnl) FILTER (WHERE rn = 1) AS current_pnl,
        MAX(day_wins) FILTER (WHERE rn = 1) AS current_wins,
        MAX(day_losses) FILTER (WHERE rn = 1) AS current_losses,
        MAX(day_uw) FILTER (WHERE rn = 1) AS current_unique_whales,
        AVG(day_signals) AS avg_count,
        AVG(day_volume)  AS avg_volume,
        AVG(day_pnl)     AS avg_pnl,
        AVG(day_uw)      AS avg_unique_whales,
        SUM(day_wins)    AS total_wins,
        SUM(day_losses)  AS total_losses,
        COUNT(*)::bigint AS sample_count,
        MIN(day_signals) AS min_count,
        MAX(day_signals) AS max_count,
        MIN(day_volume)  AS min_volume,
        MAX(day_volume)  AS max_volume,
        MIN(day_pnl)     AS min_pnl,
        MAX(day_pnl)     AS max_pnl
      FROM ranked
      GROUP BY slot, category
      ORDER BY slot
    `;
  }
  // First sum hourly buckets to whole-day totals, then aggregate by dow.
  const rows = await sql<AggRow[]>`
    WITH per_day AS (
      SELECT
        DATE_TRUNC('day', bucket AT TIME ZONE 'UTC') AS day,
        EXTRACT(dow FROM bucket AT TIME ZONE 'UTC')::int AS slot,
        category,
        SUM(signal_count)     AS day_signals,
        SUM(buy_volume_usd)   AS day_volume,
        SUM(realized_pnl_sum) AS day_pnl,
        SUM(win_count)        AS day_wins,
        SUM(loss_count)       AS day_losses,
        SUM(unique_whales)    AS day_uw
      FROM signals_hourly
      WHERE bucket >= NOW() - (${`${lookbackDays} days`}::interval)
      GROUP BY day, slot, category
    ),
    ranked AS (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY slot, category ORDER BY day DESC) AS rn
      FROM per_day
    )
    SELECT
      slot, category,
      MAX(day_signals) FILTER (WHERE rn = 1) AS current_count,
      MAX(day_volume) FILTER (WHERE rn = 1) AS current_volume,
      MAX(day_pnl) FILTER (WHERE rn = 1) AS current_pnl,
      MAX(day_wins) FILTER (WHERE rn = 1) AS current_wins,
      MAX(day_losses) FILTER (WHERE rn = 1) AS current_losses,
      MAX(day_uw) FILTER (WHERE rn = 1) AS current_unique_whales,
      AVG(day_signals) AS avg_count,
      AVG(day_volume)  AS avg_volume,
      AVG(day_pnl)     AS avg_pnl,
      AVG(day_uw)      AS avg_unique_whales,
      SUM(day_wins)    AS total_wins,
      SUM(day_losses)  AS total_losses,
      COUNT(*)::bigint AS sample_count,
      MIN(day_signals) AS min_count,
      MAX(day_signals) AS max_count,
      MIN(day_volume)  AS min_volume,
      MAX(day_volume)  AS max_volume,
      MIN(day_pnl)     AS min_pnl,
      MAX(day_pnl)     AS max_pnl
    FROM ranked
    GROUP BY slot, category
    ORDER BY slot
  `;
  return rows;
}

// ─── Pure assembler ──────────────────────────────────────────────────────────

function winRateOf(wins: number, losses: number): number | null {
  const decided = wins + losses;
  return decided > 0 ? wins / decided : null;
}

function buildSlotOrder(kind: PatternKind): ReadonlyArray<{ slot: number; label: string }> {
  if (kind === "hour-of-day") {
    return Array.from({ length: 12 }, (_, s) => ({ slot: s, label: hourSlotLabel(s) }));
  }
  return DOW_DISPLAY_ORDER.map((d) => ({ slot: d, label: dayOfWeekLabel(d) }));
}

export function assemblePattern(
  rows: ReadonlyArray<AggRow>,
  kind: PatternKind,
  lookbackDays: number,
  options: { drillCategory?: Category | null; rowKeys?: ReadonlyArray<string> } = {},
): PatternResponse {
  const slotOrder = buildSlotOrder(kind);
  const slotIndex = new Map(slotOrder.map((s, i) => [s.slot, i]));
  const buckets: PatternBucket[] = slotOrder.map((s, i) => ({ label: s.label, index: i }));

  const drillCategory = options.drillCategory ?? null;
  const rowKeys = options.rowKeys ?? CATEGORIES;
  const rowKeySet = new Set(rowKeys);

  const cells: Record<string, PatternCell[]> = Object.fromEntries(
    rowKeys.map((k) => [k, slotOrder.map(() => emptyCell())]),
  );

  // In top-level mode, unknown raw category falls into "Other" (legacy
  // behaviour). In drill mode rows that don't match any known sub slug get
  // dropped — the bucket has none of them by design.
  function pickRowKey(raw: string): string | null {
    if (rowKeySet.has(raw)) return raw;
    if (drillCategory === null && rowKeySet.has("Other")) return "Other";
    return null;
  }

  for (const r of rows) {
    const key = pickRowKey(r.category);
    if (key === null) continue;
    const slot = typeof r.slot === "number" ? r.slot : Number(r.slot);
    const idx = slotIndex.get(slot);
    if (idx === undefined) continue;

    // CURRENT cycle = most recent slot occurrence (today for HOUR, this
    // week for DOW). Cell shows this as the primary value — the static
    // table refreshes "this slot" with the freshest data as the cycle
    // progresses (today's 16:00 replaces yesterday's once data lands).
    const currentCount  = num(r.current_count);
    const currentVolume = num(r.current_volume);
    const currentPnl    = num(r.current_pnl);
    const currentWR     = winRateOf(num(r.current_wins), num(r.current_losses));
    const currentUW     = num(r.current_unique_whales);

    // AVG across all cycles in the lookback window (30 cycles for HOUR,
    // 12 cycles for DOW). Shown in tooltip parens as the historical baseline.
    const avgCount  = num(r.avg_count);
    const avgVolume = num(r.avg_volume);
    const avgPnl    = num(r.avg_pnl);
    const avgUW     = num(r.avg_unique_whales);
    const avgWR     = winRateOf(num(r.total_wins), num(r.total_losses));

    const cell = cells[key]?.[idx];
    if (!cell) continue;
    cell.count        = currentCount;
    cell.volume       = currentVolume;
    cell.pnl          = currentPnl;
    cell.winRate      = currentWR;
    cell.uniqueWhales = currentUW;
    cell.delta = {
      count: currentCount - avgCount,
      volume: currentVolume - avgVolume,
      pnl: currentPnl - avgPnl,
      winRate: currentWR !== null && avgWR !== null ? currentWR - avgWR : null,
      uniqueWhales: currentUW - avgUW,
    };
    cell.full = {
      count: avgCount,
      volume: avgVolume,
      pnl: avgPnl,
      winRate: avgWR,
      uniqueWhales: avgUW,
    };
    cell.sampleCount = num(r.sample_count);
    cell.min = {
      count: num(r.min_count),
      volume: num(r.min_volume),
      pnl: num(r.min_pnl),
    };
    cell.max = {
      count: num(r.max_count),
      volume: num(r.max_volume),
      pnl: num(r.max_pnl),
    };
  }

  return { kind, lookbackDays, drillCategory, categories: rowKeys, buckets, cells };
}

// ─── Public entry ────────────────────────────────────────────────────────────

export async function queryPattern(
  sql: Sql,
  kind: PatternKind,
  lookbackDays: number,
  options: { drillCategory?: Category | null; rowKeys?: ReadonlyArray<string> } = {},
): Promise<PatternResponse> {
  const drillCategory = options.drillCategory ?? null;
  const rows =
    kind === "hour-of-day"
      ? await queryHourOfDayRows(sql, lookbackDays, drillCategory)
      : await queryDayOfWeekRows(sql, lookbackDays, drillCategory);
  return assemblePattern(rows, kind, lookbackDays, options);
}

// ─── Per-cell cycles (for the locked tooltip histogram) ─────────────────────

export type CycleSample = {
  /** ISO date — start of the day (HOUR pattern) or week (DOW pattern). */
  cycle: string;
  count: number;
  volume: number;
  pnl: number;
  winRate: number | null;
};

export type CellCyclesArgs = {
  kind: PatternKind;
  /** Top-level category at L1, OR (when subcategory is set) parent category
   *  for the subcategory filter. Always required. */
  category: Category;
  /** Optional drill — when set, filter rows by `subcategory` column instead
   *  of `category`. */
  subcategory?: string | null;
  /** Slot in the SAME UTC encoding the heatmap uses internally:
   *  HOUR → 0..11 (slot N = UTC hours [N*2, N*2+1])
   *  DOW  → 0..6  (Postgres EXTRACT(dow): 0=Sunday..6=Saturday)
   *  Frontend translates display-slot → UTC slot before calling this. */
  slot: number;
  /** Number of cycles to return — defaults to 30 for HOUR (days), 26 for
   *  DOW (weeks). */
  cycles?: number;
};

/**
 * Per-cycle samples for the (category × slot) cell that powers the
 * locked-tooltip histogram. Returns a series of length `cycles` (zero-filled
 * for cycles that had no signals) so the histogram has a consistent x-axis.
 */
export async function queryCellCycles(
  sql: Sql,
  args: CellCyclesArgs,
): Promise<ReadonlyArray<CycleSample>> {
  const filterCol = args.subcategory ? "subcategory" : "category";
  const filterVal = args.subcategory ?? args.category;

  if (args.kind === "hour-of-day") {
    const cycles = args.cycles ?? 30;
    const lookbackInterval = `${cycles} days`;
    const rows = await sql<Array<{
      cycle: string; count: string | number;
      volume: string | number; pnl: string | number;
      wins: string | number; losses: string | number;
    }>>`
      WITH days AS (
        SELECT generate_series(
          date_trunc('day', NOW() - (${lookbackInterval}::interval - interval '1 day')),
          date_trunc('day', NOW()),
          interval '1 day'
        ) AS cycle_start
      ),
      samples AS (
        SELECT
          date_trunc('day', ts AT TIME ZONE 'UTC') AS cycle_start,
          COUNT(*)::bigint AS count,
          COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0) AS volume,
          COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS pnl,
          COUNT(*) FILTER (WHERE realized_pnl > 0)::bigint AS wins,
          COUNT(*) FILTER (WHERE realized_pnl < 0)::bigint AS losses
        FROM signals
        WHERE ts >= NOW() - (${lookbackInterval}::interval)
          AND ${sql(filterCol)} = ${filterVal}
          AND (EXTRACT(hour FROM ts AT TIME ZONE 'UTC')::int / 2) = ${args.slot}
        GROUP BY 1
      )
      SELECT
        to_char(d.cycle_start, 'YYYY-MM-DD') AS cycle,
        COALESCE(s.count, 0)  AS count,
        COALESCE(s.volume, 0) AS volume,
        COALESCE(s.pnl, 0)    AS pnl,
        COALESCE(s.wins, 0)   AS wins,
        COALESCE(s.losses, 0) AS losses
      FROM days d
      LEFT JOIN samples s ON s.cycle_start = d.cycle_start
      ORDER BY d.cycle_start ASC
    `;
    return rows.map((r) => {
      const wins = num(r.wins);
      const losses = num(r.losses);
      const decided = wins + losses;
      return {
        cycle: r.cycle,
        count: num(r.count),
        volume: num(r.volume),
        pnl: num(r.pnl),
        winRate: decided > 0 ? wins / decided : null,
      };
    });
  }

  // day-of-week → per-week samples (12 cycles = ~3 months)
  const cycles = args.cycles ?? 12;
  const lookbackInterval = `${cycles * 7} days`;
  const rows = await sql<Array<{
    cycle: string; count: string | number;
    volume: string | number; pnl: string | number;
    wins: string | number; losses: string | number;
  }>>`
    WITH weeks AS (
      SELECT generate_series(
        date_trunc('week', NOW() - (${lookbackInterval}::interval - interval '7 days')),
        date_trunc('week', NOW()),
        interval '7 days'
      ) AS cycle_start
    ),
    samples AS (
      SELECT
        date_trunc('week', ts AT TIME ZONE 'UTC') AS cycle_start,
        COUNT(*)::bigint AS count,
        COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0) AS volume,
        COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS pnl,
        COUNT(*) FILTER (WHERE realized_pnl > 0)::bigint AS wins,
        COUNT(*) FILTER (WHERE realized_pnl < 0)::bigint AS losses
      FROM signals
      WHERE ts >= NOW() - (${lookbackInterval}::interval)
        AND ${sql(filterCol)} = ${filterVal}
        AND EXTRACT(dow FROM ts AT TIME ZONE 'UTC')::int = ${args.slot}
      GROUP BY 1
    )
    SELECT
      to_char(w.cycle_start, 'YYYY-MM-DD') AS cycle,
      COALESCE(s.count, 0)  AS count,
      COALESCE(s.volume, 0) AS volume,
      COALESCE(s.pnl, 0)    AS pnl,
      COALESCE(s.wins, 0)   AS wins,
      COALESCE(s.losses, 0) AS losses
    FROM weeks w
    LEFT JOIN samples s ON s.cycle_start = w.cycle_start
    ORDER BY w.cycle_start ASC
  `;
  return rows.map((r) => {
    const wins = num(r.wins);
    const losses = num(r.losses);
    const decided = wins + losses;
    return {
      cycle: r.cycle,
      count: num(r.count),
      volume: num(r.volume),
      pnl: num(r.pnl),
      winRate: decided > 0 ? wins / decided : null,
    };
  });
}

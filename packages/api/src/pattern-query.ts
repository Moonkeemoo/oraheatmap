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
};

export type PatternCell = PatternCellValues & {
  /** Recent-half minus older-half. winRate delta is null when either side has no decided exits. */
  delta: PatternCellValues;
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

const ZERO_VALUES: PatternCellValues = { count: 0, volume: 0, pnl: 0, winRate: null };

function emptyCell(): PatternCell {
  return {
    ...ZERO_VALUES,
    delta: { ...ZERO_VALUES },
    sampleCount: 0,
    min: { count: 0, volume: 0, pnl: 0 },
    max: { count: 0, volume: 0, pnl: 0 },
  };
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
  recent_count: string | number | null;
  older_count: string | number | null;
  recent_volume: string | number | null;
  older_volume: string | number | null;
  recent_pnl: string | number | null;
  older_pnl: string | number | null;
  recent_wins: string | number | null;
  recent_losses: string | number | null;
  older_wins: string | number | null;
  older_losses: string | number | null;
  recent_sample_count: string | number;
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
  const half = lookbackDays / 2;
  // Top level reads from the hourly continuous aggregate (cheap). Drill mode
  // can't — the agg doesn't carry subcategory — so we scan raw signals
  // directly. For 30-day default that's heavier (~1-2s for busy categories)
  // but acceptable for a click action.
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
          COUNT(*) FILTER (WHERE realized_pnl < 0)                           AS slot_losses
        FROM signals
        WHERE ts >= NOW() - (${`${lookbackDays} days`}::interval)
          AND category = ${drillCategory}
          AND subcategory IS NOT NULL
        GROUP BY day, slot, subcategory
      ),
      split AS (
        SELECT
          slot, category,
          slot_signals AS signal_count,
          slot_volume  AS buy_volume_usd,
          slot_pnl     AS realized_pnl_sum,
          slot_wins    AS win_count,
          slot_losses  AS loss_count,
          CASE
            WHEN day >= NOW() - (${`${half} days`}::interval) THEN 'recent'
            ELSE 'older'
          END AS period
        FROM per_day_slot
      )
      SELECT
        slot, category,
        AVG(signal_count)    FILTER (WHERE period='recent') AS recent_count,
        AVG(signal_count)    FILTER (WHERE period='older')  AS older_count,
        AVG(buy_volume_usd)  FILTER (WHERE period='recent') AS recent_volume,
        AVG(buy_volume_usd)  FILTER (WHERE period='older')  AS older_volume,
        AVG(realized_pnl_sum) FILTER (WHERE period='recent') AS recent_pnl,
        AVG(realized_pnl_sum) FILTER (WHERE period='older')  AS older_pnl,
        SUM(win_count)  FILTER (WHERE period='recent') AS recent_wins,
        SUM(loss_count) FILTER (WHERE period='recent') AS recent_losses,
        SUM(win_count)  FILTER (WHERE period='older')  AS older_wins,
        SUM(loss_count) FILTER (WHERE period='older')  AS older_losses,
        COUNT(*) FILTER (WHERE period='recent')::bigint AS recent_sample_count,
        MIN(signal_count)    AS min_count,
        MAX(signal_count)    AS max_count,
        MIN(buy_volume_usd)  AS min_volume,
        MAX(buy_volume_usd)  AS max_volume,
        MIN(realized_pnl_sum) AS min_pnl,
        MAX(realized_pnl_sum) AS max_pnl
      FROM split
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
        SUM(loss_count)       AS slot_losses
      FROM signals_hourly
      WHERE bucket >= NOW() - (${`${lookbackDays} days`}::interval)
      GROUP BY day, slot, category
    ),
    split AS (
      SELECT
        slot, category,
        slot_signals AS signal_count,
        slot_volume  AS buy_volume_usd,
        slot_pnl     AS realized_pnl_sum,
        slot_wins    AS win_count,
        slot_losses  AS loss_count,
        CASE
          WHEN day >= NOW() - (${`${half} days`}::interval) THEN 'recent'
          ELSE 'older'
        END AS period
      FROM per_day_slot
    )
    SELECT
      slot, category,
      AVG(signal_count)    FILTER (WHERE period='recent') AS recent_count,
      AVG(signal_count)    FILTER (WHERE period='older')  AS older_count,
      AVG(buy_volume_usd)  FILTER (WHERE period='recent') AS recent_volume,
      AVG(buy_volume_usd)  FILTER (WHERE period='older')  AS older_volume,
      AVG(realized_pnl_sum) FILTER (WHERE period='recent') AS recent_pnl,
      AVG(realized_pnl_sum) FILTER (WHERE period='older')  AS older_pnl,
      SUM(win_count)  FILTER (WHERE period='recent') AS recent_wins,
      SUM(loss_count) FILTER (WHERE period='recent') AS recent_losses,
      SUM(win_count)  FILTER (WHERE period='older')  AS older_wins,
      SUM(loss_count) FILTER (WHERE period='older')  AS older_losses,
      COUNT(*) FILTER (WHERE period='recent')::bigint AS recent_sample_count,
      MIN(signal_count)    AS min_count,
      MAX(signal_count)    AS max_count,
      MIN(buy_volume_usd)  AS min_volume,
      MAX(buy_volume_usd)  AS max_volume,
      MIN(realized_pnl_sum) AS min_pnl,
      MAX(realized_pnl_sum) AS max_pnl
    FROM split
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
  const half = lookbackDays / 2;
  // Same drill-vs-aggregate split as queryHourOfDayRows.
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
          COUNT(*) FILTER (WHERE realized_pnl < 0)                           AS day_losses
        FROM signals
        WHERE ts >= NOW() - (${`${lookbackDays} days`}::interval)
          AND category = ${drillCategory}
          AND subcategory IS NOT NULL
        GROUP BY day, slot, subcategory
      ),
      split AS (
        SELECT *,
          CASE
            WHEN day >= NOW() - (${`${half} days`}::interval) THEN 'recent'
            ELSE 'older'
          END AS period
        FROM per_day
      )
      SELECT
        slot, category,
        AVG(day_signals) FILTER (WHERE period='recent') AS recent_count,
        AVG(day_signals) FILTER (WHERE period='older')  AS older_count,
        AVG(day_volume)  FILTER (WHERE period='recent') AS recent_volume,
        AVG(day_volume)  FILTER (WHERE period='older')  AS older_volume,
        AVG(day_pnl)     FILTER (WHERE period='recent') AS recent_pnl,
        AVG(day_pnl)     FILTER (WHERE period='older')  AS older_pnl,
        SUM(day_wins)    FILTER (WHERE period='recent') AS recent_wins,
        SUM(day_losses)  FILTER (WHERE period='recent') AS recent_losses,
        SUM(day_wins)    FILTER (WHERE period='older')  AS older_wins,
        SUM(day_losses)  FILTER (WHERE period='older')  AS older_losses,
        COUNT(*) FILTER (WHERE period='recent')::bigint AS recent_sample_count,
        MIN(day_signals) AS min_count,
        MAX(day_signals) AS max_count,
        MIN(day_volume)  AS min_volume,
        MAX(day_volume)  AS max_volume,
        MIN(day_pnl)     AS min_pnl,
        MAX(day_pnl)     AS max_pnl
      FROM split
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
        SUM(loss_count)       AS day_losses
      FROM signals_hourly
      WHERE bucket >= NOW() - (${`${lookbackDays} days`}::interval)
      GROUP BY day, slot, category
    ),
    split AS (
      SELECT *,
        CASE
          WHEN day >= NOW() - (${`${half} days`}::interval) THEN 'recent'
          ELSE 'older'
        END AS period
      FROM per_day
    )
    SELECT
      slot, category,
      AVG(day_signals) FILTER (WHERE period='recent') AS recent_count,
      AVG(day_signals) FILTER (WHERE period='older')  AS older_count,
      AVG(day_volume)  FILTER (WHERE period='recent') AS recent_volume,
      AVG(day_volume)  FILTER (WHERE period='older')  AS older_volume,
      AVG(day_pnl)     FILTER (WHERE period='recent') AS recent_pnl,
      AVG(day_pnl)     FILTER (WHERE period='older')  AS older_pnl,
      SUM(day_wins)    FILTER (WHERE period='recent') AS recent_wins,
      SUM(day_losses)  FILTER (WHERE period='recent') AS recent_losses,
      SUM(day_wins)    FILTER (WHERE period='older')  AS older_wins,
      SUM(day_losses)  FILTER (WHERE period='older')  AS older_losses,
      COUNT(*) FILTER (WHERE period='recent')::bigint AS recent_sample_count,
      MIN(day_signals) AS min_count,
      MAX(day_signals) AS max_count,
      MIN(day_volume)  AS min_volume,
      MAX(day_volume)  AS max_volume,
      MIN(day_pnl)     AS min_pnl,
      MAX(day_pnl)     AS max_pnl
    FROM split
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

    const recentCount = num(r.recent_count);
    const olderCount = num(r.older_count);
    const recentVolume = num(r.recent_volume);
    const olderVolume = num(r.older_volume);
    const recentPnl = num(r.recent_pnl);
    const olderPnl = num(r.older_pnl);
    const recentWR = winRateOf(num(r.recent_wins), num(r.recent_losses));
    const olderWR = winRateOf(num(r.older_wins), num(r.older_losses));

    const cell = cells[key]?.[idx];
    if (!cell) continue;
    cell.count = recentCount;
    cell.volume = recentVolume;
    cell.pnl = recentPnl;
    cell.winRate = recentWR;
    cell.delta = {
      count: recentCount - olderCount,
      volume: recentVolume - olderVolume,
      pnl: recentPnl - olderPnl,
      winRate: recentWR !== null && olderWR !== null ? recentWR - olderWR : null,
    };
    cell.sampleCount = num(r.recent_sample_count);
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

  // day-of-week → per-week samples
  const cycles = args.cycles ?? 26;
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

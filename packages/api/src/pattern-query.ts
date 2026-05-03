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
  buckets: ReadonlyArray<PatternBucket>;
  cells: Record<Category, PatternCell[]>;
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

function hourLabel(hour: number): string {
  return String(hour).padStart(2, "0") + ":00";
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
): Promise<ReadonlyArray<AggRow>> {
  const half = lookbackDays / 2;
  const rows = await sql<AggRow[]>`
    WITH split AS (
      SELECT
        EXTRACT(hour FROM bucket AT TIME ZONE 'UTC')::int AS slot,
        category,
        signal_count, buy_volume_usd, realized_pnl_sum, win_count, loss_count,
        CASE
          WHEN bucket >= NOW() - (${`${half} days`}::interval) THEN 'recent'
          ELSE 'older'
        END AS period
      FROM signals_hourly
      WHERE bucket >= NOW() - (${`${lookbackDays} days`}::interval)
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
): Promise<ReadonlyArray<AggRow>> {
  const half = lookbackDays / 2;
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
    return Array.from({ length: 24 }, (_, h) => ({ slot: h, label: hourLabel(h) }));
  }
  return DOW_DISPLAY_ORDER.map((d) => ({ slot: d, label: dayOfWeekLabel(d) }));
}

export function assemblePattern(
  rows: ReadonlyArray<AggRow>,
  kind: PatternKind,
  lookbackDays: number,
): PatternResponse {
  const slotOrder = buildSlotOrder(kind);
  const slotIndex = new Map(slotOrder.map((s, i) => [s.slot, i]));
  const buckets: PatternBucket[] = slotOrder.map((s, i) => ({ label: s.label, index: i }));

  const cells = Object.fromEntries(
    CATEGORIES.map((c) => [c, slotOrder.map(() => emptyCell())]),
  ) as Record<Category, PatternCell[]>;

  for (const r of rows) {
    const cat = toCategory(r.category);
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

    const cell = cells[cat][idx];
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

  return { kind, lookbackDays, buckets, cells };
}

// ─── Public entry ────────────────────────────────────────────────────────────

export async function queryPattern(
  sql: Sql,
  kind: PatternKind,
  lookbackDays: number,
): Promise<PatternResponse> {
  const rows =
    kind === "hour-of-day"
      ? await queryHourOfDayRows(sql, lookbackDays)
      : await queryDayOfWeekRows(sql, lookbackDays);
  return assemblePattern(rows, kind, lookbackDays);
}

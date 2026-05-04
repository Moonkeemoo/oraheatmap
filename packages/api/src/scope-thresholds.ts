/**
 * Magnitude tagger — turns each signal into a per-metric magnitude
 * ("huge" / "big" / null) relative to its scope's distribution. The
 * dashboard then shows a highlight plaque tied to the active metric:
 *
 *   - Volume metric → tag is set when size*price exceeds the BUY-only
 *     P95/P99 in scope. Direction = side (BUY/SELL).
 *   - PnL metric    → tag is set when |realized_pnl| exceeds the exits-only
 *     P95/P99 in scope. Direction = sign of realized_pnl (win/loss).
 *
 * Scope levels (most-specific first):
 *   L3:  (category, subcategory, condition_id)
 *   L2:  (category, subcategory)
 *   L1:  (category)
 *
 * The `signal_thresholds` materialised view holds 7-day-rolling P95 / P99
 * for both metrics in one row per scope. Refreshed hourly via cron on prod.
 *
 * Lookup walks deepest → shallowest until it hits a row with sample_n ≥
 * MIN_SAMPLE_N for the requested metric. Below that the distribution is
 * too thin to trust; we fall back to the parent scope so brand-new markets
 * don't fire spurious "huge" badges the moment they get their second trade.
 */

import type { Sql } from "postgres";
import { log } from "./log";

const MIN_SAMPLE_N = 50;

type ThresholdRow = {
  category: string;
  subcategory: string | null;
  condition_id: string | null;
  sample_volume_n: string | number | null;
  p95_volume: string | number | null;
  p99_volume: string | number | null;
  sample_pnl_n: string | number | null;
  p95_pnl: string | number | null;
  p99_pnl: string | number | null;
};

type Threshold = {
  volume: { p95: number; p99: number; sampleN: number } | null;
  pnl:    { p95: number; p99: number; sampleN: number } | null;
};

export type Magnitude = "huge" | "big" | null;
export type SignalMagnitudes = { volume: Magnitude; pnl: Magnitude };

export type ScopeThresholds = {
  /** Tag a signal with both volume + pnl magnitudes for its scope. */
  magnitudesFor(args: {
    category: string;
    subcategory: string | null;
    conditionId: string | null;
    sizeUsd: number;
    realizedPnl: number | null;
    side: "BUY" | "SELL" | "SETTLEMENT";
  }): SignalMagnitudes;
  /** Force a refresh from the materialised view. */
  refresh(): Promise<void>;
  stop(): void;
};

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function keyOf(category: string, subcategory: string | null, conditionId: string | null): string {
  return `${category}|${subcategory ?? ""}|${conditionId ?? ""}`;
}

function magnitudeFromThreshold(value: number, t: Threshold["volume"]): Magnitude {
  if (!t || t.sampleN < MIN_SAMPLE_N) return null;
  if (value >= t.p99) return "huge";
  if (value >= t.p95) return "big";
  return null;
}

export async function createScopeThresholds(
  sql: Sql,
  reloadIntervalMs: number = 60 * 60 * 1000,
): Promise<ScopeThresholds> {
  const map = new Map<string, Threshold>();

  async function load(): Promise<void> {
    try {
      const rows = await sql<ThresholdRow[]>`
        SELECT category, subcategory, condition_id,
               sample_volume_n, p95_volume, p99_volume,
               sample_pnl_n,    p95_pnl,    p99_pnl
        FROM signal_thresholds
      `;
      const next = new Map<string, Threshold>();
      for (const r of rows) {
        const volSampleN = num(r.sample_volume_n);
        const pnlSampleN = num(r.sample_pnl_n);
        next.set(keyOf(r.category, r.subcategory, r.condition_id), {
          volume: volSampleN > 0 && r.p95_volume !== null ? {
            p95: num(r.p95_volume), p99: num(r.p99_volume), sampleN: volSampleN,
          } : null,
          pnl: pnlSampleN > 0 && r.p95_pnl !== null ? {
            p95: num(r.p95_pnl), p99: num(r.p99_pnl), sampleN: pnlSampleN,
          } : null,
        });
      }
      map.clear();
      for (const [k, v] of next) map.set(k, v);
      log.info("scope thresholds loaded", { rows: map.size });
    } catch (err) {
      log.warn("scope thresholds load failed", { err: (err as Error).message });
    }
  }

  await load();
  const timer = setInterval(() => void load(), reloadIntervalMs);
  if (typeof timer.unref === "function") timer.unref();

  function lookup(
    category: string,
    subcategory: string | null,
    conditionId: string | null,
    metric: "volume" | "pnl",
  ): Threshold["volume"] | null {
    const candidates: ReadonlyArray<[string, string | null, string | null]> = [
      [category, subcategory, conditionId],
      [category, subcategory, null],
      [category, null, null],
    ];
    for (const [c, s, cid] of candidates) {
      const t = map.get(keyOf(c, s, cid));
      if (!t) continue;
      const slot = metric === "volume" ? t.volume : t.pnl;
      if (slot && slot.sampleN >= MIN_SAMPLE_N) return slot;
    }
    return null;
  }

  return {
    magnitudesFor({ category, subcategory, conditionId, sizeUsd, realizedPnl, side }) {
      // Volume — only meaningful for BUYs (the watched-money-moving-in side).
      const volMag: Magnitude =
        side === "BUY" && Number.isFinite(sizeUsd) && sizeUsd > 0
          ? magnitudeFromThreshold(sizeUsd, lookup(category, subcategory, conditionId, "volume"))
          : null;
      // PnL — only realised exits (SELL or RESOLUTION) carry a non-null
      // realized_pnl. Compare on absolute value; sign is conveyed by the
      // realizedPnl field itself when the frontend renders the plaque.
      const pnlMag: Magnitude =
        realizedPnl !== null && Number.isFinite(realizedPnl)
          ? magnitudeFromThreshold(Math.abs(realizedPnl), lookup(category, subcategory, conditionId, "pnl"))
          : null;
      return { volume: volMag, pnl: pnlMag };
    },
    refresh: load,
    stop: () => clearInterval(timer),
  };
}

/**
 * Magnitude tagger — turns a raw trade $ size into "huge" / "big" / null
 * relative to the volume distribution at its scope. A $200 buy on a sleepy
 * Tennis market is huge; a $200 buy on Bitcoin Up-or-Down is noise.
 *
 * Scope levels (most-specific first):
 *   L3:  (category, subcategory, condition_id)
 *   L2:  (category, subcategory)
 *   L1:  (category)
 *
 * The `signal_thresholds` materialised view holds P95 / P99 of `size*price`
 * over the last 7 days of BUY signals, computed via GROUPING SETS so all
 * three levels are populated in one pass. Refreshed hourly via cron on prod.
 *
 * Lookup walks deepest → shallowest until it hits a row with sample_n ≥
 * MIN_SAMPLE_N. Below that the distribution is too thin to trust; we fall
 * back to the parent scope so brand-new markets don't fire an "huge" badge
 * the moment they get their second trade.
 */

import type { Sql } from "postgres";
import { log } from "./log";

const MIN_SAMPLE_N = 50;

type ThresholdRow = {
  category: string;
  subcategory: string | null;
  condition_id: string | null;
  sample_n: string | number; // postgres returns bigint as string
  p95: string | number;
  p99: string | number;
};

type Threshold = { p95: number; p99: number; sampleN: number };

export type Magnitude = "huge" | "big" | null;

export type ScopeThresholds = {
  /** Tag a signal's magnitude based on its scope and BUY USD value. NULL for non-BUY. */
  magnitudeFor(args: {
    category: string;
    subcategory: string | null;
    conditionId: string | null;
    sizeUsd: number;
    side: "BUY" | "SELL" | "SETTLEMENT";
  }): Magnitude;
  /** Force a refresh from the materialised view (e.g. after cron rebuild). */
  refresh(): Promise<void>;
  /** Stop the background reload timer. */
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

export async function createScopeThresholds(
  sql: Sql,
  reloadIntervalMs: number = 60 * 60 * 1000,
): Promise<ScopeThresholds> {
  const map = new Map<string, Threshold>();

  async function load(): Promise<void> {
    try {
      const rows = await sql<ThresholdRow[]>`
        SELECT category, subcategory, condition_id, sample_n, p95, p99
        FROM signal_thresholds
      `;
      const next = new Map<string, Threshold>();
      for (const r of rows) {
        next.set(keyOf(r.category, r.subcategory, r.condition_id), {
          p95: num(r.p95),
          p99: num(r.p99),
          sampleN: num(r.sample_n),
        });
      }
      map.clear();
      for (const [k, v] of next) map.set(k, v);
      log.info("scope thresholds loaded", { rows: map.size });
    } catch (err) {
      // The view might not exist on a brand-new DB. Log and continue with an
      // empty map; magnitudeFor() then returns null for everything, which is
      // the safe default (no spurious animations).
      log.warn("scope thresholds load failed", { err: (err as Error).message });
    }
  }

  await load();
  const timer = setInterval(() => void load(), reloadIntervalMs);
  if (typeof timer.unref === "function") timer.unref();

  return {
    magnitudeFor({ category, subcategory, conditionId, sizeUsd, side }): Magnitude {
      // The materialised view is computed off BUY signals only — running a SELL
      // through these P95/P99 thresholds would compare oranges to apples.
      if (side !== "BUY") return null;
      if (!Number.isFinite(sizeUsd) || sizeUsd <= 0) return null;

      // Walk deepest → shallowest. First scope with enough samples wins.
      const candidates: ReadonlyArray<[string, string | null, string | null]> = [
        [category, subcategory, conditionId],
        [category, subcategory, null],
        [category, null, null],
      ];
      for (const [c, s, cid] of candidates) {
        const t = map.get(keyOf(c, s, cid));
        if (!t || t.sampleN < MIN_SAMPLE_N) continue;
        if (sizeUsd >= t.p99) return "huge";
        if (sizeUsd >= t.p95) return "big";
        return null;
      }
      return null;
    },
    refresh: load,
    stop: () => clearInterval(timer),
  };
}

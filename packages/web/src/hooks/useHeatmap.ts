"use client";

import { useEffect, useRef, useState } from "react";
import { fetchHeatmap } from "@/lib/api";
import type {
  Category,
  HeatmapResponse,
  LiveRange,
  MacroKind,
  Mode,
  PatternKind,
  Subject,
} from "@/lib/types";

const REFRESH_MS_LIVE: Record<LiveRange, number> = {
  "1h": 10_000,
  "24h": 30_000,
  "12d": 60_000,
  "12w": 180_000,
};

// PATTERN refreshes are slower — averages over weeks don't shift each second.
const REFRESH_MS_PATTERN = 60_000;

/** Module-level LRU cache of the last N responses keyed by params.
 *  Survives hook re-mounts within the SPA session — switching back to a
 *  recently-viewed mode/range combo paints from cache instantly while
 *  the revalidate fetch runs in the background. Cap kept small (16) so
 *  payloads (heatmap responses are 50-300 KB) don't blow up memory on a
 *  long session. */
const CLIENT_CACHE_CAP = 16;
const clientCache = new Map<string, HeatmapResponse>();
function cacheKeyFor(args: {
  mode: Mode;
  subject: Subject;
  range?: LiveRange;
  kind?: PatternKind;
  macroKind?: MacroKind;
  lookbackDays?: number;
  drillCategory?: Category | null;
  drillSubcategory?: string | null;
}): string {
  return [
    args.subject,
    args.mode,
    args.range ?? "",
    args.kind ?? "",
    args.macroKind ?? "",
    args.lookbackDays ?? "",
    args.drillCategory ?? "",
    args.drillSubcategory ?? "",
  ].join("|");
}
function cachePut(key: string, value: HeatmapResponse): void {
  if (clientCache.has(key)) clientCache.delete(key); // refresh recency
  clientCache.set(key, value);
  while (clientCache.size > CLIENT_CACHE_CAP) {
    const first = clientCache.keys().next().value;
    if (first === undefined) break;
    clientCache.delete(first);
  }
}

export type UseHeatmapResult = {
  data: HeatmapResponse | null;
  loading: boolean;
  error: string | null;
};

/**
 * Fetches heatmap data with stale-while-revalidate semantics.
 *
 * UX goal: switching mode / range / metric should feel instant when
 * we've seen that combo recently. Two layers of "show what we have
 * while we fetch fresh":
 *
 * 1. **Last data persists across param changes**. Previously the
 *    effect did `setData(null)` on every switch, forcing the
 *    HeatmapSkeleton to flash for ~1 fetch tick even when the backend
 *    was returning a cache-hit in 30 ms. Now we keep the previous
 *    response visible — cells just swap in place when the new one
 *    arrives. `loading` still goes true so callers can render their
 *    own subtle indicator if they want, but the grid stays alive.
 *
 * 2. **Module-level LRU cache** keyed by params. On effect re-run we
 *    immediately hydrate from cache if the key is known, so flipping
 *    1h → 24h → 1h paints the 1h grid from memory while the fetch
 *    revalidates in the background.
 */
export function useHeatmap(args: {
  mode: Mode;
  subject: Subject;
  range?: LiveRange;
  kind?: PatternKind;
  macroKind?: MacroKind;
  lookbackDays?: number;
  drillCategory?: Category | null;
  drillSubcategory?: string | null;
}): UseHeatmapResult {
  const [data, setData] = useState<HeatmapResponse | null>(() => {
    // Initial mount: hydrate from cache if available so the grid has
    // something to render while the first fetch runs.
    return clientCache.get(cacheKeyFor(args)) ?? null;
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // Track the last applied key so we don't accidentally render data
  // that belongs to a previous (cancelled) param set when the user
  // switches faster than the network. Effect cleanup sets a flag,
  // but a fast successive switch can still race — the key check
  // doubles as a guard.
  const lastAppliedKeyRef = useRef<string>("");

  const refreshMs =
    args.mode === "live"
      ? REFRESH_MS_LIVE[args.range ?? "1h"]
      : REFRESH_MS_PATTERN;

  useEffect(() => {
    let cancelled = false;
    const key = cacheKeyFor(args);

    // Hydrate from cache synchronously if we have a stale snapshot
    // — paints the Grid in <1 frame while the fetch revalidates.
    // When the key changes AND we don't have a cache for the new
    // one, drop to skeleton — keeping the previous mode's grid up
    // would mismatch row labels (e.g. categories ↔ whale addrs on
    // a subject switch). Same-key revalidates keep current data.
    const cached = clientCache.get(key);
    if (cached) {
      setData(cached);
      lastAppliedKeyRef.current = key;
    } else if (lastAppliedKeyRef.current && lastAppliedKeyRef.current !== key) {
      setData(null);
    }
    setLoading(true);

    const doFetch = async (): Promise<void> => {
      try {
        const r = await fetchHeatmap(args);
        if (cancelled) return;
        cachePut(key, r);
        setData(r);
        lastAppliedKeyRef.current = key;
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void doFetch();
    const id = setInterval(() => void doFetch(), refreshMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    args.mode,
    args.subject,
    args.range,
    args.kind,
    args.macroKind,
    args.lookbackDays,
    args.drillCategory,
    args.drillSubcategory,
  ]);

  return { data, loading, error };
}

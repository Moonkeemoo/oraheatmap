"use client";

import { useEffect, useState } from "react";
import { fetchHeatmap } from "@/lib/api";
import type {
  Category,
  HeatmapResponse,
  LiveRange,
  MacroKind,
  Mode,
  PatternKind,
} from "@/lib/types";

const REFRESH_MS_LIVE: Record<LiveRange, number> = {
  "1h": 10_000,
  "24h": 30_000,
  "12d": 60_000,
  "12w": 180_000,
};

// PATTERN refreshes are slower — averages over weeks don't shift each second.
const REFRESH_MS_PATTERN = 60_000;

export type UseHeatmapResult = {
  data: HeatmapResponse | null;
  loading: boolean;
  error: string | null;
};

export function useHeatmap(args: {
  mode: Mode;
  subject: import("@/lib/types").Subject;
  range?: LiveRange;
  kind?: PatternKind;
  macroKind?: MacroKind;
  lookbackDays?: number;
  drillCategory?: Category | null;
  drillSubcategory?: string | null;
}): UseHeatmapResult {
  const [data, setData] = useState<HeatmapResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshMs =
    args.mode === "live"
      ? REFRESH_MS_LIVE[args.range ?? "1h"]
      : REFRESH_MS_PATTERN;

  useEffect(() => {
    // Per-effect cancellation flag — closed over by every fetch in this
    // cycle. Cleanup flips it; the NEXT effect run gets a fresh `let
    // cancelled = false` in its own scope so old in-flight fetches can't
    // accidentally "uncancel" themselves.
    //
    // Earlier this was a useRef shared across the hook lifetime. The
    // bug: switching 24h → 12d, the in-flight 24h fetch was still
    // pending when the cleanup set cancelledRef = true; then the new
    // effect reset it to false; when the 24h fetch finally resolved
    // it saw cancelledRef = false and called setData(stale 24h data),
    // overwriting the freshly-fetched 12d data. UI showed 12D button
    // active but the heatmap stayed in 2h-bucket shape.
    let cancelled = false;

    const doFetch = async (): Promise<void> => {
      try {
        const r = await fetchHeatmap(args);
        if (cancelled) return;
        setData(r);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // Drop the previous mode's data so the Grid doesn't render a half-mixed
    // state (e.g. live cells with pattern bucket count) until the new
    // response arrives. UI shows the loading state for ~1 fetch tick.
    setData(null);
    setLoading(true);
    void doFetch();
    const id = setInterval(() => void doFetch(), refreshMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.mode, args.subject, args.range, args.kind, args.macroKind, args.lookbackDays, args.drillCategory, args.drillSubcategory]);

  return { data, loading, error };
}

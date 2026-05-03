"use client";

import { useEffect, useRef, useState } from "react";
import { fetchHeatmap } from "@/lib/api";
import type { Category, HeatmapResponse, LiveRange, Mode, PatternKind } from "@/lib/types";

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
  refetch(): Promise<void>;
};

export function useHeatmap(args: {
  mode: Mode;
  range?: LiveRange;
  kind?: PatternKind;
  lookbackDays?: number;
  drillCategory?: Category | null;
}): UseHeatmapResult {
  const [data, setData] = useState<HeatmapResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const refreshMs =
    args.mode === "live"
      ? REFRESH_MS_LIVE[args.range ?? "1h"]
      : REFRESH_MS_PATTERN;

  const fetchOnce = async (): Promise<void> => {
    try {
      const r = await fetchHeatmap(args);
      if (cancelledRef.current) return;
      setData(r);
      setError(null);
    } catch (err) {
      if (cancelledRef.current) return;
      setError((err as Error).message);
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    cancelledRef.current = false;
    // Drop the previous mode's data so the Grid doesn't render a half-mixed
    // state (e.g. live cells with pattern bucket count) until the new
    // response arrives. UI shows the loading state for ~1 fetch tick.
    setData(null);
    setLoading(true);
    void fetchOnce();
    const id = setInterval(() => void fetchOnce(), refreshMs);
    return () => {
      cancelledRef.current = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.mode, args.range, args.kind, args.lookbackDays, args.drillCategory]);

  return { data, loading, error, refetch: fetchOnce };
}

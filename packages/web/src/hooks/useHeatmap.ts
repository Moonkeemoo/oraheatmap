"use client";

import { useEffect, useRef, useState } from "react";
import { fetchHeatmap } from "@/lib/api";
import type { HeatmapRange, HeatmapResponse } from "@/lib/types";

// How often to re-fetch the heatmap per range. Shorter ranges → faster
// refresh because the data shifts more often. Longer ranges → keep cheap.
const REFRESH_MS: Record<HeatmapRange, number> = {
  "1h": 10_000,
  "24h": 30_000,
  "7d": 60_000,
  "30d": 120_000,
};

export type UseHeatmapResult = {
  data: HeatmapResponse | null;
  loading: boolean;
  error: string | null;
  refetch(): Promise<void>;
};

export function useHeatmap(range: HeatmapRange): UseHeatmapResult {
  const [data, setData] = useState<HeatmapResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const fetchOnce = async (): Promise<void> => {
    try {
      const r = await fetchHeatmap(range);
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
    setLoading(true);
    void fetchOnce();
    const id = setInterval(() => void fetchOnce(), REFRESH_MS[range]);
    return () => {
      cancelledRef.current = true;
      clearInterval(id);
    };
    // fetchOnce is stable because it closes over latest range via closure;
    // we recreate the interval on range change above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  return { data, loading, error, refetch: fetchOnce };
}

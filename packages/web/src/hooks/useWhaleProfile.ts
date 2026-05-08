"use client";

import { useEffect, useRef, useState } from "react";
import { fetchWhaleProfile, isAbortError } from "@/lib/api";
import type { LiveRange, WhaleProfile } from "@/lib/types";

const REFRESH_MS: Record<LiveRange, number> = {
  "1h":  10_000,
  "24h": 30_000,
  "12d": 60_000,
  "12w": 180_000,
};

export type UseWhaleProfileResult = {
  data: WhaleProfile | null;
  loading: boolean;
  error: string | null;
};

/** Fetches a whale's per-window profile (stats + categoryMix + open positions
 *  + recent trades). Re-fetches on the same cadence the heatmap uses for the
 *  active range; bails cleanly when `addr` is null (drawer closed). */
export function useWhaleProfile(args: {
  addr: string | null;
  range: LiveRange;
}): UseWhaleProfileResult {
  const [data, setData] = useState<WhaleProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    if (!args.addr) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    setData(null);
    setLoading(true);
    const ac = new AbortController();
    const fetchOnce = async (): Promise<void> => {
      try {
        const r = await fetchWhaleProfile({ addr: args.addr!, range: args.range }, ac.signal);
        if (ac.signal.aborted) return;
        setData(r);
        setError(null);
      } catch (err) {
        if (ac.signal.aborted || isAbortError(err)) return;
        setError((err as Error).message);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    };
    void fetchOnce();
    const id = setInterval(() => void fetchOnce(), REFRESH_MS[args.range]);
    return () => {
      cancelledRef.current = true;
      ac.abort();
      clearInterval(id);
    };
  }, [args.addr, args.range]);

  return { data, loading, error };
}

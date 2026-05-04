"use client";

import { useEffect, useState } from "react";

import { apiBase } from "@/lib/api";

export type ProbabilityPoint = { t: number; p: number };
export type OutcomeSeries = {
  label: string;
  tokenId: string;
  points: ProbabilityPoint[];
};

export type MarketHistory = {
  conditionId: string;
  question: string | null;
  outcomes: OutcomeSeries[];
};

export type UseMarketHistory = {
  data: MarketHistory | null;
  loading: boolean;
  error: string | null;
};

export type MarketHistoryInterval = "1h" | "6h" | "1d" | "1w" | "1m" | "max";

/**
 * Fetches the multi-outcome probability history for a market on demand.
 * Used by the L3 locked tooltip — fires only when `enabled` flips true so
 * we don't spam the CLOB on every hover.
 */
export function useMarketHistory(
  conditionId: string | null,
  interval: MarketHistoryInterval,
  enabled: boolean,
): UseMarketHistory {
  const [data, setData] = useState<MarketHistory | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !conditionId) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(
      `${apiBase()}/api/market-history?conditionId=${encodeURIComponent(conditionId)}&interval=${interval}`,
      { cache: "no-store", credentials: "include" },
    )
      .then(async (r) => {
        if (!r.ok) throw new Error(`market-history ${r.status}`);
        return (await r.json()) as MarketHistory;
      })
      .then((body) => {
        if (cancelled) return;
        setData(body);
      })
      .catch((err) => {
        if (cancelled) return;
        setError((err as Error).message);
        setData(null);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, conditionId, interval]);

  return { data, loading, error };
}

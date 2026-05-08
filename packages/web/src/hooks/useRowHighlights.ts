"use client";

import { useEffect, useState } from "react";

import { apiBase, isAbortError } from "@/lib/api";
import type { HeatmapMetric, SignalEvent } from "@/lib/types";

export type HighlightTrade = SignalEvent & { multiplier: number };

export type HighlightMarket = {
  conditionId: string;
  marketQuestion: string | null;
  marketSlug: string | null;
  marketIcon: string | null;
  value: number;
  multiplier: number;
};

export type HighlightsResponse =
  | { metric: "pnl"; unit: "trade"; baseline: number; items: HighlightTrade[] }
  | {
      metric: "volume" | "signals" | "whales";
      unit: "market";
      baseline: number;
      items: HighlightMarket[];
    };

export type HighlightsScope = {
  category: string;
  subcategory?: string | null;
  conditionId?: string | null;
  fromTs: string;
  toTs: string;
};

/** WIN RATE has no meaningful "single standout" — it's an aggregate the
 *  Top whales section already surfaces. Returns null so the UI hides
 *  the section entirely. */
export function metricToHighlightKind(
  metric: HeatmapMetric,
): "pnl" | "volume" | "signals" | "whales" | null {
  if (metric === "winrate") return null;
  return metric;
}

export function useRowHighlights({
  scope,
  metric,
  enabled,
}: {
  scope: HighlightsScope | null;
  metric: "pnl" | "volume" | "signals" | "whales" | null;
  enabled: boolean;
}) {
  const [data, setData] = useState<HighlightsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !scope || !metric) {
      setData(null);
      setError(null);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      category: scope.category,
      metric,
      fromTs: scope.fromTs,
      toTs: scope.toTs,
      limit: "5",
    });
    if (scope.subcategory) params.set("subcategory", scope.subcategory);
    if (scope.conditionId) params.set("conditionId", scope.conditionId);
    fetch(`${apiBase()}/api/highlights?${params.toString()}`, {
      credentials: "include",
      signal: ac.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`highlights ${r.status}`);
        return (await r.json()) as HighlightsResponse;
      })
      .then((body) => {
        if (ac.signal.aborted) return;
        setData(body);
      })
      .catch((err) => {
        if (ac.signal.aborted || isAbortError(err)) return;
        setError((err as Error).message);
      })
      .finally(() => {
        if (ac.signal.aborted) return;
        setLoading(false);
      });
    return () => {
      ac.abort();
    };
  }, [
    enabled,
    metric,
    scope?.category,
    scope?.subcategory,
    scope?.conditionId,
    scope?.fromTs,
    scope?.toTs,
  ]);

  return { data, loading, error };
}

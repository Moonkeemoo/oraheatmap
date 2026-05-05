"use client";

import { useEffect, useState } from "react";

import { apiBase } from "@/lib/api";
import type { HeatmapMetric, SignalEvent } from "@/lib/types";

export type ReceiptsSort = "volume" | "pnl" | "abs_pnl" | "recent";

export type CellReceiptsScope = {
  category: string;
  subcategory?: string | null;
  conditionId?: string | null;
  fromTs?: string | null;
  toTs?: string | null;
};

/** Map the active heatmap metric to a receipts sort. PnL → biggest
 *  realised win/loss (signed); Volume → biggest BUY by USD; Whales /
 *  Trades / WinRate → recency (no obvious "single trade" criterion). */
export function metricToSort(metric: HeatmapMetric): ReceiptsSort {
  switch (metric) {
    case "pnl":
      return "abs_pnl";
    case "volume":
      return "volume";
    default:
      return "recent";
  }
}

export function useCellReceipts({
  scope,
  sort,
  limit,
  enabled,
}: {
  scope: CellReceiptsScope | null;
  sort: ReceiptsSort;
  limit: number;
  enabled: boolean;
}) {
  const [signals, setSignals] = useState<ReadonlyArray<SignalEvent>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !scope) {
      setSignals([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      category: scope.category,
      sort,
      limit: String(limit),
    });
    if (scope.subcategory) params.set("subcategory", scope.subcategory);
    if (scope.conditionId) params.set("conditionId", scope.conditionId);
    if (scope.fromTs) params.set("fromTs", scope.fromTs);
    if (scope.toTs) params.set("toTs", scope.toTs);
    fetch(`${apiBase()}/api/cell-receipts?${params.toString()}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`cell-receipts ${r.status}`);
        return (await r.json()) as { signals: SignalEvent[] };
      })
      .then((body) => {
        if (cancelled) return;
        setSignals(body.signals);
      })
      .catch((err) => {
        if (cancelled) return;
        setError((err as Error).message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, scope?.category, scope?.subcategory, scope?.conditionId, scope?.fromTs, scope?.toTs, sort, limit]);

  return { signals, loading, error };
}

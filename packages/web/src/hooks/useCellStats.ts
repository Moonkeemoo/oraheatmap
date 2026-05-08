"use client";

import { useEffect, useState } from "react";

import { apiBase, isAbortError } from "@/lib/api";
import type { MarketSummary, WhaleCellSummary } from "@/lib/types";

export type CellStats = {
  markets: ReadonlyArray<MarketSummary>;
  topWhales: ReadonlyArray<WhaleCellSummary>;
};

export type CellStatsScope = {
  category: string;
  subcategory?: string | null;
  conditionId?: string | null;
  fromTs: string;
  toTs: string;
};

/**
 * Lazy fetch of per-cell top markets + top whales for an arbitrary
 * scope+window. Used by MACRO mode tooltip — the macro response
 * skips per-cell aggregates (would dominate the 168-cell payload),
 * so the drawer fires this once on open.
 *
 * Cancels stale in-flight requests via per-effect closure flag so a
 * quick scope-change (e.g. user clicks one cell, then another, then
 * back) doesn't render results from the wrong cell.
 */
export function useCellStats({
  scope,
  enabled,
}: {
  scope: CellStatsScope | null;
  enabled: boolean;
}) {
  const [data, setData] = useState<CellStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !scope) {
      setData(null);
      setError(null);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      category: scope.category,
      fromTs: scope.fromTs,
      toTs: scope.toTs,
    });
    if (scope.subcategory) params.set("subcategory", scope.subcategory);
    if (scope.conditionId) params.set("conditionId", scope.conditionId);
    fetch(`${apiBase()}/api/cell-stats?${params.toString()}`, {
      credentials: "include",
      signal: ac.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`cell-stats ${r.status}`);
        return (await r.json()) as CellStats;
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
    scope?.category,
    scope?.subcategory,
    scope?.conditionId,
    scope?.fromTs,
    scope?.toTs,
  ]);

  return { data, loading, error };
}

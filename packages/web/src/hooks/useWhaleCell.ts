"use client";

import { useEffect, useState } from "react";
import { apiBase, isAbortError } from "@/lib/api";
import type { PatternKind } from "@/lib/types";

export type WhaleCellTrade = {
  ts: string;
  side: "BUY" | "SELL" | "SETTLEMENT";
  category: string;
  subcategory: string | null;
  conditionId: string | null;
  marketQuestion: string | null;
  marketSlug: string | null;
  size: number;
  price: number;
  sizeUsd: number;
  realizedPnl: number | null;
};

export type WhaleCellMarket = {
  conditionId: string;
  marketQuestion: string | null;
  marketSlug: string | null;
  marketIcon: string | null;
  signals: number;
  volume: number;
  pnl: number;
};

export type WhaleCellCycle = {
  cycle: string;
  count: number;
  volume: number;
  pnl: number;
};

export type WhaleCellSummary = {
  trades: number;
  volume: number;
  pnl: number;
  buyVolume: number;
  sellVolume: number;
  wins: number;
  losses: number;
};

export type WhaleCellResponse = {
  summary: WhaleCellSummary;
  trades: ReadonlyArray<WhaleCellTrade>;
  cycles: ReadonlyArray<WhaleCellCycle>;
  expectedCycles: number;
  markets: ReadonlyArray<WhaleCellMarket>;
};

export type WhaleCellScope = {
  addr: string;
  /** LIVE / MACRO — bucket time window. */
  fromTs?: string | null;
  toTs?: string | null;
  /** PATTERN — slot index + kind. */
  kind?: PatternKind | null;
  slot?: number | null;
};

/**
 * Lazy fetch of per-whale × per-cell details (trades / markets /
 * cycles / summary) for the whales-subject drawer that opens on cell
 * tap. Same loading + cancellation pattern as useCellStats /
 * useRecurringWhales — switching cells fast doesn't paint stale.
 */
export function useWhaleCell({
  scope,
  enabled,
}: {
  scope: WhaleCellScope | null;
  enabled: boolean;
}) {
  const [data, setData] = useState<WhaleCellResponse | null>(null);
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
    const params = new URLSearchParams({ addr: scope.addr });
    if (scope.fromTs) params.set("fromTs", scope.fromTs);
    if (scope.toTs) params.set("toTs", scope.toTs);
    if (scope.kind) params.set("kind", scope.kind);
    if (scope.slot !== undefined && scope.slot !== null) {
      params.set("slot", String(scope.slot));
    }
    fetch(`${apiBase()}/api/whale-cell?${params.toString()}`, {
      credentials: "include",
      signal: ac.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`whale-cell ${r.status}`);
        return (await r.json()) as WhaleCellResponse;
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
    scope?.addr,
    scope?.fromTs,
    scope?.toTs,
    scope?.kind,
    scope?.slot,
  ]);

  return { data, loading, error };
}

"use client";

import { useEffect, useState } from "react";

import { apiBase, isAbortError } from "@/lib/api";
import type { PatternKind } from "@/lib/types";

export type RecurringWhale = {
  addr: string;
  alias: string;
  color: string;
  profileImage: string | null;
  cycleHits: number;
  lastSeen: string;
  avgVolume: number;
  totalVolume: number;
};

export type SlotCharacter = {
  /** USD volume from BUY-side trades over the slot+lookback. */
  buyVolume: number;
  /** USD volume from SELL-side trades. */
  sellVolume: number;
  /** buyVolume / (buyVolume + sellVolume), clamped 0..1. */
  buyShare: number;
  /** Top-1 whale's share of total volume. 0..1. */
  top1Share: number;
  /** Top-3 whales' combined share. */
  top3Share: number;
  uniqueWhales: number;
  totalTrades: number;
  totalVolume: number;
};

export type RecurringWhalesResult = {
  whales: ReadonlyArray<RecurringWhale>;
  expectedCycles: number;
  lookbackDays: number;
  character: SlotCharacter;
};

export type RecurringWhalesScope = {
  category: string;
  subcategory?: string | null;
  conditionId?: string | null;
};

/**
 * Lazy fetch of "recurring whales" — wallets that appeared in this
 * pattern slot across multiple cycles. Used by the PATTERN-mode
 * tooltip drawer below the cycle histogram. Same loading/cancel
 * pattern as useCellStats so a quick scope/slot change doesn't paint
 * stale results from an earlier request.
 *
 * Backend computes "cycle" as DAY for hour-of-day or WEEK for day-of-
 * week, returning the top-5 by distinct-cycle count. Server also
 * surfaces `expectedCycles` so we can render "12 / 30" without
 * re-deriving kind→cycle math here.
 */
export function useRecurringWhales({
  scope,
  kind,
  slotIdx,
  lookbackDays,
  enabled,
}: {
  scope: RecurringWhalesScope | null;
  kind: PatternKind | null;
  slotIdx: number | null;
  lookbackDays: number;
  enabled: boolean;
}) {
  const [data, setData] = useState<RecurringWhalesResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !scope || !kind || slotIdx === null) {
      setData(null);
      setError(null);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      category: scope.category,
      kind,
      slotIdx: String(slotIdx),
      lookbackDays: String(lookbackDays),
    });
    if (scope.subcategory) params.set("subcategory", scope.subcategory);
    if (scope.conditionId) params.set("conditionId", scope.conditionId);
    fetch(`${apiBase()}/api/recurring-whales?${params.toString()}`, {
      credentials: "include",
      signal: ac.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`recurring-whales ${r.status}`);
        return (await r.json()) as RecurringWhalesResult;
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
    kind,
    slotIdx,
    lookbackDays,
  ]);

  return { data, loading, error };
}

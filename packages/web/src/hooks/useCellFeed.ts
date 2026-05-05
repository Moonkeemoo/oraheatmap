"use client";

import { useEffect, useRef, useState } from "react";

import { apiBase } from "@/lib/api";
import type { SignalEvent } from "@/lib/types";

const MAX_FEED = 30;

export type CellFeedScope = {
  category: string;
  subcategory?: string | null;
  conditionId?: string | null;
};

/**
 * Recent signals matching a heatmap cell's scope. Hybrid:
 *   1. REST /api/cell-feed on mount → seeds with the most recent 20.
 *   2. Caller pumps every SSE signal in via `ingest()` — when one matches
 *      the active scope it's prepended to the feed (with isFresh=true so
 *      the UI can flash it briefly). Caller already has the SSE subscription
 *      via the existing useSse hook in <Heatmap>; we don't open a second
 *      EventSource (the per-origin SSE budget bit us before).
 *
 * Capped at 30 items so a chatty market doesn't blow up the panel.
 */

export type FeedEntry = SignalEvent & { isFresh: boolean };

export function useCellFeed({
  scope,
  enabled,
}: {
  scope: CellFeedScope | null;
  enabled: boolean;
}) {
  const [entries, setEntries] = useState<ReadonlyArray<FeedEntry>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scopeRef = useRef<CellFeedScope | null>(null);
  scopeRef.current = scope;

  useEffect(() => {
    if (!enabled || !scope) {
      setEntries([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ category: scope.category, limit: "20" });
    if (scope.subcategory) params.set("subcategory", scope.subcategory);
    if (scope.conditionId) params.set("conditionId", scope.conditionId);
    fetch(`${apiBase()}/api/cell-feed?${params.toString()}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`cell-feed ${r.status}`);
        return (await r.json()) as { signals: SignalEvent[] };
      })
      .then((body) => {
        if (cancelled) return;
        setEntries(body.signals.map((s) => ({ ...s, isFresh: false })));
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
  }, [enabled, scope?.category, scope?.subcategory, scope?.conditionId]);

  // Mark "fresh" entries as stale after a short window so the highlight
  // doesn't pin forever. Runs only when there are fresh entries.
  useEffect(() => {
    if (!entries.some((e) => e.isFresh)) return;
    const id = setTimeout(() => {
      setEntries((prev) => prev.map((e) => ({ ...e, isFresh: false })));
    }, 2500);
    return () => clearTimeout(id);
  }, [entries]);

  function ingest(s: SignalEvent): void {
    if (!enabled) return;
    const cur = scopeRef.current;
    if (!cur) return;
    if (cur.conditionId) {
      if (s.conditionId !== cur.conditionId) return;
    } else if (cur.subcategory) {
      if (s.category !== cur.category || s.subcategory !== cur.subcategory) return;
    } else {
      if (s.category !== cur.category) return;
    }
    setEntries((prev) => {
      // Dedupe by txHash + side + size — the SSE callback can fire twice
      // for the same row in narrow timing windows (StrictMode in dev).
      const key = `${s.txHash ?? ""}|${s.side}|${s.size}|${s.price}`;
      if (prev.some((e) => `${e.txHash ?? ""}|${e.side}|${e.size}|${e.price}` === key)) {
        return prev;
      }
      const next: FeedEntry[] = [{ ...s, isFresh: true }, ...prev];
      return next.slice(0, MAX_FEED);
    });
  }

  return { entries, loading, error, ingest };
}

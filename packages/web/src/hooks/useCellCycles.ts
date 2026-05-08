"use client";

import { useEffect, useState } from "react";

import { apiBase, isAbortError } from "@/lib/api";
import type { PatternKind } from "@/lib/types";

export type CycleSample = {
  cycle: string;
  count: number;
  volume: number;
  pnl: number;
  winRate: number | null;
};

export type UseCellCycles = {
  samples: ReadonlyArray<CycleSample> | null;
  loading: boolean;
  error: string | null;
};

/**
 * Per-cell historical cycles for the locked PATTERN tooltip. Fetches lazily
 * when `enabled` flips true (i.e. user clicked a PATTERN cell to lock it).
 * The hook re-runs when the cell identity changes — slot / category /
 * subcategory in the args.
 */
export function useCellCycles(
  args: {
    kind: PatternKind;
    category: string;
    subcategory: string | null;
    /** UTC-space slot index. Caller is responsible for translating display
     *  slot → UTC slot via the same shift Grid uses. */
    slot: number;
  } | null,
  enabled: boolean,
): UseCellCycles {
  const [samples, setSamples] = useState<ReadonlyArray<CycleSample> | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !args) {
      setSamples(null);
      setError(null);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      kind: args.kind,
      category: args.category,
      slot: String(args.slot),
    });
    if (args.subcategory) params.set("subcategory", args.subcategory);
    fetch(`${apiBase()}/api/cell-cycles?${params.toString()}`, {
      cache: "no-store",
      credentials: "include",
      signal: ac.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`cell-cycles ${r.status}`);
        return r.json() as Promise<{ samples?: CycleSample[] }>;
      })
      .then((body) => {
        if (ac.signal.aborted) return;
        setSamples(body.samples ?? []);
      })
      .catch((err) => {
        if (ac.signal.aborted || isAbortError(err)) return;
        setError((err as Error).message);
        setSamples([]);
      })
      .finally(() => {
        if (ac.signal.aborted) return;
        setLoading(false);
      });
    return () => {
      ac.abort();
    };
  }, [enabled, args?.kind, args?.category, args?.subcategory, args?.slot]);

  return { samples, loading, error };
}

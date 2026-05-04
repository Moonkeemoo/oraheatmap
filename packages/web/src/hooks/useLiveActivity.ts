"use client";

import { useEffect, useRef, useState } from "react";
import type { HeatmapMetric, SignalEvent } from "@/lib/types";

/**
 * Live activity layer for /app — reads SSE signals and surfaces a unified
 * left-side "highlight plaque" for each notable trade in the active metric.
 *
 * Activation is METRIC-AWARE:
 *   - metric=pnl       → plaque shows for signals where magnitudes.pnl is
 *                        "huge" or "big" (significant realised win or loss
 *                        relative to scope). Both wins and losses surface;
 *                        the realisedPnl sign drives the plaque colour.
 *   - metric=volume    → plaque shows for signals where magnitudes.volume
 *                        is "huge"/"big" (large BUY in scope).
 *   - metric=signals   → falls back to volume tag, since one signal IS one
 *                        trade and "many trades" can't be a per-signal cue.
 *   - metric=winrate   → falls back to pnl tag (same rationale: realised
 *                        wins/losses are what feed winrate).
 *
 * Throttling: a single visible plaque at a time, queue length 3,
 * drop-on-overflow. Global rate cap so a peak-hour burst doesn't strobe.
 *
 * Convergence: per-(category) tracker. 5+ unique whales hitting the same
 * cell within 60s with magnitude>=big in the active metric → badge.
 */

const PLAQUE_DURATION_MS = 3000;
const PLAQUE_GLOBAL_RATE_PER_MIN = 8;
const QUEUE_MAX = 3;
const CONVERGE_WINDOW_MS = 60_000;
const CONVERGE_MIN_WHALES = 5;

export type Plaque = {
  id: number;
  category: string;
  alias: string;
  marketQuestion: string | null;
  marketSlug: string | null;
  sizeUsd: number;
  side: "BUY" | "SELL" | "SETTLEMENT";
  /** Whale color from server, hashed-stable per address. */
  whaleColor: string;
  /** "pnl" | "volume" — drives copy + colour scheme. */
  kind: "pnl" | "volume";
  /** Realised PnL for "pnl" plaques (signed). null for "volume" plaques. */
  pnlUsd: number | null;
  showAt: number;
  until: number;
};

type Convergence = { category: string; count: number };

let nextId = 1;

function magnitudeForMetric(m: HeatmapMetric, s: SignalEvent): { kind: "pnl" | "volume"; mag: "huge" | "big" } | null {
  // Pick which magnitude tag fires the plaque for the given active metric.
  const wantPnl = m === "pnl" || m === "winrate";
  const wantVol = m === "volume" || m === "signals";
  if (wantPnl && s.magnitudes.pnl) return { kind: "pnl", mag: s.magnitudes.pnl };
  if (wantVol && s.magnitudes.volume) return { kind: "volume", mag: s.magnitudes.volume };
  return null;
}

export function useLiveActivity({
  enabled,
  metric,
}: {
  enabled: boolean;
  metric: HeatmapMetric;
}) {
  const [currentPlaque, setCurrentPlaque] = useState<Plaque | null>(null);
  const [convergences, setConvergences] = useState<ReadonlyArray<Convergence>>([]);

  const queueRef = useRef<Plaque[]>([]);
  const recentTimestampsRef = useRef<number[]>([]);
  const convergeMapRef = useRef<Map<string, Array<{ addr: string; ts: number }>>>(new Map());

  // GC tick — expires plaque, ages out global rate cap, ages out convergence.
  useEffect(() => {
    if (!enabled) {
      // When toggling off (PATTERN mode etc), clear visible state.
      setCurrentPlaque(null);
      setConvergences([]);
      queueRef.current = [];
      convergeMapRef.current.clear();
      return;
    }
    const id = setInterval(() => {
      const now = Date.now();
      setCurrentPlaque((prev) => {
        if (prev && prev.until > now) return prev;
        return queueRef.current.shift() ?? null;
      });
      recentTimestampsRef.current = recentTimestampsRef.current.filter((t) => now - t < 60_000);

      const newList: Convergence[] = [];
      for (const [cat, list] of convergeMapRef.current) {
        const fresh = list.filter((w) => now - w.ts < CONVERGE_WINDOW_MS);
        if (fresh.length === 0) convergeMapRef.current.delete(cat);
        else if (fresh.length !== list.length) convergeMapRef.current.set(cat, fresh);
        const distinct = new Set(fresh.map((w) => w.addr));
        if (distinct.size >= CONVERGE_MIN_WHALES) newList.push({ category: cat, count: distinct.size });
      }
      // Only setState when the convergence list shape has changed — avoids
      // re-rendering the overlay every tick.
      setConvergences((prev) => {
        if (prev.length !== newList.length) return newList;
        for (let i = 0; i < prev.length; i++) {
          if (prev[i]!.category !== newList[i]!.category || prev[i]!.count !== newList[i]!.count) return newList;
        }
        return prev;
      });
    }, 500);
    return () => clearInterval(id);
  }, [enabled]);

  // Reset convergence on metric switch — the relevant magnitude differs.
  useEffect(() => {
    convergeMapRef.current.clear();
    setConvergences([]);
  }, [metric]);

  function ingest(s: SignalEvent): void {
    if (!enabled) return;
    const tag = magnitudeForMetric(metric, s);
    if (!tag) return;
    const now = Date.now();

    // Convergence — both "big" and "huge" count.
    const list = convergeMapRef.current.get(s.category) ?? [];
    list.push({ addr: s.whaleAddr, ts: now });
    convergeMapRef.current.set(s.category, list);

    // Plaque — only "huge" pops the floating plaque, and even then only
    // under the global rate cap.
    if (tag.mag !== "huge") return;
    if (recentTimestampsRef.current.length >= PLAQUE_GLOBAL_RATE_PER_MIN) return;

    // Side type narrowing — magnitudes.pnl can fire on SELL/SETTLEMENT,
    // magnitudes.volume only on BUY. Both are valid plaque sides.
    const plaque: Plaque = {
      id: nextId++,
      category: s.category,
      alias: s.whaleAlias,
      marketQuestion: s.marketQuestion,
      marketSlug: s.marketSlug,
      sizeUsd: s.sizeUsd,
      side: s.side,
      whaleColor: s.whaleColor,
      kind: tag.kind,
      pnlUsd: tag.kind === "pnl" ? s.realizedPnl : null,
      showAt: now,
      until: now + PLAQUE_DURATION_MS,
    };
    recentTimestampsRef.current.push(now);

    if (!currentPlaque) {
      setCurrentPlaque(plaque);
    } else if (queueRef.current.length < QUEUE_MAX) {
      queueRef.current.push(plaque);
    }
    // else drop (peak-hour stampede protection)
  }

  return { ingest, currentPlaque, convergences };
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { SignalEvent } from "@/lib/types";

/**
 * Live activity layer for the dashboard. Consumes SSE signals and exposes
 * two state slices the overlay reads:
 *
 *   - `currentCallout` — at most one floating "huge" trade pop visible at
 *     a time. New "huge" arrivals queue if one is already showing; queue
 *     length capped at QUEUE_MAX so a peak-hour burst doesn't smear the UI.
 *
 *   - `convergences` — per-(category) convergence badges. We track distinct
 *     whales with `magnitude` ≥ "big" hitting the same cell within the last
 *     CONVERGE_WINDOW_MS. Once N+ unique whales are in the window, surface
 *     a "🐋×N converging" badge until the window slides past.
 *
 * All work is in-memory + tiny — adds zero overhead to the SSE pipeline. We
 * tap into the same callback the existing `applySignal` pipeline uses, no
 * second WebSocket.
 */

const CALLOUT_DURATION_MS = 2400;
const CALLOUT_GLOBAL_RATE_PER_MIN = 6;
const QUEUE_MAX = 3;
const CONVERGE_WINDOW_MS = 90_000;
const CONVERGE_MIN_WHALES = 3;

type Callout = {
  id: number;
  category: string;
  alias: string;
  sizeUsd: number;
  side: "BUY" | "SELL";
  magnitude: "huge" | "big";
  showAt: number;
  until: number;
};

type Convergence = {
  category: string;
  whales: ReadonlyArray<{ addr: string; ts: number }>;
  count: number;
};

let nextId = 1;

export function useLiveActivity({ enabled }: { enabled: boolean }) {
  const [currentCallout, setCurrentCallout] = useState<Callout | null>(null);
  const [convergences, setConvergences] = useState<ReadonlyArray<Convergence>>([]);

  // Mutable refs so we can mutate without re-rendering until we choose to.
  const queueRef = useRef<Callout[]>([]);
  const recentTimestampsRef = useRef<number[]>([]); // for global rate-cap
  const convergeMapRef = useRef<Map<string, Array<{ addr: string; ts: number }>>>(new Map());

  // Pump the queue: when the active callout expires, advance to the next
  // queued one. Run a low-frequency tick that GCs everything past its
  // sliding window.
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      const now = Date.now();
      // 1. expire current callout
      setCurrentCallout((prev) => {
        if (prev && prev.until > now) return prev;
        const next = queueRef.current.shift();
        return next ?? null;
      });
      // 2. age out global rate-cap timestamps (>60s)
      recentTimestampsRef.current = recentTimestampsRef.current.filter((t) => now - t < 60_000);
      // 3. age out per-category convergence whales
      let convergesChanged = false;
      const newList: Convergence[] = [];
      for (const [cat, list] of convergeMapRef.current) {
        const fresh = list.filter((w) => now - w.ts < CONVERGE_WINDOW_MS);
        if (fresh.length !== list.length) {
          convergesChanged = true;
          if (fresh.length === 0) convergeMapRef.current.delete(cat);
          else convergeMapRef.current.set(cat, fresh);
        }
        const distinct = new Set(fresh.map((w) => w.addr));
        if (distinct.size >= CONVERGE_MIN_WHALES) {
          newList.push({ category: cat, whales: fresh, count: distinct.size });
        }
      }
      if (convergesChanged || newList.length !== convergences.length) {
        setConvergences(newList);
      }
    }, 400);
    return () => clearInterval(id);
    // We don't add `convergences` as dep — newList drives state when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  function ingest(s: SignalEvent): void {
    if (!enabled) return;
    if (s.magnitude === null) return;
    if (s.side !== "BUY") return;
    const now = Date.now();

    // 1. convergence tracking — any "big" or "huge" counts
    const existing = convergeMapRef.current.get(s.category) ?? [];
    existing.push({ addr: s.whaleAddr, ts: now });
    convergeMapRef.current.set(s.category, existing);

    // 2. callout — only "huge" gets a floating pop, and even then only if
    //    we're under the global rate cap. The cap is intentionally generous
    //    enough that a quiet hour shows every huge but a peak hour clamps.
    if (s.magnitude !== "huge") return;
    if (recentTimestampsRef.current.length >= CALLOUT_GLOBAL_RATE_PER_MIN) return;

    const c: Callout = {
      id: nextId++,
      category: s.category,
      alias: s.whaleAlias,
      sizeUsd: s.sizeUsd,
      side: s.side,
      magnitude: s.magnitude,
      showAt: now,
      until: now + CALLOUT_DURATION_MS,
    };
    recentTimestampsRef.current.push(now);

    if (!currentCallout) {
      setCurrentCallout(c);
    } else if (queueRef.current.length < QUEUE_MAX) {
      queueRef.current.push(c);
    }
    // else drop — peak-hour stampede protection
  }

  return { ingest, currentCallout, convergences };
}

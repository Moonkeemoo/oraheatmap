"use client";

import { useEffect, useState } from "react";

/**
 * Singleton clock tracking when the SSE stream last delivered a signal.
 * Updated from the existing `useSse` callback inside <Heatmap>; consumed
 * by <LiveStatus> in the header. Module-scoped so we don't spin up a
 * second EventSource just to compute "live · 2s ago" (the per-origin SSE
 * cap was already a bug magnet).
 */

let lastSignalAt = 0;
const listeners = new Set<(ts: number) => void>();

export function recordSignal(): void {
  lastSignalAt = Date.now();
  for (const fn of listeners) fn(lastSignalAt);
}

export type LiveStatus = {
  /** Epoch ms of the most recent signal seen by any tab-side hook. 0 until
   *  the first signal arrives. */
  lastAt: number;
  /** Milliseconds since the last signal, or null while we wait for the
   *  first one. Re-evaluates every second so the UI text ticks. */
  sinceMs: number | null;
  /** "fresh" (<10s) | "warm" (10–30s) | "stale" (30–90s) | "dead" (>90s).
   *  "boot" while we haven't seen any signal yet. */
  state: "boot" | "fresh" | "warm" | "stale" | "dead";
};

function classify(sinceMs: number | null): LiveStatus["state"] {
  if (sinceMs === null) return "boot";
  if (sinceMs < 10_000) return "fresh";
  if (sinceMs < 30_000) return "warm";
  if (sinceMs < 90_000) return "stale";
  return "dead";
}

export function useLiveClock(): LiveStatus {
  const [lastAt, setLastAt] = useState(lastSignalAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    listeners.add(setLastAt);
    // Tick every 1s so "5s ago" updates without us re-calculating on every
    // render of every Header consumer. Cheap.
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      listeners.delete(setLastAt);
      clearInterval(id);
    };
  }, []);

  const sinceMs = lastAt > 0 ? now - lastAt : null;
  return { lastAt, sinceMs, state: classify(sinceMs) };
}

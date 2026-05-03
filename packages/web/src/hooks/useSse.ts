"use client";

import { useEffect, useRef } from "react";
import { streamUrl } from "@/lib/api";
import type { SignalEvent } from "@/lib/types";

/**
 * Subscribe to /api/stream as a long-lived SSE. Browser EventSource handles
 * reconnects with backoff automatically. Caller's `onSignal` fires for every
 * new whale signal pushed by the backend.
 *
 * The callback ref pattern avoids re-subscribing every render — we keep the
 * EventSource alive and just swap the latest handler closure.
 */
export function useSse(onSignal: (s: SignalEvent) => void): void {
  const handlerRef = useRef(onSignal);
  handlerRef.current = onSignal;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const es = new EventSource(streamUrl());
    const onMessage = (ev: MessageEvent<string>): void => {
      try {
        const data = JSON.parse(ev.data) as SignalEvent;
        handlerRef.current(data);
      } catch {
        // ignore malformed
      }
    };
    es.addEventListener("signal", onMessage as EventListener);
    return () => {
      es.removeEventListener("signal", onMessage as EventListener);
      es.close();
    };
  }, []);
}

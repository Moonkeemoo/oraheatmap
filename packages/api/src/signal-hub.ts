import { log } from "./log";
import type { Signal } from "./types";

export type SignalListener = (signal: Signal) => void;

/** Unsubscribe handle returned by `subscribe`. Call to detach a listener. */
export type Unsubscribe = () => void;

export type SignalHub = {
  /** Send a signal to every current subscriber. Subscriber errors are logged, not propagated. */
  broadcast(signal: Signal): void;
  /** Register a listener; returns an unsubscribe handle. */
  subscribe(listener: SignalListener): Unsubscribe;
  /** Current subscriber count (used by /api/health). */
  size(): number;
};

/**
 * In-process pub/sub for whale signals. The ingestor publishes once; the DB
 * buffer and every connected SSE client subscribe independently. Broadcast is
 * synchronous to keep ordering simple — a slow subscriber blocks the hub for
 * the duration of its handler. Keep handlers cheap; offload heavy work via a
 * queue if it ever matters.
 */
export function createSignalHub(): SignalHub {
  const listeners = new Set<SignalListener>();

  return {
    broadcast(signal) {
      for (const fn of listeners) {
        try {
          fn(signal);
        } catch (err) {
          // One bad subscriber must not stop the others or kill the ingestor.
          log.error("signal hub listener threw", { err: (err as Error).message });
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    size: () => listeners.size,
  };
}

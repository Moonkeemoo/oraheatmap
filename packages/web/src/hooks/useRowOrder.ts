"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

import { saveRowOrder } from "@/lib/api";
import { loadMeInit } from "@/lib/me-init";

/**
 * Per-user heatmap row ordering. The hook fetches ALL the user's saved
 * scopes once on auth (small payload — a few short string arrays at most),
 * then exposes per-scope read + write. Writes are debounced so a flurry
 * of drag-end events doesn't hammer the backend.
 */
export type UseRowOrder = {
  /** Saved order for a scope, or undefined when no preference exists yet
   *  (caller falls back to the server's natural order via applyOrder). */
  get(scope: string): string[] | undefined;
  /** Persist an explicit order. Updates local state immediately so the UI
   *  reflects the change before the network round-trip lands. */
  set(scope: string, orderedKeys: string[]): void;
  /** True while we're still fetching the initial order map. */
  loading: boolean;
};

const SAVE_DEBOUNCE_MS = 400;

export function useRowOrder(): UseRowOrder {
  const { status, data } = useSession();
  const isAuthed = status === "authenticated";
  const userId = (data?.user as { id?: string } | undefined)?.id ?? null;
  const [orders, setOrders] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState<boolean>(false);
  // Debounce timers keyed by scope — independent so reordering scope A doesn't
  // delay scope B's save.
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!isAuthed) {
      setOrders({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    void loadMeInit(userId)
      .then((init) => {
        if (cancelled) return;
        setOrders(init.orders ?? {});
      })
      .catch(() => {
        if (cancelled) return;
        setOrders({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthed, userId]);

  // Cancel any pending writes on unmount so we don't fire after teardown.
  useEffect(() => {
    return () => {
      for (const t of timers.current.values()) clearTimeout(t);
      timers.current.clear();
    };
  }, []);

  const get = useCallback(
    (scope: string): string[] | undefined => orders[scope],
    [orders],
  );

  const set = useCallback(
    (scope: string, orderedKeys: string[]) => {
      setOrders((prev) => ({ ...prev, [scope]: orderedKeys }));
      const existing = timers.current.get(scope);
      if (existing) clearTimeout(existing);
      const handle = setTimeout(() => {
        timers.current.delete(scope);
        void saveRowOrder(scope, orderedKeys).catch((err) => {
          // Network/server failure — local state stays optimistic so the
          // current session keeps the new order. But warn to console so
          // silent persistence failures (FK violations, 500s, etc.) are
          // visible in DevTools when the user notices things didn't save.
          // eslint-disable-next-line no-console
          console.warn("[row-order] save failed for scope", scope, err);
        });
      }, SAVE_DEBOUNCE_MS);
      timers.current.set(scope, handle);
    },
    [],
  );

  return { get, set, loading };
}

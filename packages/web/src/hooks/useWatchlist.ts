"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import { apiBase } from "@/lib/api";
import { loadMeInit } from "@/lib/me-init";

/**
 * Per-user pinned-whales set.
 *
 * Stored server-side as a single jsonb / text[] row keyed on user_id;
 * read once on auth-load and replaced on every pin/unpin (POST sends
 * the full new set). The client mirror is held in module-level state
 * so two open tabs of the same session don't fight each other on mount
 * — the second tab gets the updated set on its first window focus
 * because the hook re-fetches on auth status change.
 *
 * Anonymous users: empty list, all writes are no-ops. The UI gates the
 * pin/unpin button on auth status above this hook.
 */
export type UseWatchlistResult = {
  addrs: ReadonlyArray<string>;
  loading: boolean;
  /** True once we've completed the initial load (success OR auth-skip).
   *  Used by callers that need to render an "anon" empty-state vs the
   *  "authed but unloaded" loading state. */
  ready: boolean;
  /** Returns true if the address is in the watchlist. Lowercases the
   *  argument so callers don't have to. */
  has: (addr: string) => boolean;
  /** Add an address. No-op if already pinned or anon. Optimistic
   *  client-side update; reverts on server error. */
  pin: (addr: string) => Promise<void>;
  /** Remove an address. No-op if not pinned or anon. */
  unpin: (addr: string) => Promise<void>;
  /** Toggle. Returns the new pinned state for convenience. */
  toggle: (addr: string) => Promise<boolean>;
};

export function useWatchlist(): UseWatchlistResult {
  const { status, data } = useSession();
  const isAuthed = status === "authenticated";
  const userId = (data?.user as { id?: string } | undefined)?.id ?? null;
  const [addrs, setAddrs] = useState<ReadonlyArray<string>>([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  // Read from the bundled /api/me/init loader. The first hook to call
  // this (useRowOrder or this one) triggers the fetch; subsequent hooks
  // share the in-flight promise — one round trip for the whole sidebar.
  useEffect(() => {
    if (!isAuthed) {
      setAddrs([]);
      setReady(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void loadMeInit(userId).then((init) => {
      if (cancelled) return;
      setAddrs(init.watchlist ?? []);
      setLoading(false);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthed, userId]);

  const persist = useCallback(async (next: ReadonlyArray<string>) => {
    if (!isAuthed) return;
    try {
      await fetch(`${apiBase()}/api/me/watchlist`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ addrs: next }),
      });
    } catch {
      // Caller already optimistically updated state — best-effort
      // server sync. Next page load will re-fetch and reconcile.
    }
  }, [isAuthed]);

  const has = useCallback(
    (addr: string): boolean => addrs.includes(addr.toLowerCase()),
    [addrs],
  );

  const pin = useCallback(
    async (addr: string): Promise<void> => {
      const a = addr.toLowerCase();
      if (!isAuthed || addrs.includes(a)) return;
      const next = [...addrs, a].sort();
      setAddrs(next);
      await persist(next);
    },
    [addrs, isAuthed, persist],
  );

  const unpin = useCallback(
    async (addr: string): Promise<void> => {
      const a = addr.toLowerCase();
      if (!isAuthed || !addrs.includes(a)) return;
      const next = addrs.filter((x) => x !== a);
      setAddrs(next);
      await persist(next);
    },
    [addrs, isAuthed, persist],
  );

  const toggle = useCallback(
    async (addr: string): Promise<boolean> => {
      const a = addr.toLowerCase();
      if (addrs.includes(a)) {
        await unpin(a);
        return false;
      }
      await pin(a);
      return true;
    },
    [addrs, pin, unpin],
  );

  return { addrs, loading, ready, has, pin, unpin, toggle };
}

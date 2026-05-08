"use client";

import { apiBase } from "./api";

/** Shape of the bundled /api/me/init response. */
export type MeInitData = {
  user: { id?: string | null } | null;
  orders: Record<string, string[]>;
  watchlist: string[];
};

/**
 * Single-flight loader for /api/me/init.
 *
 * Both useRowOrder and useWatchlist need user-scoped data on auth-load.
 * Before this module they each fired their own GET, which was two round
 * trips, two cookie verifications, two pool connections — wasted on a
 * payload that's two short arrays. The shared loader memoises the
 * Promise so whichever hook runs first triggers the fetch and the second
 * one awaits the same in-flight request.
 *
 * Memoisation key is auth-state-scoped: passing a new userId (e.g. on
 * sign-in / sign-out) busts the cache. Anonymous calls return a static
 * empty shape and never hit the network.
 */
let cached: { key: string; promise: Promise<MeInitData> } | null = null;

export function loadMeInit(userId: string | null): Promise<MeInitData> {
  if (!userId) {
    cached = null;
    return Promise.resolve({ user: null, orders: {}, watchlist: [] });
  }
  if (cached && cached.key === userId) return cached.promise;
  const promise = (async (): Promise<MeInitData> => {
    try {
      const res = await fetch(`${apiBase()}/api/me/init`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        return { user: null, orders: {}, watchlist: [] };
      }
      return (await res.json()) as MeInitData;
    } catch {
      return { user: null, orders: {}, watchlist: [] };
    }
  })();
  cached = { key: userId, promise };
  return promise;
}

/** Test/dev hook — drops the in-memory promise so the next caller refetches. */
export function resetMeInit(): void {
  cached = null;
}

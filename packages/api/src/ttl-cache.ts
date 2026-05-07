/**
 * Tiny in-process LRU+TTL cache. Used by /api/heatmap and /api/highlights
 * to absorb the tab-switch flood — same params from the same user (or
 * different users) hit the cache instead of re-running multi-million-row
 * GROUP BYs every time.
 *
 * Two access patterns:
 *   - get() / set() — straightforward TTL. Stale entries are evicted on read.
 *   - getOrRefresh() — stale-while-revalidate. Within `staleMs` past the TTL
 *     the previous value is returned immediately while the compute function
 *     re-runs in the background. Concurrent misses on the same key share a
 *     single in-flight refresh. This keeps long-running queries (e.g. the
 *     12w trades-macro heatmap) off the request critical path so a cache
 *     turnover doesn't show up to users as a 502.
 */
type Entry<V> = { value: V; expiresAt: number; staleUntil: number };

export class TtlCache<V> {
  private store = new Map<string, Entry<V>>();
  private inflight = new Map<string, Promise<V>>();
  private readonly maxEntries: number;
  private hitCount = 0;
  private staleCount = 0;
  private missCount = 0;

  constructor(maxEntries = 512) {
    this.maxEntries = maxEntries;
  }

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.missCount++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      // Hard-expire from the get() path. Callers using getOrRefresh()
      // never go through here so the stale window stays intact for them.
      if (Date.now() > entry.staleUntil) this.store.delete(key);
      this.missCount++;
      return undefined;
    }
    this.store.delete(key);
    this.store.set(key, entry);
    this.hitCount++;
    return entry.value;
  }

  set(key: string, value: V, ttlMs: number, staleMs = 0): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    const now = Date.now();
    this.store.set(key, {
      value,
      expiresAt: now + ttlMs,
      staleUntil: now + ttlMs + staleMs,
    });
  }

  /** Stale-while-revalidate read. Fresh hit → returns immediately. Stale
   *  hit → returns the previous value AND kicks off a background refresh
   *  (deduped by key). Hard miss → blocks on compute(), with the in-flight
   *  promise shared so a thundering herd runs the heavy query once. */
  async getOrRefresh(
    key: string,
    ttlMs: number,
    staleMs: number,
    compute: () => Promise<V>,
  ): Promise<{ value: V; status: "hit" | "stale" | "miss" }> {
    const entry = this.store.get(key);
    const now = Date.now();
    if (entry && now <= entry.expiresAt) {
      this.store.delete(key);
      this.store.set(key, entry);
      this.hitCount++;
      return { value: entry.value, status: "hit" };
    }
    if (entry && now <= entry.staleUntil) {
      this.staleCount++;
      // Refresh asynchronously; failures leave the stale entry in place
      // so the next request still gets a value (and another refresh).
      void this.refresh(key, ttlMs, staleMs, compute);
      return { value: entry.value, status: "stale" };
    }
    this.missCount++;
    if (entry) this.store.delete(key);
    const value = await this.runOnce(key, compute);
    this.set(key, value, ttlMs, staleMs);
    return { value, status: "miss" };
  }

  private async refresh(
    key: string,
    ttlMs: number,
    staleMs: number,
    compute: () => Promise<V>,
  ): Promise<void> {
    try {
      const value = await this.runOnce(key, compute);
      this.set(key, value, ttlMs, staleMs);
    } catch {
      // swallow — caller already has the stale value
    }
  }

  private runOnce(key: string, compute: () => Promise<V>): Promise<V> {
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const p = compute().finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, p);
    return p;
  }

  stats(): {
    size: number;
    hits: number;
    stale: number;
    misses: number;
    hitRate: number;
  } {
    const total = this.hitCount + this.staleCount + this.missCount;
    return {
      size: this.store.size,
      hits: this.hitCount,
      stale: this.staleCount,
      misses: this.missCount,
      hitRate: total > 0 ? (this.hitCount + this.staleCount) / total : 0,
    };
  }
}

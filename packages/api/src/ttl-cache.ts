/**
 * Tiny in-process LRU+TTL cache. Used by /api/heatmap and /api/highlights
 * to absorb the tab-switch flood — same params from the same user (or
 * different users) hit the cache instead of re-running multi-million-row
 * GROUP BYs every time.
 *
 * - get() returns the cached value if not expired, else undefined. Hits
 *   are bumped to most-recently-used (Map iteration is insertion-order,
 *   re-inserting moves the entry to the tail).
 * - set() evicts the oldest entry when at capacity.
 * - No background timer — expiry is checked lazily on get().
 */
type Entry<V> = { value: V; expiresAt: number };

export class TtlCache<V> {
  private store = new Map<string, Entry<V>>();
  private readonly maxEntries: number;
  private hitCount = 0;
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
      this.store.delete(key);
      this.missCount++;
      return undefined;
    }
    // LRU bump — re-insert at the tail so the next eviction targets older keys.
    this.store.delete(key);
    this.store.set(key, entry);
    this.hitCount++;
    return entry.value;
  }

  set(key: string, value: V, ttlMs: number): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  stats(): { size: number; hits: number; misses: number; hitRate: number } {
    const total = this.hitCount + this.missCount;
    return {
      size: this.store.size,
      hits: this.hitCount,
      misses: this.missCount,
      hitRate: total > 0 ? this.hitCount / total : 0,
    };
  }
}

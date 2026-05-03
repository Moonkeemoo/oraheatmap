import { sql as drizzleSql } from "drizzle-orm";

import type { Db } from "./db";
import { log } from "./log";
import { whalePositions, type WhalePositionRow } from "./schema";

/**
 * In-memory position state for whale watchlist trading.
 *
 * Source-of-truth at runtime is the in-memory Map. Lookups during ingest are
 * O(1) and never touch the DB. A dirty-Set + interval flusher mirrors changes
 * to the `whale_positions` table every ~2s for restart recovery; on boot
 * `hydrate()` reads the table back into the Map.
 *
 * Shares semantics:
 *   - net_shares is in **outcome shares** (the same unit as Polymarket trade
 *     `size`), not USD. A position of 100 shares at avg_entry 0.4 cost $40.
 *   - On settlement (resolution), shares pay out at $1 each if asset_id is
 *     the winning outcome, $0 each otherwise.
 *
 * Bootstrap:
 *   - SELL where we have no prior BUY → realizedPnl = null (we don't know
 *     entry price). The exit_kind is still 'SELL' so the event is preserved.
 *   - This will dominate the first hours/days of operation; the unknown
 *     fraction shrinks as our ingestion window covers more of each whale's
 *     trade history.
 */

export type Position = {
  whaleAddr: string;
  assetId: string;
  netShares: number;
  avgEntryPrice: number;
  totalCostUsd: number;
  openedAt: Date;
  lastModifiedAt: Date;
};

export type ApplyTradeInput = {
  whaleAddr: string;
  assetId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  ts: Date;
};

export type ApplyTradeResult = {
  realizedPnl: number | null;
  exitKind: "SELL" | null;
};

export type SettleInput = {
  assetId: string;
  payoutPerShare: number; // 1.0 (winner) or 0.0 (loser)
  resolutionTs: Date;
};

/** One settlement row to insert into `signals` for a previously-open position. */
export type SettlementSignal = {
  ts: Date;
  whaleAddr: string;
  assetId: string;
  size: number; // = closed position's netShares
  price: number; // = payoutPerShare
  realizedPnl: number;
};

export type PositionTracker = {
  /**
   * Apply an incoming trade to position state. Returns the PnL/exit_kind
   * fields that should be attached to the Signal row (mutates internal state
   * synchronously; queues a write-behind to PG).
   */
  applyTrade(input: ApplyTradeInput): ApplyTradeResult;

  /**
   * Settle every open position on a given asset (called by the resolution
   * watcher). Returns one SettlementSignal per closed position so the caller
   * can write them to the `signals` table. Mutates internal state.
   */
  settle(input: SettleInput): SettlementSignal[];

  /** Get a single position (mainly for tests + /api/health). */
  get(whaleAddr: string, assetId: string): Position | undefined;

  /** Open-position count (for /api/health and stats). */
  size(): number;

  /** Hydrate state from PG on boot. Idempotent — clears existing in-memory Map first. */
  hydrate(): Promise<void>;

  /** Force-flush the dirty buffer to PG (used on shutdown). */
  flush(): Promise<void>;

  /** Stop the background flush timer (used on shutdown). */
  stop(): Promise<void>;
};

export type PositionTrackerOptions = {
  db: Db;
  flushIntervalMs?: number;
};

const DEFAULT_FLUSH_INTERVAL_MS = 2_000;

function key(whaleAddr: string, assetId: string): string {
  return `${whaleAddr}:${assetId}`;
}

export function createPositionTracker(opts: PositionTrackerOptions): PositionTracker {
  const flushIntervalMs = opts.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  const positions = new Map<string, Position>();
  // Dirty tracking: upserts go via `dirty`, deletes via `tombstones`. A key
  // can only be in one of the two at any time (settle or fully-drained SELL
  // moves it from dirty → tombstones; a follow-up BUY moves it back).
  const dirty = new Set<string>();
  const tombstones = new Set<string>();

  function markDirty(k: string): void {
    tombstones.delete(k);
    dirty.add(k);
  }
  function markTombstone(k: string): void {
    dirty.delete(k);
    tombstones.add(k);
  }

  function applyTrade(input: ApplyTradeInput): ApplyTradeResult {
    const k = key(input.whaleAddr, input.assetId);
    const existing = positions.get(k);

    if (input.side === "BUY") {
      if (existing) {
        existing.netShares += input.size;
        existing.totalCostUsd += input.size * input.price;
        existing.avgEntryPrice = existing.totalCostUsd / existing.netShares;
        existing.lastModifiedAt = input.ts;
      } else {
        positions.set(k, {
          whaleAddr: input.whaleAddr,
          assetId: input.assetId,
          netShares: input.size,
          avgEntryPrice: input.price,
          totalCostUsd: input.size * input.price,
          openedAt: input.ts,
          lastModifiedAt: input.ts,
        });
      }
      markDirty(k);
      return { realizedPnl: null, exitKind: null };
    }

    // SELL
    if (!existing || existing.netShares <= 0) {
      // Bootstrap case — we never saw the entry trade. Record the exit but
      // leave realizedPnl null.
      return { realizedPnl: null, exitKind: "SELL" };
    }

    if (input.size >= existing.netShares) {
      // Position fully drained (and possibly oversold; we cap at the known
      // amount — anything over is bootstrap-style unknown and silently
      // dropped, since we don't have the entry for those extra shares).
      const closedShares = existing.netShares;
      const realizedPnl = (input.price - existing.avgEntryPrice) * closedShares;
      positions.delete(k);
      markTombstone(k);
      return { realizedPnl, exitKind: "SELL" };
    }

    // Partial sell — cost basis stays the same per share; reduce shares + cost
    const realizedPnl = (input.price - existing.avgEntryPrice) * input.size;
    existing.netShares -= input.size;
    existing.totalCostUsd -= existing.avgEntryPrice * input.size;
    existing.lastModifiedAt = input.ts;
    // avg_entry_price is unchanged on a partial sell (FIFO/avg-cost)
    markDirty(k);
    return { realizedPnl, exitKind: "SELL" };
  }

  function settle(input: SettleInput): SettlementSignal[] {
    const out: SettlementSignal[] = [];
    for (const [k, p] of positions) {
      if (p.assetId !== input.assetId) continue;
      const realizedPnl = (input.payoutPerShare - p.avgEntryPrice) * p.netShares;
      out.push({
        ts: input.resolutionTs,
        whaleAddr: p.whaleAddr,
        assetId: p.assetId,
        size: p.netShares,
        price: input.payoutPerShare,
        realizedPnl,
      });
      positions.delete(k);
      markTombstone(k);
    }
    return out;
  }

  async function hydrate(): Promise<void> {
    positions.clear();
    dirty.clear();
    tombstones.clear();
    const rows = await opts.db.select().from(whalePositions);
    for (const r of rows as WhalePositionRow[]) {
      positions.set(key(r.whaleAddr, r.assetId), {
        whaleAddr: r.whaleAddr,
        assetId: r.assetId,
        netShares: r.netShares,
        avgEntryPrice: r.avgEntryPrice,
        totalCostUsd: r.totalCostUsd,
        openedAt: r.openedAt,
        lastModifiedAt: r.lastModifiedAt,
      });
    }
    log.info("positions hydrated", { count: positions.size });
  }

  async function flush(): Promise<void> {
    if (dirty.size === 0 && tombstones.size === 0) return;

    const dirtyKeys = Array.from(dirty);
    const tombstoneKeys = Array.from(tombstones);
    dirty.clear();
    tombstones.clear();

    try {
      // UPSERT dirty positions
      if (dirtyKeys.length > 0) {
        const rows = dirtyKeys
          .map((k) => positions.get(k))
          .filter((p): p is Position => p !== undefined)
          .map((p) => ({
            whaleAddr: p.whaleAddr,
            assetId: p.assetId,
            netShares: p.netShares,
            avgEntryPrice: p.avgEntryPrice,
            totalCostUsd: p.totalCostUsd,
            openedAt: p.openedAt,
            lastModifiedAt: p.lastModifiedAt,
          }));
        if (rows.length > 0) {
          await opts.db
            .insert(whalePositions)
            .values(rows)
            .onConflictDoUpdate({
              target: [whalePositions.whaleAddr, whalePositions.assetId],
              set: {
                netShares: drizzleSql`excluded.net_shares`,
                avgEntryPrice: drizzleSql`excluded.avg_entry_price`,
                totalCostUsd: drizzleSql`excluded.total_cost_usd`,
                lastModifiedAt: drizzleSql`excluded.last_modified_at`,
              },
            });
        }
      }
      // DELETE tombstoned positions
      if (tombstoneKeys.length > 0) {
        // Build a list of (whale, asset) tuples for the WHERE clause
        const conditions = tombstoneKeys.map((k) => {
          const sep = k.indexOf(":");
          return { whaleAddr: k.slice(0, sep), assetId: k.slice(sep + 1) };
        });
        // Drizzle doesn't have a clean tuple-IN; do it with one DELETE per row.
        // Tombstone batches in practice are small (handful per flush window).
        for (const c of conditions) {
          await opts.db
            .delete(whalePositions)
            .where(
              drizzleSql`${whalePositions.whaleAddr} = ${c.whaleAddr} AND ${whalePositions.assetId} = ${c.assetId}`,
            );
        }
      }
      log.debug("positions flushed", { upserts: dirtyKeys.length, deletes: tombstoneKeys.length });
    } catch (err) {
      // Re-queue everything that was supposed to flush so the next cycle retries.
      // Worst case under sustained DB outage: dirty/tombstone Sets keep growing,
      // memory pressure increases. Acceptable for MVP.
      for (const k of dirtyKeys) dirty.add(k);
      for (const k of tombstoneKeys) tombstones.add(k);
      log.error("positions flush failed; re-queued", {
        err: (err as Error).message,
        upserts: dirtyKeys.length,
        deletes: tombstoneKeys.length,
      });
    }
  }

  const timer = setInterval(() => {
    void flush();
  }, flushIntervalMs);
  if (typeof timer.unref === "function") timer.unref();

  return {
    applyTrade,
    settle,
    get: (whaleAddr, assetId) => positions.get(key(whaleAddr, assetId)),
    size: () => positions.size,
    hydrate,
    flush,
    async stop() {
      clearInterval(timer);
      await flush();
    },
  };
}

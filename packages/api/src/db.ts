import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

import { log } from "./log";
import { signals, type SignalInsert } from "./schema";
import type { Signal } from "./types";

export type Db = PostgresJsDatabase;

export function createDb(databaseUrl: string): { db: Db; sql: Sql } {
  const sql = postgres(databaseUrl, {
    max: 5,
    idle_timeout: 30,
    onnotice: () => {},
  });
  return { db: drizzle(sql), sql };
}

function toInsertRow(s: Signal): SignalInsert {
  return {
    ts: s.ts,
    whaleAddr: s.whaleAddr,
    assetId: s.assetId,
    conditionId: s.conditionId,
    marketQuestion: s.marketQuestion,
    category: s.category,
    side: s.side,
    price: s.price,
    size: s.size,
    txHash: s.txHash,
    realizedPnl: s.realizedPnl,
    exitKind: s.exitKind,
  };
}

export type SignalBuffer = {
  push(signal: Signal): void;
  /** flush immediately and resolve when current buffer is persisted */
  flush(): Promise<void>;
  size(): number;
  stop(): Promise<void>;
};

/**
 * Buffers signals and flushes them in a single bulk INSERT every
 * `intervalMs`. Per CLAUDE.md SIG-6, we never insert per-event under firehose
 * load. A flush failure is logged but does NOT throw — buffered rows are
 * dropped so the timer keeps running. Tune retention semantics later.
 */
export function createSignalBuffer(db: Db, intervalMs: number): SignalBuffer {
  let buffer: Signal[] = [];
  let inflight: Promise<void> | null = null;

  async function doFlush(rows: Signal[]): Promise<void> {
    if (rows.length === 0) return;
    try {
      const insertRows = rows.map(toInsertRow);
      await db.insert(signals).values(insertRows);
      log.debug("signals flushed", { count: rows.length });
    } catch (err) {
      log.error("signals flush failed; dropping batch", {
        count: rows.length,
        err: (err as Error).message,
      });
    }
  }

  async function flush(): Promise<void> {
    if (buffer.length === 0) return;
    const drained = buffer;
    buffer = [];
    inflight = doFlush(drained).finally(() => {
      inflight = null;
    });
    await inflight;
  }

  const timer = setInterval(() => {
    void flush();
  }, intervalMs);
  // Don't keep the event loop alive just for the flush timer.
  if (typeof timer.unref === "function") timer.unref();

  return {
    push(signal: Signal) {
      buffer.push(signal);
    },
    flush,
    size: () => buffer.length,
    async stop() {
      clearInterval(timer);
      if (inflight) await inflight;
      await flush();
    },
  };
}

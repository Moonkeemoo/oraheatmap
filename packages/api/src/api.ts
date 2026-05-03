import { cors } from "@elysiajs/cors";
import { Elysia, t } from "elysia";
import type { Sql } from "postgres";

import {
  assembleHeatmap,
  buildBuckets,
  fetchTopWhale,
  fetchUniqueWhalesInWindow,
  type HeatmapRange,
  queryHeatmapAggRows,
  queryTopTradesPerCell,
  RANGE_CONFIG,
} from "./heatmap-query";
import type { Ingestor } from "./ingestor";
import { log } from "./log";
import type { SignalHub } from "./signal-hub";
import type { Signal } from "./types";
import { whaleAlias, whaleColor } from "./whale-display";

export type ApiDeps = {
  sql: Sql;
  hub: SignalHub;
  ingestor: Ingestor;
  bufferSize: () => number;
  gammaCacheSize: () => number;
  whaleCount: () => number;
};

const SSE_HEARTBEAT_MS = 25_000;
const TOP_TRADES_PER_CELL = 3;

function signalToWire(s: Signal): Record<string, unknown> {
  return {
    ts: s.ts.toISOString(),
    whaleAddr: s.whaleAddr,
    whaleAlias: whaleAlias(s.whaleAddr),
    whaleColor: whaleColor(s.whaleAddr),
    assetId: s.assetId,
    conditionId: s.conditionId,
    marketQuestion: s.marketQuestion,
    category: s.category,
    side: s.side,
    price: s.price,
    size: s.size,
    sizeUsd: s.size * s.price,
    realizedPnl: s.realizedPnl,
    exitKind: s.exitKind,
    txHash: s.txHash,
  };
}

// Return type intentionally inferred — Elysia's generic chain mutates with each
// `.use` / `.get`, and the explicit `Elysia` super-type is incompatible with
// the post-cors instance.
export function createApi(deps: ApiDeps) {
  return new Elysia()
    .use(
      cors({
        origin: true,
        methods: ["GET", "OPTIONS"],
        // SSE clients sometimes need credentials, but we keep this loose for MVP
        credentials: false,
      }),
    )
    .get("/api/health", async () => {
      let dbOk = false;
      try {
        await deps.sql`SELECT 1`;
        dbOk = true;
      } catch (err) {
        log.warn("health: db ping failed", { err: (err as Error).message });
      }
      return {
        ok: dbOk,
        ingestor: {
          status: deps.ingestor.status(),
          stats: deps.ingestor.stats(),
        },
        sseSubscribers: deps.hub.size(),
        bufferSize: deps.bufferSize(),
        gammaCacheSize: deps.gammaCacheSize(),
        ts: new Date().toISOString(),
      };
    })
    .get(
      "/api/heatmap",
      async ({ query }) => {
        const range: HeatmapRange = query.range ?? "1h";
        const cfg = RANGE_CONFIG[range];
        const now = new Date();
        const buckets = buildBuckets(now, cfg.bucketMinutes, cfg.slots);
        const [aggRows, tradeRows, topWhaleAddr, uniqueWhales] = await Promise.all([
          queryHeatmapAggRows(deps.sql, range),
          queryTopTradesPerCell(deps.sql, range, TOP_TRADES_PER_CELL),
          fetchTopWhale(deps.sql, range),
          fetchUniqueWhalesInWindow(deps.sql, range),
        ]);
        const grid = assembleHeatmap(aggRows, tradeRows, buckets, range, now);
        const topWhale = topWhaleAddr
          ? { addr: topWhaleAddr, alias: whaleAlias(topWhaleAddr), color: whaleColor(topWhaleAddr) }
          : null;
        return {
          ...grid,
          trackedWhales: deps.whaleCount(),
          totals: {
            ...grid.totals,
            uniqueWhales,
            // For MVP, "active" = "seen any trade in window" — same as uniqueWhales.
            // Reserve a separate field so the UI can show both later if we
            // tighten the active-definition (e.g. ≥ N trades).
            activeWhales: uniqueWhales,
            topWhale,
          },
          metric: query.metric ?? "signals",
        };
      },
      {
        query: t.Object({
          range: t.Optional(
            t.Union([t.Literal("1h"), t.Literal("24h"), t.Literal("12d"), t.Literal("12w")]),
          ),
          metric: t.Optional(
            t.Union([
              t.Literal("signals"),
              t.Literal("volume"),
              t.Literal("pnl"),
              t.Literal("winrate"),
            ]),
          ),
        }),
      },
    )
    .get("/api/stream", ({ set }) => {
      // Server-Sent Events: a long-lived response of `event: ... \n data: ...\n\n`
      // chunks. Browsers reconnect automatically on disconnect.
      set.headers["content-type"] = "text/event-stream";
      set.headers["cache-control"] = "no-cache, no-transform";
      set.headers["connection"] = "keep-alive";
      // Tell common reverse proxies (nginx) to not buffer the stream
      set.headers["x-accel-buffering"] = "no";

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          let closed = false;
          const safeEnqueue = (chunk: string): void => {
            if (closed) return;
            try {
              controller.enqueue(encoder.encode(chunk));
            } catch {
              closed = true;
            }
          };

          // Initial hello so the client confirms the stream
          safeEnqueue(`event: hello\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`);

          const unsubscribe = deps.hub.subscribe((signal) => {
            safeEnqueue(`event: signal\ndata: ${JSON.stringify(signalToWire(signal))}\n\n`);
          });

          // Periodic comment-line heartbeat keeps proxies + browsers happy
          const heartbeat = setInterval(() => {
            safeEnqueue(`: ping ${Date.now()}\n\n`);
          }, SSE_HEARTBEAT_MS);
          heartbeat.unref?.();

          const teardown = (): void => {
            if (closed) return;
            closed = true;
            clearInterval(heartbeat);
            unsubscribe();
            try {
              controller.close();
            } catch {
              // already closed
            }
          };

          // Hook into stream cancellation (browser disconnects)
          (controller as unknown as { _teardown?: () => void })._teardown = teardown;
        },
        cancel() {
          const t = (this as unknown as { _teardown?: () => void })._teardown;
          if (t) t();
        },
      });

      // Elysia's `set.headers` is a record-style HTTPHeaders, not the array-style
      // HeadersInit the Response constructor expects — copy through Object.entries.
      const headers = new Headers();
      for (const [k, v] of Object.entries(set.headers)) {
        if (typeof v === "string") headers.set(k, v);
      }
      return new Response(stream, { headers });
    });
}

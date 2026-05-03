import WebSocket from "ws";

import type { GammaCache } from "./gamma-cache";
import { log } from "./log";
import type { IngestorStatus, RtdsTradeEvent, Signal } from "./types";

export type IngestorDeps = {
  url: string;
  whales: ReadonlySet<string>;
  gamma: GammaCache;
  onSignal: (s: Signal) => void;
  pingIntervalMs: number;
  pingJitterMaxMs: number;
  heartbeatThresholdMs: number;
  dataSilenceThresholdMs: number;
};

export type Ingestor = {
  start(): void;
  stop(): Promise<void>;
  status(): IngestorStatus;
  /** stats for /api/health later */
  stats(): { framesSeen: number; tradesSeen: number; whaleHits: number; signalsEmitted: number };
};

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

function jitteredDelay(base: number, max: number, attempt: number): number {
  const exp = Math.min(base * 2 ** attempt, max);
  return exp + Math.floor(Math.random() * 1_000);
}

function pickAssetId(ev: RtdsTradeEvent): string {
  // SIG-2: some events carry the token in `market`, not `asset_id`.
  return ev.asset_id ?? ev.market ?? "";
}

function toNumber(v: number | string | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

function toSide(v: string | undefined): "BUY" | "SELL" | null {
  if (v === "BUY" || v === "SELL") return v;
  return null;
}

function toTimestamp(v: number | string | undefined): Date {
  if (typeof v === "number") return new Date(v * 1000);
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return new Date(n * 1000);
  }
  return new Date();
}

export function createIngestor(deps: IngestorDeps): Ingestor {
  let ws: WebSocket | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatWatchdog: ReturnType<typeof setInterval> | null = null;
  let attempt = 0;
  let stopped = false;
  let lastFrameAt = 0;
  let lastDataAt = 0;
  let currentStatus: IngestorStatus = { kind: "connecting" };
  const stats = { framesSeen: 0, tradesSeen: 0, whaleHits: 0, signalsEmitted: 0 };

  function clearTimers(): void {
    if (pingTimer) clearInterval(pingTimer);
    if (heartbeatWatchdog) clearInterval(heartbeatWatchdog);
    pingTimer = null;
    heartbeatWatchdog = null;
  }

  function scheduleReconnect(reason: string): void {
    clearTimers();
    if (stopped) return;
    const delay = jitteredDelay(RECONNECT_BASE_MS, RECONNECT_MAX_MS, attempt);
    attempt += 1;
    currentStatus = { kind: "reconnecting", attempt, nextDelayMs: delay };
    log.warn("ws reconnect scheduled", { reason, attempt, delayMs: delay });
    setTimeout(() => {
      if (!stopped) connect();
    }, delay).unref?.();
  }

  function startPingLoop(): void {
    pingTimer = setInterval(() => {
      if (ws?.readyState !== WebSocket.OPEN) return;
      // RTDS expects an empty string ping; library .ping() may send a control frame
      // that the server ignores — emulate the documented behaviour explicitly.
      try {
        ws.send("");
      } catch (err) {
        log.warn("ws ping send failed", { err: (err as Error).message });
      }
    }, deps.pingIntervalMs + Math.floor(Math.random() * deps.pingJitterMaxMs));
    pingTimer.unref?.();
  }

  function startHeartbeatWatchdogs(): void {
    // SIG-1: dual heartbeats. HEARTBEAT covers any frame; DATA only counts real
    // trade events. A stuck WS that only emits keepalives looks alive on the
    // first watchdog and dead on the second — that's the zombie we need to kill.
    const tick = Math.min(deps.heartbeatThresholdMs, deps.dataSilenceThresholdMs) / 3;
    heartbeatWatchdog = setInterval(() => {
      const now = Date.now();
      if (now - lastFrameAt > deps.heartbeatThresholdMs) {
        log.warn("heartbeat silent", { sinceMs: now - lastFrameAt });
        ws?.close(4000, "heartbeat-silent");
        return;
      }
      if (now - lastDataAt > deps.dataSilenceThresholdMs) {
        log.warn("data silent (zombie)", { sinceMs: now - lastDataAt });
        ws?.close(4001, "data-silent");
      }
    }, tick);
    heartbeatWatchdog.unref?.();
  }

  function handleMessage(raw: WebSocket.RawData): void {
    lastFrameAt = Date.now();
    stats.framesSeen += 1;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      // RTDS sends keepalive non-JSON noise; ignore silently.
      return;
    }

    // RTDS may push arrays of events or single events.
    const events: RtdsTradeEvent[] = Array.isArray(parsed)
      ? (parsed as RtdsTradeEvent[])
      : [parsed as RtdsTradeEvent];

    for (const ev of events) {
      void handleEvent(ev);
    }
  }

  async function handleEvent(ev: RtdsTradeEvent): Promise<void> {
    try {
      const user = ev.user?.toLowerCase();
      if (!user) return;

      // Real trade event (has a user) — keep DATA watchdog alive even before whale match.
      lastDataAt = Date.now();
      stats.tradesSeen += 1;

      if (!deps.whales.has(user)) return;
      stats.whaleHits += 1;

      const assetId = pickAssetId(ev);
      if (!assetId) {
        log.warn("whale trade missing asset_id and market", { user });
        return;
      }

      const price = toNumber(ev.price);
      const size = toNumber(ev.size);
      const side = toSide(ev.side);
      if (!Number.isFinite(price) || !Number.isFinite(size) || side === null) {
        log.warn("whale trade malformed", { user, side: ev.side, price: ev.price, size: ev.size });
        return;
      }

      const market = await deps.gamma.enrich(assetId);
      const signal: Signal = {
        ts: toTimestamp(ev.timestamp),
        whaleAddr: user,
        assetId,
        conditionId: ev.condition_id ?? null,
        marketQuestion: market?.question ?? ev.title ?? null,
        category: market?.category ?? "Other",
        side,
        price,
        size,
        txHash: ev.transaction_hash ?? null,
      };

      stats.signalsEmitted += 1;
      log.info("whale signal", {
        whale: signal.whaleAddr,
        category: signal.category,
        side: signal.side,
        size: signal.size,
        price: signal.price,
        market: signal.marketQuestion?.slice(0, 80),
      });
      deps.onSignal(signal);
    } catch (err) {
      // Per CLAUDE.md code-quality gate: every WS event handler must have try/catch
      // so a single bad parse can't crash the ingestor.
      log.error("event handler crashed", { err: (err as Error).message });
    }
  }

  function connect(): void {
    if (stopped) return;
    currentStatus = { kind: "connecting" };
    log.info("ws connecting", { url: deps.url, attempt });

    const socket = new WebSocket(deps.url);
    ws = socket;

    socket.on("open", () => {
      attempt = 0;
      lastFrameAt = Date.now();
      lastDataAt = Date.now();
      currentStatus = { kind: "open", openedAt: lastFrameAt };
      log.info("ws open");
      try {
        socket.send(JSON.stringify({ type: "trades" }));
      } catch (err) {
        log.error("ws subscribe send failed", { err: (err as Error).message });
      }
      startPingLoop();
      startHeartbeatWatchdogs();
    });

    socket.on("message", handleMessage);

    socket.on("error", (err) => {
      log.warn("ws error", { err: err.message });
    });

    socket.on("close", (code, reason) => {
      clearTimers();
      ws = null;
      const reasonStr = reason.toString() || "no-reason";
      log.warn("ws closed", { code, reason: reasonStr });
      if (stopped) {
        currentStatus = { kind: "closed", reason: reasonStr };
        return;
      }
      scheduleReconnect(reasonStr);
    });
  }

  return {
    start() {
      stopped = false;
      connect();
    },
    async stop() {
      stopped = true;
      clearTimers();
      if (ws) {
        ws.close(1000, "shutdown");
        ws = null;
      }
      currentStatus = { kind: "closed", reason: "shutdown" };
    },
    status: () => currentStatus,
    stats: () => ({ ...stats }),
  };
}

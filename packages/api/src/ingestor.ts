import { ConnectionStatus, type Message, RealTimeDataClient } from "@polymarket/real-time-data-client";

import type { Category } from "./categorize";
import type { GammaCache } from "./gamma-cache";
import { log } from "./log";
import type { PositionTracker } from "./position-tracker";
import { pickSubcategory } from "./subcategorize";
import type { IngestorStatus, RtdsTradePayload, Signal } from "./types";

export type IngestorDeps = {
  url: string;
  whales: ReadonlySet<string>;
  gamma: GammaCache;
  positions: PositionTracker;
  onSignal: (s: Signal) => void;
  pingIntervalMs: number;
  /** Warn (not reconnect) if no `activity/trades` message arrives in this window. */
  dataSilenceThresholdMs: number;
  /** Force-recreate the SDK client if silence persists beyond this threshold.
   *  CLAUDE.md SIG-7: "on application-level resubscribe failure, restart the
   *  SDK client rather than reusing it" — autoReconnect:true sometimes
   *  zombies (TCP up, no frames, no error). 0 disables. */
  fatalSilenceThresholdMs: number;
};

export type IngestorStats = {
  framesSeen: number;
  tradesSeen: number;
  whaleHits: number;
  signalsEmitted: number;
  forceReconnects: number;
};

export type Ingestor = {
  start(): void;
  stop(): Promise<void>;
  status(): IngestorStatus;
  stats(): IngestorStats;
};

/** Canonical lowercase 0x-prefixed 40-hex eth address. Some upstream RTDS
 *  payloads stuff composite IDs (e.g. "0xADDR-TIMESTAMP" or "0xADDR-MARKETID")
 *  into the user/proxyWallet field — those would otherwise pollute signals
 *  and skew per-cell unique-whale counts. */
const ETH_ADDR_RE = /^0x[0-9a-f]{40}$/;

function pickWallet(p: RtdsTradePayload): string | null {
  const w = p.proxyWallet ?? p.proxy_wallet ?? p.user ?? p.maker ?? p.taker ?? p.address;
  if (typeof w !== "string" || w.length === 0) return null;
  const lower = w.toLowerCase();
  if (!ETH_ADDR_RE.test(lower)) return null;
  return lower;
}

function pickAssetId(p: RtdsTradePayload): string | null {
  // SIG-2: producers disagree on field name. Probe each known alias.
  const a = p.asset ?? p.asset_id ?? p.token_id ?? p.market;
  return typeof a === "string" && a.length > 0 ? a : null;
}

function pickConditionId(p: RtdsTradePayload): string | null {
  const c = p.conditionId ?? p.condition_id;
  return typeof c === "string" && c.length > 0 ? c : null;
}

function pickTitle(p: RtdsTradePayload): string | null {
  const t = p.title ?? p.slug ?? p.marketSlug;
  return typeof t === "string" && t.length > 0 ? t : null;
}

function pickTxHash(p: RtdsTradePayload): string | null {
  const h = p.transactionHash ?? p.transaction_hash ?? p.txHash;
  return typeof h === "string" && h.length > 0 ? h.toLowerCase() : null;
}

function toNumber(v: number | string | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

function pickSize(p: RtdsTradePayload): number {
  return toNumber(p.size ?? p.amount ?? p.shares);
}

function pickPrice(p: RtdsTradePayload): number {
  return toNumber(p.price ?? p.executionPrice);
}

function normalizeSide(raw: string | undefined): "BUY" | "SELL" | null {
  const s = (raw ?? "").toUpperCase();
  if (s === "BUY" || s === "MAKER" || s === "LONG") return "BUY";
  if (s === "SELL" || s === "TAKER" || s === "SHORT") return "SELL";
  return null;
}

function pickTimestamp(p: RtdsTradePayload): Date {
  const raw = Number(p.timestamp ?? p.ts ?? 0);
  const now = Date.now();
  if (!Number.isFinite(raw) || raw <= 0) return new Date(now);
  // Heuristic: > 1e12 → already ms, otherwise seconds.
  const ms = raw > 1_000_000_000_000 ? raw : raw * 1000;
  // Clamp future-dated timestamps to NOW. Polymarket occasionally emits trades
  // whose payload `timestamp` is minutes-to-days ahead of wall-clock — left
  // unfixed it poisons time-bucket aggregations (signals fall into a future
  // bucket nobody queries, or get rendered as the "most recent" cycle in
  // PATTERN even though they're 12h ahead of real time). Allow a 60s grace
  // for clock skew before clamping.
  if (ms > now + 60_000) return new Date(now);
  return new Date(ms);
}

export function createIngestor(deps: IngestorDeps): Ingestor {
  let client: RealTimeDataClient | null = null;
  let stopped = false;
  let lastDataAt = 0;
  let dataSilenceTimer: ReturnType<typeof setInterval> | null = null;
  /** Set when we've already forced a reconnect for the current silence
   *  episode — prevents spamming reconnects every tick if the new client
   *  also stays silent. Cleared as soon as a real frame arrives. */
  let forcedReconnectThisSilence = false;
  let currentStatus: IngestorStatus = { kind: "connecting" };
  const stats: IngestorStats = {
    framesSeen: 0,
    tradesSeen: 0,
    whaleHits: 0,
    signalsEmitted: 0,
    forceReconnects: 0,
  };

  function startDataSilenceWatch(): void {
    if (dataSilenceTimer) clearInterval(dataSilenceTimer);
    const tick = Math.max(deps.dataSilenceThresholdMs / 3, 5_000);
    dataSilenceTimer = setInterval(() => {
      if (stopped || lastDataAt === 0) return; // never had a trade yet — don't false-alarm at boot
      const sinceMs = Date.now() - lastDataAt;
      if (sinceMs <= deps.dataSilenceThresholdMs) return;

      log.warn("rtds data silence", { sinceMs });

      // Beyond fatal threshold — SDK is zombied. Tear down and recreate.
      const fatal = deps.fatalSilenceThresholdMs;
      if (fatal > 0 && sinceMs > fatal && !forcedReconnectThisSilence) {
        forcedReconnectThisSilence = true;
        stats.forceReconnects += 1;
        log.warn("rtds force reconnect (fatal silence)", { sinceMs, attempt: stats.forceReconnects });
        try {
          client?.disconnect();
        } catch (err) {
          log.warn("disconnect during force-reconnect threw", { err: (err as Error).message });
        }
        client = null;
        // Reset lastDataAt to a "fresh boot" sentinel so the watchdog won't
        // trigger again until the new client has had a chance to receive
        // at least one frame.
        lastDataAt = 0;
        connectClient();
      }
    }, tick);
  }

  function connectClient(): void {
    log.info("rtds connecting", { url: deps.url });
    client = new RealTimeDataClient({
      host: deps.url,
      autoReconnect: true,
      pingInterval: deps.pingIntervalMs,
      onConnect: (c) => {
        log.info("rtds connected, subscribing");
        currentStatus = { kind: "open", openedAt: Date.now() };
        c.subscribe({
          subscriptions: [{ topic: "activity", type: "trades" }],
        });
      },
      onMessage: (_c, msg) => handleMessage(msg),
      onStatusChange: (status) => {
        if (status === ConnectionStatus.CONNECTING) {
          currentStatus = { kind: "connecting" };
        } else if (status === ConnectionStatus.DISCONNECTED) {
          currentStatus = { kind: "disconnected", lastSeenAt: lastDataAt };
        }
        log.info("rtds status", { status });
      },
    });
    client.connect();
  }

  function handleMessage(msg: Message): void {
    stats.framesSeen += 1;
    try {
      if (msg.topic !== "activity" || msg.type !== "trades") return;

      const payload = msg.payload as RtdsTradePayload;
      stats.tradesSeen += 1;
      lastDataAt = Date.now();
      // Real frames arriving — clear the "silence episode" guard so a
      // future zombie can be force-reconnected again.
      forcedReconnectThisSilence = false;

      const wallet = pickWallet(payload);
      if (!wallet) return;

      if (!deps.whales.has(wallet)) return;
      stats.whaleHits += 1;

      const assetId = pickAssetId(payload);
      if (!assetId) {
        log.warn("whale trade missing asset_id and aliases", { wallet });
        return;
      }
      const side = normalizeSide(payload.side ?? payload.action);
      const price = pickPrice(payload);
      const size = pickSize(payload);
      if (side === null || !Number.isFinite(price) || !Number.isFinite(size) || size <= 0) {
        log.warn("whale trade malformed", { wallet, side: payload.side, price, size });
        return;
      }

      void emitSignal(wallet, assetId, side, price, size, payload);
    } catch (err) {
      // CLAUDE.md gate: a single bad parse must not crash the ingestor.
      log.error("event handler crashed", { err: (err as Error).message });
    }
  }

  async function emitSignal(
    wallet: string,
    assetId: string,
    side: "BUY" | "SELL",
    price: number,
    size: number,
    payload: RtdsTradePayload,
  ): Promise<void> {
    const market = await deps.gamma.enrich(assetId);
    const ts = pickTimestamp(payload);

    // Position-state mutation BEFORE emit so the row carries realized PnL.
    // This is synchronous + O(1) — never blocks the firehose.
    const { realizedPnl, exitKind } = deps.positions.applyTrade({
      whaleAddr: wallet,
      assetId,
      side,
      price,
      size,
      ts,
    });

    const category = (market?.category ?? "Other") as Category;
    const marketQuestion = market?.question ?? pickTitle(payload);
    const subcategory = pickSubcategory(category, market?.tags ?? null, marketQuestion);

    const signal: Signal = {
      ts,
      whaleAddr: wallet,
      assetId,
      conditionId: pickConditionId(payload),
      marketQuestion,
      category,
      side,
      price,
      size,
      txHash: pickTxHash(payload),
      realizedPnl,
      exitKind,
      subcategory,
      marketSlug: market?.slug ?? null,
      marketIcon: market?.icon ?? null,
    };
    stats.signalsEmitted += 1;
    log.info("whale signal", {
      whale: signal.whaleAddr,
      category: signal.category,
      side: signal.side,
      size: signal.size,
      price: signal.price,
      pnl: signal.realizedPnl,
      market: signal.marketQuestion?.slice(0, 80),
    });
    deps.onSignal(signal);
  }

  return {
    start() {
      stopped = false;
      connectClient();
      startDataSilenceWatch();
    },
    async stop() {
      stopped = true;
      if (dataSilenceTimer) {
        clearInterval(dataSilenceTimer);
        dataSilenceTimer = null;
      }
      try {
        client?.disconnect();
      } catch {
        // ignore — process is shutting down
      }
      client = null;
    },
    status: () => currentStatus,
    stats: () => ({ ...stats }),
  };
}

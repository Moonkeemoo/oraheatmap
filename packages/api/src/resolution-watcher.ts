import { categorize, type Category, type GammaTag } from "./categorize";
import type { Db } from "./db";
import type { FetchLike } from "./gamma-cache";
import { log } from "./log";
import type { PositionTracker } from "./position-tracker";
import { processedResolutions } from "./schema";
import type { SignalHub } from "./signal-hub";
import { pickSubcategory } from "./subcategorize";
import type { Signal } from "./types";

/**
 * Subset of the Gamma `/markets?closed=true&include_tag=true` response we use.
 * Same loose typing approach as `gamma-cache.ts` — every field is optional,
 * we validate per-field at parse time.
 */
type ClosedMarket = {
  id?: string;
  conditionId?: string;
  question?: string;
  endDate?: string;
  updatedAt?: string;
  /** JSON-encoded string array per SIG-3, e.g. '["Yes","No"]' */
  outcomes?: string;
  /** JSON-encoded string array of resolved prices, e.g. '["1","0"]' */
  outcomePrices?: string;
  /** JSON-encoded string array of CLOB token IDs (one per outcome) */
  clobTokenIds?: string;
  tags?: GammaTag[];
  closed?: boolean;
};

export type ResolutionWatcher = {
  /** Run one poll cycle now (used by tests + start() loop). */
  pollOnce(): Promise<{ fetched: number; processed: number; settlementCount: number }>;
  start(): void;
  stop(): Promise<void>;
};

export type ResolutionWatcherOptions = {
  db: Db;
  baseUrl: string;
  pollIntervalMs: number;
  positions: PositionTracker;
  hub: SignalHub;
  /** Limits how many closed markets we ask for per cycle. */
  pageLimit?: number;
  fetchImpl?: FetchLike;
};

const DEFAULT_PAGE_LIMIT = 200;

function parseStringArray(field: unknown): string[] {
  if (typeof field !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(field);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parseNumberArray(field: unknown): number[] {
  if (typeof field !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(field);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((v) => (typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN))
      .map((n) => (Number.isFinite(n) ? n : NaN));
  } catch {
    return [];
  }
}

function pickResolutionTs(m: ClosedMarket): Date {
  const raw = m.endDate ?? m.updatedAt;
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function pickWinningAsset(tokenIds: string[], prices: number[]): string | null {
  // The winning outcome's token resolves to $1.0. Treat anything ≥ 0.99 as winner
  // to tolerate rounding (e.g. "0.999...").
  for (let i = 0; i < tokenIds.length; i++) {
    const p = prices[i];
    const t = tokenIds[i];
    if (p !== undefined && t && p >= 0.99) return t;
  }
  return null;
}

/** Pure builder — exported for tests. Builds the synthetic SETTLEMENT signals
 *  for a given resolved market and the settlement records returned by the tracker. */
export function buildSettlementSignals(args: {
  conditionId: string;
  marketQuestion: string | null;
  category: string;
  tags: ReadonlyArray<GammaTag>;
  settlements: ReadonlyArray<{
    ts: Date;
    whaleAddr: string;
    assetId: string;
    size: number;
    price: number;
    realizedPnl: number;
  }>;
}): Signal[] {
  const subcategory = pickSubcategory(args.category as Category, args.tags, args.marketQuestion);
  return args.settlements.map((s) => ({
    ts: s.ts,
    whaleAddr: s.whaleAddr,
    assetId: s.assetId,
    conditionId: args.conditionId,
    marketQuestion: args.marketQuestion,
    category: args.category,
    side: "SETTLEMENT",
    price: s.price,
    size: s.size,
    txHash: null,
    realizedPnl: s.realizedPnl,
    exitKind: "RESOLUTION",
    subcategory,
  }));
}

export function createResolutionWatcher(opts: ResolutionWatcherOptions): ResolutionWatcher {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const pageLimit = opts.pageLimit ?? DEFAULT_PAGE_LIMIT;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  async function fetchClosedMarkets(): Promise<ClosedMarket[]> {
    const url =
      `${opts.baseUrl}/markets?closed=true&include_tag=true&limit=${pageLimit}` +
      `&order=updatedAt&ascending=false`;
    let res: Response;
    try {
      res = await fetchImpl(url);
    } catch (err) {
      log.warn("resolution poll fetch threw", { err: (err as Error).message });
      return [];
    }
    if (!res.ok) {
      log.warn("resolution poll non-ok", { status: res.status });
      return [];
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      log.warn("resolution poll bad json", { err: (err as Error).message });
      return [];
    }
    if (!Array.isArray(body)) return [];
    return body as ClosedMarket[];
  }

  async function processMarket(
    m: ClosedMarket,
  ): Promise<{ markedNew: boolean; settlementCount: number }> {
    const conditionId = m.conditionId;
    if (!conditionId) return { markedNew: false, settlementCount: 0 };

    const tokenIds = parseStringArray(m.clobTokenIds);
    const prices = parseNumberArray(m.outcomePrices);
    if (tokenIds.length === 0 || tokenIds.length !== prices.length) {
      // Malformed payload — still mark processed so we don't keep retrying.
      log.warn("resolution token/price malformed", {
        conditionId,
        tokens: tokenIds.length,
        prices: prices.length,
      });
    }

    const resolutionTs = pickResolutionTs(m);
    const winningAsset = pickWinningAsset(tokenIds, prices);

    // Atomic dedupe: PK conflict on processedResolutions = already handled.
    // .returning() is empty on conflict — that's our "skip" signal.
    const inserted = await opts.db
      .insert(processedResolutions)
      .values({
        conditionId,
        resolvedAt: resolutionTs,
        winningAsset,
      })
      .onConflictDoNothing()
      .returning({ conditionId: processedResolutions.conditionId });

    if (inserted.length === 0) {
      // already processed in a previous cycle
      return { markedNew: false, settlementCount: 0 };
    }

    if (tokenIds.length === 0) return { markedNew: true, settlementCount: 0 };

    const category = categorize(m.tags);
    const marketQuestion = typeof m.question === "string" ? m.question : null;

    let settlementCount = 0;
    let totalPnl = 0;

    for (let i = 0; i < tokenIds.length; i++) {
      const assetId = tokenIds[i];
      const payoutPerShare = prices[i];
      if (!assetId || payoutPerShare === undefined || !Number.isFinite(payoutPerShare)) continue;

      const settlements = opts.positions.settle({
        assetId,
        payoutPerShare,
        resolutionTs,
      });

      const sigs = buildSettlementSignals({
        conditionId,
        marketQuestion,
        category,
        tags: m.tags ?? [],
        settlements,
      });

      for (const sig of sigs) {
        opts.hub.broadcast(sig);
        settlementCount += 1;
        if (sig.realizedPnl !== null) totalPnl += sig.realizedPnl;
      }
    }

    if (settlementCount > 0) {
      log.info("resolution settled", {
        conditionId,
        market: marketQuestion?.slice(0, 60),
        winningAsset,
        settlements: settlementCount,
        totalPnlUsd: Math.round(totalPnl * 100) / 100,
      });
    }

    return { markedNew: true, settlementCount };
  }

  async function pollOnce(): Promise<{
    fetched: number;
    processed: number;
    settlementCount: number;
  }> {
    const markets = await fetchClosedMarkets();
    let processed = 0;
    let settlementCount = 0;
    for (const m of markets) {
      try {
        const r = await processMarket(m);
        if (r.markedNew) processed += 1;
        settlementCount += r.settlementCount;
      } catch (err) {
        log.error("resolution market processing threw", {
          conditionId: m.conditionId,
          err: (err as Error).message,
        });
      }
    }
    log.debug("resolution poll cycle done", {
      fetched: markets.length,
      processedNew: processed,
      settlementCount,
    });
    return { fetched: markets.length, processed, settlementCount };
  }

  return {
    pollOnce,
    start() {
      stopped = false;
      // Fire one immediately so a fresh boot doesn't wait the full interval before
      // catching the most recent batch of resolutions.
      void pollOnce();
      timer = setInterval(() => {
        if (stopped) return;
        void pollOnce();
      }, opts.pollIntervalMs);
      if (typeof timer.unref === "function") timer.unref();
    },
    async stop() {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

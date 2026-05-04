/**
 * Market probability history — fetches per-outcome price series from
 * Polymarket's CLOB and packages them for the UI's L3 tooltip chart.
 *
 * Source endpoint:
 *   GET https://clob.polymarket.com/prices-history?market={token_id}&interval={d|w|m|max}
 *
 * Response shape:
 *   { history: [{ t: number /* unix-seconds *\/, p: number /* 0..1 *\/ }, ...] }
 *
 * For multi-outcome markets (e.g. NBA Finals — N candidates) we fetch each
 * outcome's series in parallel. For binary markets we still fetch all
 * outcomes; the UI may choose to render only the YES line.
 *
 * Cached by conditionId for 5 minutes — the chart is informational and
 * Polymarket prices don't change interesting amounts faster than that.
 */

import type { Sql } from "postgres";

import type { GammaCache } from "./gamma-cache";
import { log } from "./log";
import type { FetchLike } from "./gamma-cache";

export type ProbabilityPoint = { t: number; p: number };
export type OutcomeSeries = {
  /** Outcome label e.g. "Yes", "Lakers", "Bitcoin > $100k". */
  label: string;
  /** CLOB token ID — opaque, frontend uses it only as a stable key. */
  tokenId: string;
  /** Sorted ascending by `t`. Empty when the CLOB response was empty. */
  points: ProbabilityPoint[];
};

export type MarketHistory = {
  conditionId: string;
  /** Display question — copied from gamma; may be null for legacy. */
  question: string | null;
  outcomes: OutcomeSeries[];
};

export type MarketHistoryArgs = {
  /** "1d" | "1w" | "1m" | "max" — Polymarket interval shorthand. We use
   *  "max" by default for the L3 tooltip chart since it gives the full
   *  market lifetime (matches Polymarket's "ALL" tab). */
  interval?: "1h" | "6h" | "1d" | "1w" | "1m" | "max";
};

type CacheEntry = { data: MarketHistory; ts: number };

const TTL_MS = 5 * 60 * 1000;

export type MarketHistoryFetcher = (
  conditionId: string,
  args?: MarketHistoryArgs,
) => Promise<MarketHistory | null>;

export type MarketHistoryFetcherOptions = {
  sql: Sql;
  gammaCache: GammaCache;
  baseUrl?: string;
  fetchImpl?: FetchLike;
};

export function createMarketHistoryFetcher(
  opts: MarketHistoryFetcherOptions,
): MarketHistoryFetcher {
  const baseUrl = opts.baseUrl ?? "https://clob.polymarket.com";
  const fetchImpl = opts.fetchImpl ?? fetch;
  const cache = new Map<string, CacheEntry>();

  async function getOutcomesForCondition(conditionId: string): Promise<{
    question: string | null;
    pairs: ReadonlyArray<{ label: string; tokenId: string }>;
  }> {
    // Pull recent asset_ids touched by this condition. The freshest gamma
    // entry for any of those gives us outcomes + clobTokenIds. We fall back
    // to the asset_id alone when gamma is silent (single-line chart).
    const rows = await opts.sql<{ asset_id: string }[]>`
      SELECT DISTINCT asset_id
      FROM signals
      WHERE condition_id = ${conditionId}
      LIMIT 32
    `;
    const assetIds = rows.map((r) => r.asset_id);
    if (assetIds.length === 0) return { question: null, pairs: [] };

    // Probe gamma for one of the asset_ids — gamma returns the full market
    // with ALL outcomes' clobTokenIds, not just the one we asked about.
    let market = null;
    for (const aid of assetIds) {
      market = await opts.gammaCache.enrich(aid);
      if (market) break;
    }
    if (!market) {
      // No gamma — fall back to bare asset list with placeholder labels.
      return {
        question: null,
        pairs: assetIds.map((id) => ({ label: id.slice(0, 8) + "…", tokenId: id })),
      };
    }
    const pairs: Array<{ label: string; tokenId: string }> = [];
    const len = Math.min(market.outcomes.length, market.clobTokenIds.length);
    for (let i = 0; i < len; i++) {
      pairs.push({
        label: market.outcomes[i] ?? `Outcome ${i + 1}`,
        tokenId: market.clobTokenIds[i] ?? assetIds[i] ?? "",
      });
    }
    return { question: market.question, pairs };
  }

  async function fetchOnePriceSeries(
    tokenId: string,
    interval: NonNullable<MarketHistoryArgs["interval"]>,
  ): Promise<ProbabilityPoint[]> {
    const url = `${baseUrl}/prices-history?market=${encodeURIComponent(tokenId)}&interval=${interval}&fidelity=60`;
    try {
      const res = await fetchImpl(url);
      if (!res.ok) {
        log.warn("clob prices-history non-ok", { tokenId, status: res.status });
        return [];
      }
      const body = (await res.json()) as { history?: Array<{ t?: number; p?: number }> };
      const hist = Array.isArray(body.history) ? body.history : [];
      return hist
        .map((h) => ({
          t: typeof h.t === "number" ? h.t : 0,
          p: typeof h.p === "number" ? h.p : 0,
        }))
        .filter((pt) => pt.t > 0)
        .sort((a, b) => a.t - b.t);
    } catch (err) {
      log.warn("clob prices-history failed", { tokenId, err: (err as Error).message });
      return [];
    }
  }

  return async function fetchMarketHistory(
    conditionId: string,
    args: MarketHistoryArgs = {},
  ): Promise<MarketHistory | null> {
    const interval = args.interval ?? "max";
    const cacheKey = `${conditionId}:${interval}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < TTL_MS) return hit.data;

    const { question, pairs } = await getOutcomesForCondition(conditionId);
    if (pairs.length === 0) return null;

    // Sequence — multi-outcome markets can have 30+ tokens; running every
    // probe in parallel can saturate the CLOB rate limit. Promise.all is
    // fine for the typical 2-10 outcomes we see; cap to 12 to be safe.
    const limited = pairs.slice(0, 12);
    const series = await Promise.all(
      limited.map(async ({ label, tokenId }) => ({
        label,
        tokenId,
        points: await fetchOnePriceSeries(tokenId, interval),
      })),
    );
    const data: MarketHistory = { conditionId, question, outcomes: series };
    cache.set(cacheKey, { data, ts: Date.now() });
    return data;
  };
}

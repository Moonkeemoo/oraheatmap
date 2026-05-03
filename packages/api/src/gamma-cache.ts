import { categorize, type GammaTag } from "./categorize";
import { log } from "./log";
import type { GammaMarket } from "./types";

type Entry = { data: GammaMarket | null; ts: number };

type RawGammaMarket = {
  question?: unknown;
  endDate?: unknown;
  active?: unknown;
  acceptingOrders?: unknown;
  closed?: unknown;
  outcomes?: unknown;
  outcomePrices?: unknown;
  tags?: unknown;
};

export type GammaCache = {
  enrich(assetId: string): Promise<GammaMarket | null>;
  size(): number;
  /** test hook — drop everything */
  clear(): void;
};

/** Narrow shape so tests can pass minimal fetch mocks without satisfying full DOM `typeof fetch`. */
export type FetchLike = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

export type GammaCacheOptions = {
  baseUrl: string;
  ttlMs: number;
  fetchImpl?: FetchLike;
};

/** Best-effort string parse — Gamma `outcomes` / `outcomePrices` are JSON-encoded strings (SIG-3). */
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
      .map((v) => (typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN))
      .filter((n) => Number.isFinite(n));
  } catch {
    return [];
  }
}

function asGammaMarket(raw: RawGammaMarket): GammaMarket {
  const tags = Array.isArray(raw.tags) ? (raw.tags as GammaTag[]) : [];
  return {
    question: typeof raw.question === "string" ? raw.question : "",
    category: categorize(tags),
    endDate: typeof raw.endDate === "string" ? raw.endDate : null,
    active: Boolean(raw.active) && Boolean(raw.acceptingOrders) && !raw.closed,
    outcomes: parseStringArray(raw.outcomes),
    outcomePrices: parseNumberArray(raw.outcomePrices),
  };
}

export function createGammaCache(opts: GammaCacheOptions): GammaCache {
  const cache = new Map<string, Entry>();
  const fetchImpl = opts.fetchImpl ?? fetch;

  async function enrich(assetId: string): Promise<GammaMarket | null> {
    const now = Date.now();
    const hit = cache.get(assetId);
    if (hit && now - hit.ts < opts.ttlMs) return hit.data;

    const url = `${opts.baseUrl}/markets?clob_token_ids=${encodeURIComponent(assetId)}`;
    let data: GammaMarket | null = null;
    try {
      const res = await fetchImpl(url);
      if (!res.ok) {
        log.warn("gamma fetch non-ok", { assetId, status: res.status });
      } else {
        const body: unknown = await res.json();
        if (Array.isArray(body) && body.length > 0) {
          const first = body[0] as RawGammaMarket;
          data = asGammaMarket(first);
        }
      }
    } catch (err) {
      log.warn("gamma fetch failed", { assetId, err: (err as Error).message });
    }

    cache.set(assetId, { data, ts: now });
    return data;
  }

  return {
    enrich,
    size: () => cache.size,
    clear: () => cache.clear(),
  };
}

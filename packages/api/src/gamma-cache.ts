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
  /** Per-market slug (e.g. "russia-ukraine-ceasefire-before-gta-vi-554"). */
  slug?: unknown;
  /** Parent event(s); the modern public URL format is /event/{event.slug}. */
  events?: unknown;
  /** Per-market thumbnail. */
  icon?: unknown;
  /** Larger image; sometimes the only image on event-grouped markets. */
  image?: unknown;
  /** JSON-encoded array of CLOB token IDs (one per outcome) — same SIG-3
   *  string-encoding as outcomes / outcomePrices. */
  clobTokenIds?: unknown;
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

function pickIcon(raw: RawGammaMarket): string | null {
  // Prefer parent event icon — it's usually the curated team / org logo for
  // sports / politics / esports. Falls back to per-market icon, then image.
  if (Array.isArray(raw.events) && raw.events.length > 0) {
    const ev = raw.events[0] as { icon?: unknown; image?: unknown };
    if (typeof ev?.icon === "string" && ev.icon.length > 0) return ev.icon;
    if (typeof ev?.image === "string" && ev.image.length > 0) return ev.image;
  }
  if (typeof raw.icon === "string" && raw.icon.length > 0) return raw.icon;
  if (typeof raw.image === "string" && raw.image.length > 0) return raw.image;
  return null;
}

function pickSlug(raw: RawGammaMarket): string | null {
  // Prefer the parent event's slug — that's the canonical /event/{slug} URL
  // on polymarket.com and lands on a real page even for grouped events.
  // Fall back to the per-market slug if no event is attached.
  if (Array.isArray(raw.events) && raw.events.length > 0) {
    const ev = raw.events[0] as { slug?: unknown };
    if (typeof ev?.slug === "string" && ev.slug.length > 0) return ev.slug;
  }
  if (typeof raw.slug === "string" && raw.slug.length > 0) return raw.slug;
  return null;
}

function asGammaMarket(raw: RawGammaMarket): GammaMarket {
  const tags = Array.isArray(raw.tags) ? (raw.tags as GammaTag[]) : [];
  return {
    question: typeof raw.question === "string" ? raw.question : "",
    category: categorize(tags),
    tags,
    endDate: typeof raw.endDate === "string" ? raw.endDate : null,
    active: Boolean(raw.active) && Boolean(raw.acceptingOrders) && !raw.closed,
    outcomes: parseStringArray(raw.outcomes),
    outcomePrices: parseNumberArray(raw.outcomePrices),
    slug: pickSlug(raw),
    icon: pickIcon(raw),
    clobTokenIds: parseStringArray(raw.clobTokenIds),
  };
}

export function createGammaCache(opts: GammaCacheOptions): GammaCache {
  const cache = new Map<string, Entry>();
  const fetchImpl = opts.fetchImpl ?? fetch;

  async function enrich(assetId: string): Promise<GammaMarket | null> {
    const now = Date.now();
    const hit = cache.get(assetId);
    if (hit && now - hit.ts < opts.ttlMs) return hit.data;

    // ?include_tag=true is REQUIRED — without it Gamma omits the `tags` field
    // entirely, and every signal would be miscategorized as "Other". Confirmed
    // empirically 2026-05-03; the original CLAUDE.md guidance was wrong.
    const url = `${opts.baseUrl}/markets?clob_token_ids=${encodeURIComponent(assetId)}&include_tag=true`;
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

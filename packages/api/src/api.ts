import { cors } from "@elysiajs/cors";
import { Elysia, t } from "elysia";
import type { Sql } from "postgres";

import { CATEGORIES, type Category } from "./categorize";
import {
  assembleHeatmap,
  buildBuckets,
  fetchDataSpan,
  fetchMarketMeta,
  fetchResolvedMarkets,
  fetchTopWhale,
  fetchUniqueWhalesInWindow,
  type HeatmapRange,
  queryHeatmapAggRows,
  queryTopMarketsPerCell,
  queryTopWhales,
  queryTopWhalesPerCell,
  RANGE_CONFIG,
} from "./heatmap-query";
import type { Ingestor } from "./ingestor";
import { log } from "./log";
import { type PatternKind, queryCellCycles, queryPattern } from "./pattern-query";
import type { SignalHub } from "./signal-hub";
import { readAuthFromHeaders } from "./auth-jwt";
import { SUBCATEGORY_LABELS, subcategoriesOf } from "./subcategorize";
import { TtlCache } from "./ttl-cache";
import type { Signal } from "./types";
import { whaleAlias, whaleAliasInfo, whaleColor } from "./whale-display";
import { fetchWhaleProfile } from "./whale-profile";

import type { MarketHistoryFetcher } from "./market-history";

export type ApiDeps = {
  sql: Sql;
  hub: SignalHub;
  ingestor: Ingestor;
  bufferSize: () => number;
  gammaCacheSize: () => number;
  whaleCount: () => number;
  fetchMarketHistory: MarketHistoryFetcher;
};

const SSE_HEARTBEAT_MS = 25_000;
/** Server returns top-N markets per cell (sorted by signal count); UI re-sorts
 *  client-side by active metric and slices to top-5. A small buffer above
 *  the display cap lets the UI switch metrics without refetching. Was 10;
 *  trimmed to 6 because each market entry adds ~150 bytes per cell × 108
 *  cells = the marginal extras dominated payload size and almost never
 *  surfaced after re-sort. */
const TOP_MARKETS_PER_CELL = 6;
/** Top whales fetched per (category, bucket) cell — surfaced in tooltip's
 *  "Top whales" section, click to open the whale drawer. */
// Server returns top-N by USD volume; UI re-sorts client-side by the
// active metric and slices to top-5. Was 20; trimmed to 8 because the
// per-cell whale array dominated /api/heatmap payload size (~260KB
// raw, ~50KB compressed). 8 still gives metric-switch buffer while
// keeping the cold-path JSON well under 1MB.
const TOP_WHALES_PER_CELL = 8;
/** Whales surfaced in the StatsBar "Top Whale" hover popover. */
const TOP_WHALES_LIMIT = 10;
/** Hard cap on rows in the L3 "markets in subcategory" heatmap — anything
 *  beyond this would make the grid unreadable. Sorted by total signals desc. */
const MAX_MARKETS_IN_DRILL = 30;

// ─── Analytics event allowlist ─────────────────────────────────────────────
// Keep the schema explicit — a typo on the frontend should fail closed,
// not silently insert garbage. Mirrors lib/analytics.ts on the web side.
const ALLOWED_EVENT_NAMES = new Set<string>([
  // Identity / navigation
  "session_start",
  "pageview",
  // Heatmap controls
  "mode_changed",
  "range_changed",
  "metric_changed",
  "pattern_kind_changed",
  // Drill / engagement
  "drill_open",
  "drill_back",
  "cell_open",
  "whale_drawer_open",
  "whale_drawer_close",
  // Outbound (the strongest value moment)
  "market_link_click",
  "external_click",
  // Auth funnel
  "signin_modal_opened",
  "signin_modal_closed",
  "signin_completed",
  // Pro-gated UX
  "locked_feature_hover",
  "locked_feature_click",
  // Quality / live feed
  "sse_connected",
  "sse_dropped",
  "convergence_event_seen",
]);

type AnalyticsBatch = {
  events: ReadonlyArray<{
    name: string;
    ts?: string;
    sessionId: string;
    path?: string;
    referrer?: string;
    uaBrief?: string;
    props?: Record<string, unknown>;
  }>;
};

/** Cap each prop value to keep one runaway client from blowing up storage.
 *  Strings clipped to 200 chars; everything else allowed through as-is so
 *  bool/number/null/array round-trip cleanly into JSONB. */
function sanitiseProps(p: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [k, v] of Object.entries(p)) {
    if (count >= 30) break; // hard cap on prop count per event
    const key = k.length > 50 ? k.slice(0, 50) : k;
    if (typeof v === "string") out[key] = v.length > 200 ? v.slice(0, 200) : v;
    else out[key] = v;
    count++;
  }
  return out;
}

// ─── Response caches ───────────────────────────────────────────────────────
// In-process LRU+TTL caches absorb tab-switch spam — most users flick
// LIVE↔PATTERN↔1h↔24h within seconds, and each request without cache
// reruns multi-million-row scans. Keys are pure query-param tuples so
// the same params from different users hit the same cached response.
const heatmapCache = new TtlCache<unknown>(512);
const highlightsCache = new TtlCache<unknown>(512);
const landingStatsCache = new TtlCache<unknown>(2);

/** TTL for the heatmap response. Tuned so cache TTL > client polling
 *  interval (REFRESH_MS_LIVE in useHeatmap), so consecutive polls
 *  hit cache instead of always missing. Visual freshness is preserved
 *  by SSE optimistic updates layered on top — even a 30s-stale heatmap
 *  payload feels live to the user. */
function heatmapTtlMs(mode: string, range: string | undefined): number {
  if (mode === "pattern") return 300_000; // 5 min — averages move slowly
  switch (range) {
    case "1h":
      return 30_000; // client polls 10s; one poll out of 3 will be a fresh fetch
    case "24h":
      return 60_000; // client polls 30s
    case "12d":
      return 300_000; // 5 min
    case "12w":
      return 600_000; // 10 min — daily/weekly buckets barely shift
    default:
      return 30_000;
  }
}

/** TTL for /api/highlights. Mirror the heatmap policy off window span. */
function highlightsTtlMs(fromIso: string | null, toIso: string): number {
  if (!fromIso) return 300_000;
  const span = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (span <= 2 * 3600_000) return 30_000;
  if (span <= 36 * 3600_000) return 60_000;
  if (span <= 14 * 86400_000) return 300_000;
  return 600_000;
}

/** Build a HTTP Cache-Control header that mirrors the in-process TTL.
 *  `public` because /api/heatmap and /api/highlights don't depend on the
 *  caller's identity — same response for all users. */
function cacheControlHeader(ttlMs: number): string {
  const sec = Math.max(1, Math.floor(ttlMs / 1000));
  // stale-while-revalidate doubles the effective cache window — browsers
  // serve the stale value while refreshing in the background.
  return `public, max-age=${sec}, stale-while-revalidate=${sec}`;
}

/** Trim a market question for the L3 row label so it fits a 2-line clamp.
 *  Stages run in order, each one a no-op when its pattern doesn't match.
 *  Full original label is still surfaced via the `title` attribute on hover.
 *
 *  Universal:
 *    1. drop subcategory prefix ("Bitcoin Up or Down" → "Up or Down")
 *    2. drop leading "Will the " / "Will "
 *    3. drop subcategory prefix again ("Will Bitcoin reach…" → "reach…")
 *    4. drop trailing "?"
 *
 *  Pattern-specific (most common formats in the corpus):
 *    5. "{team} wins the [YEAR] [LEAGUE] {Event}" → "{team} · {Event}"
 *       e.g. "Lakers win the 2026 NBA Finals" → "Lakers · Finals"
 *    6. "Up or Down - [Date,] {T1}-{T2} [TZ]" → "Up/Down {T1}–{T2}"
 *       e.g. "Up or Down - May 3, 3:15PM-3:30PM ET" → "Up/Down 3:15PM–3:30PM"
 *    7. "{highest|lowest} temperature in {City} be {Val} on {Date}"
 *       → "{City} {max|min} {Val} · {Date}"
 */
function shortenMarketLabel(label: string, subcategoryLabel: string | null): string {
  let out = label.trim();
  const stripPrefix = (s: string, pfx: string): string => {
    const re = new RegExp(`^${pfx.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i");
    return s.replace(re, "");
  };

  // 1-3 — universal prefixes
  if (subcategoryLabel) out = stripPrefix(out, subcategoryLabel);
  out = out.replace(/^Will\s+(the\s+)?/i, "");
  if (subcategoryLabel) out = stripPrefix(out, subcategoryLabel);

  // 5 — league finals / championship / cup
  // {team} (wins?) (the)? (YEAR)? (LEAGUE)? {Event}
  out = out.replace(
    /^(.+?)\s+wins?\s+(?:the\s+)?(?:\d{4}\s+)?(?:[A-Z]{2,5}\s+)?(Finals?|Championship|Stanley Cup|World Series|World Cup|Super Bowl|Cup|League)\??$/,
    "$1 · $2",
  );

  // 6 — crypto perpetual "Up or Down - <date>, <T1>-<T2> [TZ]"
  out = out.replace(
    /^Up or Down\s*-?\s*(?:[A-Z][a-z]+\s+\d+,?\s*)?(\d{1,2}(?::\d{2})?\s*(?:AM|PM))-(\d{1,2}(?::\d{2})?\s*(?:AM|PM))(?:\s+(?:ET|UTC|GMT|EST|EDT))?\??$/i,
    "Up/Down $1–$2",
  );
  // Single-time variant: "Up or Down - May 3, 2PM ET"
  out = out.replace(
    /^Up or Down\s*-?\s*(?:[A-Z][a-z]+\s+\d+,?\s*)?(\d{1,2}(?::\d{2})?\s*(?:AM|PM))(?:\s+(?:ET|UTC|GMT|EST|EDT))?\??$/i,
    "Up/Down $1",
  );

  // 7 — temperature markets
  out = out.replace(
    /^(highest|lowest)\s+temperature\s+in\s+(.+?)\s+be\s+(.+?)\s+on\s+(.+?)\??$/i,
    (_match, hl: string, city: string, val: string, date: string) =>
      `${city} ${hl.toLowerCase() === "highest" ? "max" : "min"} ${val} · ${date}`,
  );

  // 7b — generic event prefix strip: "{long-preamble}: {actual-content}"
  // → "{actual-content}". Matches any "Tournament, Round: P1 vs P2",
  // "MLB World Series 2026: Yankees in 7 games", "ECB Decision Sept: 25bp
  // hike", etc. — the part before ": " is almost always tournament/event
  // context already shown by the breadcrumb at L3.
  //
  // Safety: requires literal ": " (colon + whitespace), so it won't touch
  // time formats like "3:15PM" (rule 6's output) or fractional-odds
  // notation. Runs AFTER all the targeted shortenings (rules 5/6/7) so
  // those still get their bespoke treatment first.
  out = out.replace(
    /^[^:]{4,}:\s+(.+)$/,
    "$1",
  );

  // 8 — football clubs: strip the " FC" / " F.C." suffix from team names
  // ("Manchester City FC win" → "Manchester City win") wherever it appears,
  // not just at the end. Same for ", end in a draw" → " draw".
  out = out.replace(/\s+F\.?C\.?\b/g, "");
  out = out.replace(/\s+end\s+in\s+a\s+draw/i, " draw");

  // 9 — drop redundant "win on YYYY-MM-DD" date when it's today/tomorrow.
  // Most sports markets resolve same-day, so the date is noise.
  const today = new Date().toISOString().slice(0, 10);
  const tomorrowDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  for (const d of [today, tomorrowDate]) {
    out = out.replace(new RegExp(`\\s+on\\s+${d}\\b`, "i"), "");
  }

  // 10 — "Spread: X (-N.N)" → "X -N.N" (the "Spread:" prefix is dead weight
  // — the tooltip section heading and the parenthesized number make it
  // obvious what kind of market this is).
  out = out.replace(/^Spread:\s*(.+?)\s*\(([+-]?\d+(?:\.\d+)?)\)\s*$/, "$1 $2");

  // 4 — trailing "?"
  out = out.replace(/\?\s*$/, "");
  return out.length > 0 ? out : label;
}

function signalToWire(s: Signal): Record<string, unknown> {
  return {
    ts: s.ts.toISOString(),
    whaleAddr: s.whaleAddr,
    whaleAlias: whaleAlias(s.whaleAddr),
    whaleColor: whaleColor(s.whaleAddr),
    assetId: s.assetId,
    conditionId: s.conditionId,
    marketQuestion: s.marketQuestion,
    marketSlug: s.marketSlug,
    category: s.category,
    subcategory: s.subcategory,
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
        methods: ["GET", "POST", "OPTIONS"],
        // Credentials = true so the Auth.js session cookie set by the web
        // app on the same apex is sent on cross-origin /api/* requests.
        // Browsers refuse `*` Access-Control-Allow-Origin alongside
        // credentials, so `origin: true` reflects the request origin.
        credentials: true,
        // Be explicit: without this the middleware sometimes echoed
        // "undefined" into Access-Control-Allow-Headers when the request
        // didn't carry Access-Control-Request-Headers, which strict browsers
        // reject as a preflight failure ("Failed to fetch" in the console).
        allowedHeaders: ["content-type", "cookie", "authorization"],
      }),
    )
    .get("/api/me", async ({ request }) => {
      const user = await readAuthFromHeaders(request.headers);
      return { user };
    })
    // ── Per-user heatmap row order ──────────────────────────────────────
    // Read all scopes for the current user in a single round-trip — payload
    // is small (a few short string arrays per heatmap level the user touched)
    // and saves N follow-up requests as the user drills down.
    .get("/api/me/row-order", async ({ request, set }) => {
      const user = await readAuthFromHeaders(request.headers);
      if (!user || !user.id) {
        set.status = 401;
        return { error: "unauthenticated" };
      }
      const rows = await deps.sql<{ scope: string; ordered_keys: string[] }[]>`
        SELECT scope, ordered_keys
        FROM user_row_orders
        WHERE user_id = ${user.id}
      `;
      const orders: Record<string, string[]> = {};
      for (const r of rows) orders[r.scope] = r.ordered_keys;
      return { orders };
    })
    // Upsert one scope. Frontend debounces dragEnd → POST so we don't write
    // a row per intermediate reorder.
    .post(
      "/api/me/row-order",
      async ({ body, request, set }) => {
        const user = await readAuthFromHeaders(request.headers);
        if (!user || !user.id) {
          set.status = 401;
          return { error: "unauthenticated" };
        }
        const scope = body.scope.trim();
        const orderedKeys = body.orderedKeys;
        if (!scope || scope.length > 200) {
          set.status = 400;
          return { error: "scope must be 1..200 chars" };
        }
        if (orderedKeys.length > 500) {
          set.status = 400;
          return { error: "orderedKeys too long (max 500)" };
        }
        await deps.sql`
          INSERT INTO user_row_orders (user_id, scope, ordered_keys, updated_at)
          VALUES (${user.id}, ${scope}, ${deps.sql.json(orderedKeys)}, NOW())
          ON CONFLICT (user_id, scope)
          DO UPDATE SET ordered_keys = EXCLUDED.ordered_keys, updated_at = NOW()
        `;
        return { ok: true };
      },
      {
        body: t.Object({
          scope: t.String({ minLength: 1, maxLength: 200 }),
          orderedKeys: t.Array(t.String({ minLength: 1, maxLength: 200 }), {
            maxItems: 500,
          }),
        }),
      },
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
        responseCaches: {
          heatmap: heatmapCache.stats(),
          highlights: highlightsCache.stats(),
          landing: landingStatsCache.stats(),
        },
        ts: new Date().toISOString(),
      };
    })
    .get("/api/landing-stats", async ({ set }) => {
      // Numbers for the public landing strip. Lightweight COUNT/SUM over
      // the signals hypertable — but with potentially many concurrent
      // landing-page visitors, even <100ms each adds up. In-process
      // 60s cache + Cache-Control mirror.
      const cached = landingStatsCache.get("landing");
      if (cached !== undefined) {
        set.headers["x-cache"] = "hit";
        set.headers["cache-control"] = "public, max-age=60, stale-while-revalidate=300";
        return cached;
      }
      const [row] = await deps.sql<
        {
          signals_24h: string;
          volume_24h: string | null;
          net_flow_24h: string | null;
        }[]
      >`
        SELECT
          COUNT(*) FILTER (WHERE ts > NOW() - INTERVAL '24 hours')::text AS signals_24h,
          COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY' AND ts > NOW() - INTERVAL '24 hours'), 0)::text AS volume_24h,
          COALESCE(
            SUM(size * price) FILTER (WHERE side = 'BUY'  AND ts > NOW() - INTERVAL '24 hours')
          - SUM(size * price) FILTER (WHERE side = 'SELL' AND ts > NOW() - INTERVAL '24 hours'),
            0
          )::text AS net_flow_24h
        FROM signals
      `;
      const result = {
        signals24h: Number(row?.signals_24h ?? 0),
        volume24hUsd: Number(row?.volume_24h ?? 0),
        netFlow24hUsd: Number(row?.net_flow_24h ?? 0),
        whalesWatched: deps.whaleCount(),
        generatedAt: new Date().toISOString(),
      };
      landingStatsCache.set("landing", result, 60_000);
      set.headers["x-cache"] = "miss";
      set.headers["cache-control"] = "public, max-age=60, stale-while-revalidate=300";
      return result;
    })
    .post(
      "/api/analytics",
      async ({ body, request, set }) => {
        // Product-analytics ingest. Frontend SDK at lib/analytics.ts
        // batches events client-side and POSTs them in groups of up to
        // BATCH_LIMIT. Strongly-typed event names + props are validated
        // against ALLOWED_EVENTS so a client bug can't silently
        // pollute the table with random shapes.
        const events = (body as AnalyticsBatch).events;
        if (!Array.isArray(events) || events.length === 0) {
          return { ok: true, inserted: 0 };
        }
        if (events.length > 50) {
          set.status = 413;
          return { error: "batch too large (max 50 events)" };
        }
        const auth = await readAuthFromHeaders(request.headers);
        const userId = auth?.id ?? null;
        const country = (request.headers.get("cf-ipcountry") ?? null) || null;

        const rows = events
          .filter((e) => ALLOWED_EVENT_NAMES.has(e.name))
          .map((e) => ({
            // ISO string + ::timestamptz cast in SQL — postgres-js
            // chokes on Date when nested in sql`` fragments.
            ts: e.ts ?? new Date().toISOString(),
            session_id: typeof e.sessionId === "string" ? e.sessionId.slice(0, 64) : "anon",
            user_id: userId,
            name: e.name,
            path: typeof e.path === "string" ? e.path.slice(0, 200) : null,
            referrer: typeof e.referrer === "string" ? e.referrer.slice(0, 200) : null,
            ua_brief: typeof e.uaBrief === "string" ? e.uaBrief.slice(0, 100) : null,
            country,
            // postgres-js parameter binding rejects raw objects under the
            // jsonb-typed column — stringify so it round-trips as text
            // and the ::jsonb cast in the INSERT does the parse.
            props: JSON.stringify(sanitiseProps(e.props ?? {})),
          }));

        if (rows.length === 0) return { ok: true, inserted: 0 };

        // Single multi-row INSERT via UNNEST so one batch holds the
        // postgres connection for one round-trip instead of N. Earlier
        // we wrapped per-row INSERTs in a transaction — that worked,
        // but with the connection pool sized for /api/heatmap's heavy
        // parallel queries, a 50-event batch could saturate a slot for
        // long enough to back-up reader requests.
        await deps.sql`
          INSERT INTO analytics_events
            (ts, session_id, user_id, name, path, referrer, ua_brief, country, props)
          SELECT
            ts::timestamptz, session_id, user_id, name, path, referrer, ua_brief, country, props::jsonb
          FROM UNNEST(
            ${deps.sql.array(rows.map((r) => r.ts))}::text[],
            ${deps.sql.array(rows.map((r) => r.session_id))}::text[],
            ${deps.sql.array(rows.map((r) => r.user_id))}::text[],
            ${deps.sql.array(rows.map((r) => r.name))}::text[],
            ${deps.sql.array(rows.map((r) => r.path))}::text[],
            ${deps.sql.array(rows.map((r) => r.referrer))}::text[],
            ${deps.sql.array(rows.map((r) => r.ua_brief))}::text[],
            ${deps.sql.array(rows.map((r) => r.country))}::text[],
            ${deps.sql.array(rows.map((r) => r.props))}::text[]
          ) AS t(ts, session_id, user_id, name, path, referrer, ua_brief, country, props)
        `;
        return { ok: true, inserted: rows.length };
      },
      {
        body: t.Object({
          events: t.Array(
            t.Object({
              name: t.String({ maxLength: 64 }),
              ts: t.Optional(t.String()),
              sessionId: t.String({ maxLength: 64 }),
              path: t.Optional(t.String({ maxLength: 200 })),
              referrer: t.Optional(t.String({ maxLength: 200 })),
              uaBrief: t.Optional(t.String({ maxLength: 100 })),
              props: t.Optional(t.Record(t.String(), t.Any())),
            }),
            { maxItems: 50 },
          ),
        }),
      },
    )
    .get(
      "/api/heatmap",
      async ({ query, set }) => {
        const mode = query.mode ?? "live";
        const metric = query.metric ?? "signals";

        // Cache lookup BEFORE any DB work. Key = pure query-param tuple
        // (no `now`, no per-request randomness), so identical params from
        // different users hit the same entry.
        const cacheKey = [
          "heatmap",
          mode,
          query.range ?? "",
          query.kind ?? "",
          query.lookbackDays ?? "",
          query.category ?? "",
          query.subcategory ?? "",
          metric,
        ].join("|");
        const ttlMs = heatmapTtlMs(mode, query.range);
        const ccHeader = cacheControlHeader(ttlMs);
        const cached = heatmapCache.get(cacheKey);
        if (cached !== undefined) {
          set.headers["x-cache"] = "hit";
          set.headers["cache-control"] = ccHeader;
          return cached;
        }

        const now = new Date();
        const dataSpan = await fetchDataSpan(deps.sql);
        const trackedWhales = deps.whaleCount();

        // Drill levels:
        //   L1 (no params):                rows = 9 categories
        //   L2 (?category=X):              rows = subcategories of X
        //   L3 (?category=X&subcategory=Y): rows = individual markets in (X, Y)
        // Unknown values silently fall back to a higher level.
        const drillCategory: Category | null =
          query.category && (CATEGORIES as ReadonlyArray<string>).includes(query.category)
            ? (query.category as Category)
            : null;
        const drillRules = drillCategory ? subcategoriesOf(drillCategory) : [];
        const isDrill = drillCategory !== null && drillRules.length > 0;
        const drillSubcategory: string | null =
          isDrill && query.subcategory && drillRules.some((r) => r.slug === query.subcategory)
            ? query.subcategory
            : null;
        const isDrillL3 = drillSubcategory !== null;

        if (mode === "pattern") {
          const kind: PatternKind = query.kind ?? "hour-of-day";
          // HOUR cycle = 1 day → 30 cycles by default (~30 days).
          // DOW  cycle = 1 week → 12 cycles by default (~12 weeks = 84 days).
          const lookbackDays = query.lookbackDays ?? (kind === "day-of-week" ? 84 : 30);
          const rowKeys = isDrill ? drillRules.map((r) => r.slug) : undefined;
          const pattern = await queryPattern(deps.sql, kind, lookbackDays, {
            drillCategory: isDrill ? drillCategory : null,
            rowKeys,
          });
          const patternSubcategoryLabels = isDrill
            ? Object.fromEntries(drillRules.map((r) => [r.slug, SUBCATEGORY_LABELS[r.slug] ?? r.slug]))
            : null;
          const patternResponse = {
            mode: "pattern" as const,
            patternKind: kind,
            lookbackDays,
            generatedAt: now.toISOString(),
            trackedWhales,
            drillCategory: pattern.drillCategory,
            // L3 (per-market) drill not implemented in PATTERN; UI hides
            // the affordance there via `drillSubcategory: null`.
            drillSubcategory: null,
            drillSubcategoryLabel: null,
            categories: pattern.categories,
            subcategoryLabels: patternSubcategoryLabels,
            marketSlugs: null,
            marketIcons: null,
            marketQuestions: null,
            resolvedRows: [],
            topWhales: null,
            buckets: pattern.buckets,
            cells: pattern.cells,
            totals: null,
            metric,
            dataSpan,
          };
          heatmapCache.set(cacheKey, patternResponse, ttlMs);
          set.headers["x-cache"] = "miss";
          set.headers["cache-control"] = ccHeader;
          return patternResponse;
        }

        // live (default)
        const range: HeatmapRange = query.range ?? "1h";
        const cfg = RANGE_CONFIG[range];
        const buckets = buildBuckets(now, cfg.bucketMinutes, cfg.slots);
        const [aggRows, marketRows, topWhaleAddr, uniqueWhales, topWhaleRows, perCellWhaleRows] =
          await Promise.all([
            queryHeatmapAggRows(
              deps.sql,
              range,
              isDrill ? drillCategory : null,
              drillSubcategory,
            ),
            // L3 rows ARE individual markets — top-markets-per-cell becomes
            // self-referential and uninformative. Skip the extra query there.
            isDrillL3
              ? Promise.resolve([])
              : queryTopMarketsPerCell(
                  deps.sql,
                  range,
                  TOP_MARKETS_PER_CELL,
                  isDrill ? drillCategory : null,
                ),
            fetchTopWhale(deps.sql, range),
            fetchUniqueWhalesInWindow(deps.sql, range),
            queryTopWhales(
              deps.sql,
              range,
              isDrill ? drillCategory : null,
              TOP_WHALES_LIMIT,
            ),
            queryTopWhalesPerCell(
              deps.sql,
              range,
              TOP_WHALES_PER_CELL,
              isDrill ? drillCategory : null,
              drillSubcategory,
            ),
          ]);

        // Row-key set differs by drill level:
        //   L1 → undefined (assembleHeatmap defaults to CATEGORIES)
        //   L2 → fixed list of subcategory slugs from rules
        //   L3 → dynamically derived from agg result (top-N condition_ids by signals)
        let rowKeys: ReadonlyArray<string> | undefined;
        let rowLabels: Record<string, string> | null = null;
        let marketSlugs: Record<string, string | null> | null = null;
        let marketIcons: Record<string, string | null> | null = null;
        let marketQuestions: Record<string, string | null> | null = null;
        let resolvedRows: ReadonlyArray<string> = [];
        if (isDrillL3) {
          const totals = new Map<string, number>();
          for (const r of aggRows) {
            totals.set(r.category, (totals.get(r.category) ?? 0) + Number(r.signal_count));
          }
          const sortedConditionIds = Array.from(totals.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, MAX_MARKETS_IN_DRILL)
            .map(([k]) => k);
          rowKeys = sortedConditionIds;
          const [meta, resolvedSet] = await Promise.all([
            fetchMarketMeta(deps.sql, sortedConditionIds),
            fetchResolvedMarkets(deps.sql, sortedConditionIds),
          ]);
          // Trim each label so it fits a 2-line clamp without the layout
          // bursting. See shortenMarketLabel for the rules.
          const subLabel = drillSubcategory
            ? SUBCATEGORY_LABELS[drillSubcategory] ?? drillSubcategory
            : null;
          rowLabels = Object.fromEntries(
            sortedConditionIds.map((cid) => {
              const q = meta[cid]?.question ?? "(unknown)";
              return [cid, shortenMarketLabel(q, subLabel)];
            }),
          );
          marketSlugs = Object.fromEntries(
            sortedConditionIds.map((cid) => [cid, meta[cid]?.slug ?? null]),
          );
          marketIcons = Object.fromEntries(
            sortedConditionIds.map((cid) => [cid, meta[cid]?.icon ?? null]),
          );
          // Original (un-shortened) market questions — tooltip uses this for
          // the L3 header where we have room for the full text. rowLabels
          // above stays the shortened version for the cramped row badges.
          marketQuestions = Object.fromEntries(
            sortedConditionIds.map((cid) => [cid, meta[cid]?.question ?? null]),
          );
          resolvedRows = sortedConditionIds.filter((cid) => resolvedSet.has(cid));
        } else if (isDrill) {
          rowKeys = drillRules.map((r) => r.slug);
          rowLabels = Object.fromEntries(
            drillRules.map((r) => [r.slug, SUBCATEGORY_LABELS[r.slug] ?? r.slug]),
          );
        }

        const grid = assembleHeatmap(
          aggRows,
          marketRows,
          buckets,
          range,
          now,
          {
            rowKeys,
            drillCategory: isDrill ? drillCategory : null,
          },
          perCellWhaleRows,
        );
        // Decorate every cell.topWhales with alias + color so the tooltip
        // can render the chip without a per-row lookup. Aliases / colors
        // are deterministic from address — same address always resolves
        // to the same display. Cast through unknown because the published
        // HeatmapCell.topWhales is readonly { addr, signals, volume, pnl }
        // and we're augmenting it post-build with display fields.
        for (const rowKey of Object.keys(grid.cells)) {
          const row = grid.cells[rowKey] as unknown as Array<{
            topWhales: Array<{
              addr: string;
              alias?: string;
              color?: string;
              profileImage?: string | null;
            }>;
          }>;
          for (const cell of row) {
            for (const w of cell.topWhales) {
              w.alias = whaleAlias(w.addr);
              w.color = whaleColor(w.addr);
              w.profileImage = whaleAliasInfo(w.addr)?.profileImage ?? null;
            }
          }
        }
        const topWhale = topWhaleAddr
          ? {
              addr: topWhaleAddr,
              alias: whaleAlias(topWhaleAddr),
              color: whaleColor(topWhaleAddr),
              profileImage: whaleAliasInfo(topWhaleAddr)?.profileImage ?? null,
            }
          : null;
        const topWhales = topWhaleRows.map((r) => {
          const addr = r.whale_addr;
          return {
            addr,
            alias: whaleAlias(addr),
            color: whaleColor(addr),
            profileImage: whaleAliasInfo(addr)?.profileImage ?? null,
            signals: typeof r.signals === "number" ? r.signals : Number(r.signals),
            volume: typeof r.volume_usd === "number" ? r.volume_usd : Number(r.volume_usd),
            pnl: r.pnl_usd === null
              ? 0
              : typeof r.pnl_usd === "number"
                ? r.pnl_usd
                : Number(r.pnl_usd),
          };
        });
        const drillSubcategoryLabel = drillSubcategory
          ? SUBCATEGORY_LABELS[drillSubcategory] ?? drillSubcategory
          : null;
        const liveResponse = {
          ...grid,
          mode: "live" as const,
          trackedWhales,
          drillSubcategory,
          // Display name of the drilled subcategory — surfaced separately so the
          // breadcrumb can show it cleanly even when subcategoryLabels has been
          // re-purposed to hold conditionId→marketQuestion at L3.
          drillSubcategoryLabel,
          // Row-label map: at L2 it's slug→display, at L3 it's conditionId→marketQuestion.
          // Frontend reads it generically as "give me a label for this row key".
          subcategoryLabels: rowLabels,
          // L3 only: conditionId → polymarket event slug for building the
          // public URL on the row label. NULL at L1/L2.
          marketSlugs,
          marketIcons,
          marketQuestions,
          resolvedRows,
          topWhales,
          totals: {
            ...grid.totals,
            uniqueWhales,
            activeWhales: uniqueWhales,
            topWhale,
          },
          metric,
          dataSpan,
        };
        heatmapCache.set(cacheKey, liveResponse, ttlMs);
        set.headers["x-cache"] = "miss";
        set.headers["cache-control"] = ccHeader;
        return liveResponse;
      },
      {
        query: t.Object({
          mode: t.Optional(t.Union([t.Literal("live"), t.Literal("pattern")])),
          range: t.Optional(
            t.Union([t.Literal("1h"), t.Literal("24h"), t.Literal("12d"), t.Literal("12w")]),
          ),
          kind: t.Optional(
            t.Union([t.Literal("hour-of-day"), t.Literal("day-of-week")]),
          ),
          lookbackDays: t.Optional(t.Numeric({ minimum: 1, maximum: 365 })),
          metric: t.Optional(
            t.Union([
              t.Literal("signals"),
              t.Literal("volume"),
              t.Literal("pnl"),
              t.Literal("winrate"),
              t.Literal("whales"),
            ]),
          ),
          /** Drill-down L2: when set to a Category name (e.g. "Sports"), the
           *  response groups by that category's subcategories instead of
           *  the top-level 9 buckets. Unknown values are ignored silently. */
          category: t.Optional(t.String()),
          /** Drill-down L3: requires `category` to also be set. When set to a
           *  known subcategory slug of that category (e.g. "nba"), groups by
           *  individual market (condition_id) instead of subcategory.
           *  rowLabels in the response then map condition_id → marketQuestion. */
          subcategory: t.Optional(t.String()),
        }),
      },
    )
    .get(
      "/api/whale",
      async ({ query, set }) => {
        const addr = query.addr.toLowerCase();
        if (!/^0x[0-9a-f]{40}$/.test(addr)) {
          set.status = 400;
          return { error: "addr must be a lowercase 0x-prefixed 40-hex address" };
        }
        const range: HeatmapRange = query.range ?? "1h";
        const profile = await fetchWhaleProfile(deps.sql, addr, range);
        const aliasInfo = whaleAliasInfo(addr);
        return {
          ...profile,
          alias: aliasInfo?.alias ?? whaleAlias(addr),
          xHandle: aliasInfo?.xHandle ?? null,
          verified: aliasInfo?.verified ?? false,
          profileImage: aliasInfo?.profileImage ?? null,
          color: whaleColor(addr),
        };
      },
      {
        query: t.Object({
          addr: t.String({ minLength: 42, maxLength: 42 }),
          range: t.Optional(
            t.Union([t.Literal("1h"), t.Literal("24h"), t.Literal("12d"), t.Literal("12w")]),
          ),
        }),
      },
    )
    .get(
      "/api/market-history",
      async ({ query, set }) => {
        const cid = query.conditionId.trim();
        if (!/^0x[0-9a-f]{64}$/i.test(cid)) {
          set.status = 400;
          return { error: "conditionId must be 0x-prefixed 32-byte hex" };
        }
        const data = await deps.fetchMarketHistory(cid, {
          interval: query.interval ?? "max",
        });
        if (!data) {
          set.status = 404;
          return { error: "no history available", conditionId: cid };
        }
        return data;
      },
      {
        query: t.Object({
          conditionId: t.String({ minLength: 66, maxLength: 66 }),
          interval: t.Optional(
            t.Union([
              t.Literal("1h"),
              t.Literal("6h"),
              t.Literal("1d"),
              t.Literal("1w"),
              t.Literal("1m"),
              t.Literal("max"),
            ]),
          ),
        }),
      },
    )
    .get(
      "/api/cell-cycles",
      async ({ query }) => {
        const kind: PatternKind = query.kind ?? "hour-of-day";
        const cat = query.category;
        if (!(CATEGORIES as ReadonlyArray<string>).includes(cat)) {
          return { error: "unknown category", samples: [] };
        }
        const samples = await queryCellCycles(deps.sql, {
          kind,
          category: cat as Category,
          subcategory: query.subcategory ?? null,
          slot: query.slot,
        });
        return { kind, category: cat, slot: query.slot, samples };
      },
      {
        query: t.Object({
          kind: t.Optional(t.Union([t.Literal("hour-of-day"), t.Literal("day-of-week")])),
          category: t.String(),
          subcategory: t.Optional(t.String()),
          slot: t.Numeric({ minimum: 0, maximum: 11 }),
        }),
      },
    )
    .get(
      "/api/cell-feed",
      async ({ query }) => {
        // Recent signals matching a heatmap cell's scope. Powers the live
        // feed inside the click-opened cell drawer. Scope hierarchy:
        //   condition_id (L3) → category + subcategory (L2) → category (L1)
        // Pass whichever applies. `limit` defaults to 20 — we don't paginate;
        // SSE prepends fresh ones client-side.
        const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
        const cat = query.category;
        const sub = query.subcategory ?? null;
        const cid = query.conditionId ?? null;
        type Row = {
          ts: Date | string;
          whale_addr: string;
          asset_id: string;
          condition_id: string | null;
          market_question: string | null;
          market_slug: string | null;
          category: string;
          subcategory: string | null;
          side: "BUY" | "SELL" | "SETTLEMENT";
          price: number;
          size: number;
          realized_pnl: number | null;
          exit_kind: "SELL" | "RESOLUTION" | null;
          tx_hash: string | null;
        };
        // Most-specific scope wins. Always cap at NOW so future-dated rows
        // (rare but seen — see ingestor clamp) don't poison the feed.
        const rows = cid
          ? await deps.sql<Row[]>`
              SELECT ts, whale_addr, asset_id, condition_id, market_question, market_slug,
                     category, subcategory, side, price, size, realized_pnl, exit_kind, tx_hash
              FROM signals
              WHERE condition_id = ${cid} AND ts <= NOW()
              ORDER BY ts DESC
              LIMIT ${limit}
            `
          : sub
            ? await deps.sql<Row[]>`
              SELECT ts, whale_addr, asset_id, condition_id, market_question, market_slug,
                     category, subcategory, side, price, size, realized_pnl, exit_kind, tx_hash
              FROM signals
              WHERE category = ${cat} AND subcategory = ${sub} AND ts <= NOW()
              ORDER BY ts DESC
              LIMIT ${limit}
            `
            : await deps.sql<Row[]>`
              SELECT ts, whale_addr, asset_id, condition_id, market_question, market_slug,
                     category, subcategory, side, price, size, realized_pnl, exit_kind, tx_hash
              FROM signals
              WHERE category = ${cat} AND ts <= NOW()
              ORDER BY ts DESC
              LIMIT ${limit}
            `;
        return {
          signals: rows.map((r) => ({
            ts: r.ts instanceof Date ? r.ts.toISOString() : new Date(r.ts).toISOString(),
            whaleAddr: r.whale_addr,
            whaleAlias: whaleAlias(r.whale_addr),
            whaleColor: whaleColor(r.whale_addr),
            assetId: r.asset_id,
            conditionId: r.condition_id,
            marketQuestion: r.market_question,
            marketSlug: r.market_slug,
            category: r.category,
            subcategory: r.subcategory,
            side: r.side,
            price: Number(r.price),
            size: Number(r.size),
            sizeUsd: Number(r.size) * Number(r.price),
            realizedPnl: r.realized_pnl !== null ? Number(r.realized_pnl) : null,
            exitKind: r.exit_kind,
            txHash: r.tx_hash,
          })),
        };
      },
      {
        query: t.Object({
          category: t.String(),
          subcategory: t.Optional(t.String()),
          conditionId: t.Optional(t.String()),
          limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
        }),
      },
    )
    .get(
      "/api/highlights",
      async ({ query, set }) => {
        // Standout events for the open cell drawer's row, scoped to the
        // header range (whole window, not the cell's bucket). Unit + sort
        // depend on the active heatmap metric:
        //   pnl     → individual exit trades, sorted by |realized_pnl|
        //   volume  → markets, summed USD volume of BUYs
        //   signals → markets, total trade count
        //   whales  → markets, distinct whale_addr count
        // Items are filtered to those at least `threshold`× the baseline
        // (baseline = mean across other items in the same scope+window),
        // so a row where everything is similarly active returns nothing
        // and the UI can show an empty-state instead of mediocre top-N.
        const limit = Math.min(Math.max(query.limit ?? 5, 1), 20);
        const threshold = Math.max(query.threshold ?? 1.5, 1);
        const cat = query.category;
        const sub = query.subcategory ?? null;
        const cid = query.conditionId ?? null;
        // Pass timestamps as ISO strings, not Date objects — postgres-js
        // chokes on Date when interpolated through nested sql`` fragments
        // (the inner template loses the type tag and the driver tries to
        // serialise the Date as a generic param).
        const fromTs = query.fromTs ?? null;
        const toTs = query.toTs ?? new Date().toISOString();
        const metric = query.metric as "pnl" | "volume" | "signals" | "whales";

        // Cache key: query-param tuple. Round timestamps to the nearest
        // 15s so consecutive tab switches (which carry timestamps a few
        // hundred ms apart) hit the same entry instead of all missing.
        const round15s = (iso: string | null): string =>
          iso ? new Date(Math.round(new Date(iso).getTime() / 15_000) * 15_000).toISOString() : "";
        const cacheKey = [
          "highlights",
          metric,
          cat,
          sub ?? "",
          cid ?? "",
          round15s(fromTs),
          round15s(toTs),
          limit,
          threshold,
        ].join("|");
        const ttlMs = highlightsTtlMs(fromTs, toTs);
        const ccHeader = cacheControlHeader(ttlMs);
        const cachedHi = highlightsCache.get(cacheKey);
        if (cachedHi !== undefined) {
          set.headers["x-cache"] = "hit";
          set.headers["cache-control"] = ccHeader;
          return cachedHi;
        }

        const scopeFilter = cid
          ? deps.sql`condition_id = ${cid}`
          : sub
            ? deps.sql`category = ${cat} AND subcategory = ${sub}`
            : deps.sql`category = ${cat}`;
        const fromFilter = fromTs ? deps.sql`AND ts >= ${fromTs}::timestamptz` : deps.sql``;
        const toFilter = deps.sql`AND ts <= ${toTs}::timestamptz`;

        if (metric === "pnl") {
          type Row = {
            ts: Date | string;
            whale_addr: string;
            asset_id: string;
            condition_id: string | null;
            market_question: string | null;
            market_slug: string | null;
            category: string;
            subcategory: string | null;
            side: "BUY" | "SELL" | "SETTLEMENT";
            price: number;
            size: number;
            realized_pnl: number | null;
            exit_kind: "SELL" | "RESOLUTION" | null;
            tx_hash: string | null;
          };
          // Baseline = AVG(|realized_pnl|) across all exits in scope+window.
          // Mean (not median) because postgres percentile_cont is heavier and
          // we already cap by `threshold` — outlier-driven mean still gates
          // out only the truly extreme.
          const [baselineRow] = await deps.sql<{ baseline: number | null }[]>`
            SELECT AVG(ABS(realized_pnl))::float8 AS baseline
            FROM signals
            WHERE ${scopeFilter} ${fromFilter} ${toFilter}
              AND realized_pnl IS NOT NULL AND realized_pnl <> 0
          `;
          const baseline = baselineRow?.baseline ?? 0;
          const minAbs = baseline > 0 ? baseline * threshold : 0;
          const rows = await deps.sql<Row[]>`
            SELECT ts, whale_addr, asset_id, condition_id, market_question,
                   market_slug, category, subcategory, side, price, size,
                   realized_pnl, exit_kind, tx_hash
            FROM signals
            WHERE ${scopeFilter} ${fromFilter} ${toFilter}
              AND realized_pnl IS NOT NULL AND realized_pnl <> 0
              AND ABS(realized_pnl) >= ${minAbs}
            ORDER BY ABS(realized_pnl) DESC
            LIMIT ${limit}
          `;
          const pnlResponse = {
            metric,
            unit: "trade" as const,
            baseline,
            items: rows.map((r) => ({
              ts: r.ts instanceof Date ? r.ts.toISOString() : new Date(r.ts).toISOString(),
              whaleAddr: r.whale_addr,
              whaleAlias: whaleAlias(r.whale_addr),
              whaleColor: whaleColor(r.whale_addr),
              assetId: r.asset_id,
              conditionId: r.condition_id,
              marketQuestion: r.market_question,
              marketSlug: r.market_slug,
              category: r.category,
              subcategory: r.subcategory,
              side: r.side,
              price: Number(r.price),
              size: Number(r.size),
              sizeUsd: Number(r.size) * Number(r.price),
              realizedPnl: r.realized_pnl !== null ? Number(r.realized_pnl) : null,
              exitKind: r.exit_kind,
              txHash: r.tx_hash,
              multiplier: baseline > 0 ? Math.abs(Number(r.realized_pnl)) / baseline : 0,
            })),
          };
          highlightsCache.set(cacheKey, pnlResponse, ttlMs);
          set.headers["x-cache"] = "miss";
          set.headers["cache-control"] = ccHeader;
          return pnlResponse;
        }

        // metric ∈ {volume, signals, whales} — aggregate per condition_id.
        const aggExpr =
          metric === "volume"
            ? deps.sql`SUM(size * price) FILTER (WHERE side = 'BUY')`
            : metric === "signals"
              ? deps.sql`COUNT(*)`
              : deps.sql`COUNT(DISTINCT whale_addr)`;

        type AggRow = {
          condition_id: string | null;
          market_question: string | null;
          market_slug: string | null;
          value: number;
        };
        // Pull all aggregated markets in one query, compute baseline in app
        // code (cheaper than a second query with PARTITION OVER and easier
        // to read). Skip rows where condition_id is NULL — can't render a
        // market card without it.
        const all = await deps.sql<AggRow[]>`
          SELECT
            condition_id,
            MAX(market_question) AS market_question,
            MAX(market_slug)     AS market_slug,
            (${aggExpr})::float8 AS value
          FROM signals
          WHERE ${scopeFilter} ${fromFilter} ${toFilter}
            AND condition_id IS NOT NULL
          GROUP BY condition_id
          HAVING (${aggExpr}) > 0
          ORDER BY value DESC
        `;
        const baseline =
          all.length > 0
            ? all.reduce((s, r) => s + Number(r.value), 0) / all.length
            : 0;
        const minVal = baseline > 0 ? baseline * threshold : 0;
        const filtered = all
          .filter((r) => Number(r.value) >= minVal)
          .slice(0, limit);
        // Hydrate market icons via the same gamma cache the heatmap uses,
        // so the highlight thumbnails match what the user already sees.
        const cidsForIcons = filtered
          .map((r) => r.condition_id)
          .filter((c): c is string => c !== null);
        const meta =
          cidsForIcons.length > 0 ? await fetchMarketMeta(deps.sql, cidsForIcons) : {};
        const marketResponse = {
          metric,
          unit: "market" as const,
          baseline,
          items: filtered.map((r) => {
            const m = r.condition_id ? meta[r.condition_id] : undefined;
            return {
              conditionId: r.condition_id,
              marketQuestion: r.market_question ?? m?.question ?? null,
              marketSlug: r.market_slug ?? m?.slug ?? null,
              marketIcon: m?.icon ?? null,
              value: Number(r.value),
              multiplier: baseline > 0 ? Number(r.value) / baseline : 0,
            };
          }),
        };
        highlightsCache.set(cacheKey, marketResponse, ttlMs);
        set.headers["x-cache"] = "miss";
        set.headers["cache-control"] = ccHeader;
        return marketResponse;
      },
      {
        query: t.Object({
          category: t.String(),
          subcategory: t.Optional(t.String()),
          conditionId: t.Optional(t.String()),
          fromTs: t.Optional(t.String()),
          toTs: t.Optional(t.String()),
          metric: t.Union([
            t.Literal("pnl"),
            t.Literal("volume"),
            t.Literal("signals"),
            t.Literal("whales"),
          ]),
          limit: t.Optional(t.Numeric({ minimum: 1, maximum: 20 })),
          threshold: t.Optional(t.Numeric({ minimum: 1, maximum: 10 })),
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

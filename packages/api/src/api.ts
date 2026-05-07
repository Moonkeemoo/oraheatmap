import { cors } from "@elysiajs/cors";
import { Elysia, t } from "elysia";
import type { Sql } from "postgres";

import { CATEGORIES, type Category } from "./categorize";
import { fetchDataSpan, type HeatmapRange } from "./heatmap-query";
import type { Ingestor } from "./ingestor";
import { log } from "./log";
import { type PatternKind, queryCellCycles } from "./pattern-query";
import type { SignalHub } from "./signal-hub";
import { readAuthFromHeaders } from "./auth-jwt";
import { TtlCache } from "./ttl-cache";
import type { Signal } from "./types";
import { searchWhales, whaleAlias, whaleAliasInfo, whaleColor } from "./whale-display";
import { fetchCellFeed } from "./cell-feed";
import { fetchCellStats } from "./cell-stats";
import { fetchHighlights } from "./highlights";
import { fetchRecurringWhales } from "./recurring-whales";
import { handleTradesSubject } from "./trades-heatmap";
import { fetchWhaleCell } from "./whale-cell";
import { fetchWhaleProfile } from "./whale-profile";
import { handleWhalesSubject } from "./whales-heatmap";

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
  if (mode === "macro") return 60_000; // 1h × 7d — cells barely shift minute-to-minute, 1min cache is plenty
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
    // ── Per-user whale watchlist ──────────────────────────────────────
    // Pinned whales drive the WATCHLIST tab in the WHALES subject view.
    // Read returns the full lowercased set; write replaces it (frontend
    // sends the new full set on each pin/unpin). 100-addr cap so a
    // misbehaving client can't flood the row.
    .get("/api/me/watchlist", async ({ request, set }) => {
      const user = await readAuthFromHeaders(request.headers);
      if (!user || !user.id) {
        set.status = 401;
        return { error: "unauthenticated" };
      }
      const rows = await deps.sql<{ addrs: string[] }[]>`
        SELECT addrs FROM user_whale_watchlist WHERE user_id = ${user.id}
      `;
      return { addrs: rows[0]?.addrs ?? [] };
    })
    .post(
      "/api/me/watchlist",
      async ({ body, request, set }) => {
        const user = await readAuthFromHeaders(request.headers);
        if (!user || !user.id) {
          set.status = 401;
          return { error: "unauthenticated" };
        }
        // Lowercase + dedupe + sort so the on-disk set is canonical
        // regardless of client-side ordering. Polymarket addresses are
        // hex; rejecting non-hex prevents stray pins of bogus strings.
        const seen = new Set<string>();
        for (const raw of body.addrs) {
          const a = raw.trim().toLowerCase();
          if (!/^0x[0-9a-f]{40}$/.test(a)) continue;
          seen.add(a);
        }
        const addrs = Array.from(seen).sort();
        await deps.sql`
          INSERT INTO user_whale_watchlist (user_id, addrs, updated_at)
          VALUES (${user.id}, ${addrs as unknown as string[]}::text[], NOW())
          ON CONFLICT (user_id)
          DO UPDATE SET addrs = EXCLUDED.addrs, updated_at = NOW()
        `;
        return { ok: true, addrs };
      },
      {
        body: t.Object({
          addrs: t.Array(t.String({ minLength: 1, maxLength: 64 }), {
            maxItems: 100,
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
      async ({ query, request, set }) => {
        const mode = query.mode ?? "live";
        const metric = query.metric ?? "signals";

        // Cache lookup BEFORE any DB work. Key = pure query-param tuple
        // (no `now`, no per-request randomness), so identical params from
        // different users hit the same entry.
        const cacheKey = [
          "heatmap",
          query.subject ?? "trades",
          mode,
          query.range ?? "",
          query.kind ?? "",
          query.macroKind ?? "",
          query.lookbackDays ?? "",
          query.category ?? "",
          query.subcategory ?? "",
          metric,
          // whaleSet only matters for subject=whales but cheap to add
          // unconditionally; keys for trades responses just gain a
          // suffix that always equals the same default.
          query.whaleSet ?? "top",
        ].join("|");
        const ttlMs = heatmapTtlMs(mode, query.range);
        const staleMs = ttlMs * 5;
        const ccHeader = cacheControlHeader(ttlMs);

        const subject = query.subject ?? "trades";
        const whaleSet = (query.whaleSet ?? "top") as "online" | "watchlist" | "top";

        // Watchlist responses are user-specific (cache key has no user_id),
        // so they bypass the shared cache entirely. Anon users get the
        // empty pinned set; the empty-state CTA is rendered client-side.
        if (subject === "whales" && whaleSet === "watchlist") {
          const user = await readAuthFromHeaders(request.headers);
          let watchlistAddrs: string[] = [];
          if (user?.id) {
            const rows = await deps.sql<{ addrs: string[] }[]>`
              SELECT addrs FROM user_whale_watchlist WHERE user_id = ${user.id}
            `;
            watchlistAddrs = rows[0]?.addrs ?? [];
          }
          const whalesResponse = await handleWhalesSubject({
            sql: deps.sql,
            query: { range: query.range, macroKind: query.macroKind, kind: query.kind },
            mode: mode as "live" | "pattern" | "macro",
            metric,
            trackedWhales: deps.whaleCount(),
            dataSpan: await fetchDataSpan(deps.sql),
            now: new Date(),
            whaleSet,
            watchlistAddrs,
          });
          set.headers["x-cache"] = "bypass";
          set.headers["cache-control"] = "private, no-store";
          return whalesResponse;
        }

        // Stale-while-revalidate: a cache miss for /api/heatmap can take
        // 18-22s on macro 7d/12w windows (multiple full-`signals` scans),
        // which under bun.serve's idleTimeout shows up as upstream EOF →
        // Caddy 502 to the user. Serving the previous payload while the
        // refresh runs in the background keeps responses snappy and
        // collapses concurrent misses onto a single compute.
        const compute = async (): Promise<unknown> => {
          const now = new Date();
          const dataSpan = await fetchDataSpan(deps.sql);
          const trackedWhales = deps.whaleCount();
          if (subject === "whales") {
            return handleWhalesSubject({
              sql: deps.sql,
              query: { range: query.range, macroKind: query.macroKind, kind: query.kind },
              mode: mode as "live" | "pattern" | "macro",
              metric,
              trackedWhales,
              dataSpan,
              now,
              whaleSet,
              watchlistAddrs: [],
            });
          }
          return handleTradesSubject({
            sql: deps.sql,
            query: {
              range: query.range,
              kind: query.kind,
              macroKind: query.macroKind,
              lookbackDays: query.lookbackDays,
              category: query.category,
              subcategory: query.subcategory,
            },
            mode: mode as "live" | "pattern" | "macro",
            metric,
            trackedWhales,
            dataSpan,
            now,
          });
        };

        const { value, status } = await heatmapCache.getOrRefresh(
          cacheKey,
          ttlMs,
          staleMs,
          compute,
        );
        set.headers["x-cache"] = status;
        set.headers["cache-control"] = ccHeader;
        return value;
      },
      {
        query: t.Object({
          mode: t.Optional(t.Union([t.Literal("live"), t.Literal("pattern"), t.Literal("macro")])),
          subject: t.Optional(t.Union([t.Literal("trades"), t.Literal("whales")])),
          range: t.Optional(
            t.Union([t.Literal("1h"), t.Literal("24h"), t.Literal("12d"), t.Literal("12w")]),
          ),
          kind: t.Optional(
            t.Union([t.Literal("hour-of-day"), t.Literal("day-of-week")]),
          ),
          lookbackDays: t.Optional(t.Numeric({ minimum: 1, maximum: 365 })),
          macroKind: t.Optional(
            t.Union([t.Literal("hour-week"), t.Literal("day-12w")]),
          ),
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
          /** Which set of whales to render as rows (subject=whales only):
           *  online    → currently active (cheap GROUP BY over signals)
           *  watchlist → authenticated user's pinned set
           *  top       → 90d realised PnL leaders (default, public). */
          whaleSet: t.Optional(
            t.Union([t.Literal("online"), t.Literal("watchlist"), t.Literal("top")]),
          ),
        }),
      },
    )
    .get(
      "/api/cell-stats",
      async ({ query, set }) => {
        const cat = query.category;
        const sub = query.subcategory ?? null;
        const cid = query.conditionId ?? null;
        const fromTs = query.fromTs ?? null;
        const toTs = query.toTs ?? new Date().toISOString();

        const cacheKey = ["cell-stats", cat, sub ?? "", cid ?? "", fromTs ?? "", toTs].join("|");
        const ttlMs = 60_000;
        const cc = cacheControlHeader(ttlMs);
        const cached = highlightsCache.get(cacheKey);
        if (cached !== undefined) {
          set.headers["x-cache"] = "hit";
          set.headers["cache-control"] = cc;
          return cached;
        }

        const result = await fetchCellStats(deps.sql, {
          category: cat,
          subcategory: sub,
          conditionId: cid,
          fromTs,
          toTs,
        });
        highlightsCache.set(cacheKey, result, ttlMs);
        set.headers["x-cache"] = "miss";
        set.headers["cache-control"] = cc;
        return result;
      },
      {
        query: t.Object({
          category: t.String(),
          subcategory: t.Optional(t.String()),
          conditionId: t.Optional(t.String()),
          fromTs: t.Optional(t.String()),
          toTs: t.Optional(t.String()),
        }),
      },
    )
    .get(
      "/api/whale-cell",
      async ({ query, set }) => {
        // Thin wrapper around fetchWhaleCell — caching + headers stay
        // here so the SQL/shaping logic in whale-cell.ts is testable
        // without an HTTP layer.
        const addr = query.addr;
        const fromTs = query.fromTs ?? null;
        const toTs = query.toTs ?? null;
        const kind = query.kind ?? null;
        const slot = query.slot;
        const lookbackDays = query.lookbackDays ?? 90;

        const cacheKey = [
          "whale-cell",
          addr,
          fromTs ?? "",
          toTs ?? "",
          kind ?? "",
          slot ?? "",
          String(lookbackDays),
        ].join("|");
        const ttlMs = 60_000;
        const cc = cacheControlHeader(ttlMs);
        const cached = highlightsCache.get(cacheKey);
        if (cached !== undefined) {
          set.headers["x-cache"] = "hit";
          set.headers["cache-control"] = cc;
          return cached;
        }

        const result = await fetchWhaleCell(deps.sql, {
          addr,
          fromTs,
          toTs,
          kind,
          slot,
          lookbackDays,
        });
        highlightsCache.set(cacheKey, result, ttlMs);
        set.headers["x-cache"] = "miss";
        set.headers["cache-control"] = cc;
        return result;
      },
      {
        query: t.Object({
          addr: t.String(),
          fromTs: t.Optional(t.String()),
          toTs: t.Optional(t.String()),
          kind: t.Optional(
            t.Union([t.Literal("hour-of-day"), t.Literal("day-of-week")]),
          ),
          slot: t.Optional(t.Numeric({ minimum: 0, maximum: 11 })),
          lookbackDays: t.Optional(t.Numeric({ minimum: 1, maximum: 365 })),
        }),
      },
    )
    .get(
      "/api/recurring-whales",
      async ({ query, set }) => {
        const cat = query.category;
        const sub = query.subcategory ?? null;
        const cid = query.conditionId ?? null;
        const kind = query.kind;
        const slotIdx = query.slotIdx;
        const lookbackDays = query.lookbackDays ?? 30;

        const cacheKey = [
          "recurring-whales",
          cat, sub ?? "", cid ?? "",
          kind, String(slotIdx), String(lookbackDays),
        ].join("|");
        const ttlMs = 5 * 60_000;
        const cc = cacheControlHeader(ttlMs);
        const cached = highlightsCache.get(cacheKey);
        if (cached !== undefined) {
          set.headers["x-cache"] = "hit";
          set.headers["cache-control"] = cc;
          return cached;
        }

        const result = await fetchRecurringWhales(deps.sql, {
          category: cat,
          subcategory: sub,
          conditionId: cid,
          kind,
          slotIdx,
          lookbackDays,
        });
        highlightsCache.set(cacheKey, result, ttlMs);
        set.headers["x-cache"] = "miss";
        set.headers["cache-control"] = cc;
        return result;
      },
      {
        query: t.Object({
          category: t.String(),
          subcategory: t.Optional(t.String()),
          conditionId: t.Optional(t.String()),
          kind: t.Union([t.Literal("hour-of-day"), t.Literal("day-of-week")]),
          slotIdx: t.Numeric({ minimum: 0, maximum: 11 }),
          lookbackDays: t.Optional(t.Numeric({ minimum: 1, maximum: 90 })),
        }),
      },
    )
    .get(
      "/api/whales/search",
      ({ query }) => {
        // Powered by the in-memory alias map (loaded at boot from
        // whale_aliases.json). No DB hit, so cheap to call on every
        // keystroke from the UI search popover.
        const q = query.q ?? "";
        const limit = Math.min(Math.max(query.limit ?? 10, 1), 20);
        return { matches: searchWhales(q, limit) };
      },
      {
        query: t.Object({
          q: t.String(),
          limit: t.Optional(t.Numeric({ minimum: 1, maximum: 20 })),
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
      async ({ query }) =>
        fetchCellFeed(deps.sql, {
          category: query.category,
          subcategory: query.subcategory ?? null,
          conditionId: query.conditionId ?? null,
          limit: Math.min(Math.max(query.limit ?? 20, 1), 100),
        }),
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
        const limit = Math.min(Math.max(query.limit ?? 5, 1), 20);
        const threshold = Math.max(query.threshold ?? 1.5, 1);
        const cat = query.category;
        const sub = query.subcategory ?? null;
        const cid = query.conditionId ?? null;
        // Pass timestamps as ISO strings, not Date objects — postgres-js
        // chokes on Date when interpolated through nested sql`` fragments.
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

        const result = await fetchHighlights(deps.sql, {
          category: cat,
          subcategory: sub,
          conditionId: cid,
          fromTs,
          toTs,
          metric,
          limit,
          threshold,
        });
        highlightsCache.set(cacheKey, result, ttlMs);
        set.headers["x-cache"] = "miss";
        set.headers["cache-control"] = ccHeader;
        return result;
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

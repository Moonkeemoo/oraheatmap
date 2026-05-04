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
import type { ScopeThresholds } from "./scope-thresholds";
import type { SignalHub } from "./signal-hub";
import { readAuthFromHeaders } from "./auth-jwt";
import { SUBCATEGORY_LABELS, subcategoriesOf } from "./subcategorize";
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
  scopeThresholds: ScopeThresholds;
};

const SSE_HEARTBEAT_MS = 25_000;
/** Server returns top-N markets per cell (sorted by signal count); UI re-sorts
 *  client-side by active metric and slices to top-5. Extras give the UI
 *  freedom to switch metrics without a refetch. */
const TOP_MARKETS_PER_CELL = 10;
/** Top whales fetched per (category, bucket) cell — surfaced in tooltip's
 *  "Top whales" section, click to open the whale drawer. */
// Server returns top-N by USD volume; UI re-sorts client-side by the
// active metric and slices to top-5. 20 gives the UI room to surface
// a different leader on PNL / WIN RATE / TRADES — small list of 5 was
// always volume-leaders, so winrate/pnl tabs ended up with all-null
// "—" because the volume top-5 happened to have no closed trades.
const TOP_WHALES_PER_CELL = 20;
/** Whales surfaced in the StatsBar "Top Whale" hover popover. */
const TOP_WHALES_LIMIT = 10;
/** Hard cap on rows in the L3 "markets in subcategory" heatmap — anything
 *  beyond this would make the grid unreadable. Sorted by total signals desc. */
const MAX_MARKETS_IN_DRILL = 30;

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

function signalToWire(s: Signal, scopeThresholds: ScopeThresholds): Record<string, unknown> {
  const sizeUsd = s.size * s.price;
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
    sizeUsd,
    realizedPnl: s.realizedPnl,
    exitKind: s.exitKind,
    txHash: s.txHash,
    /** "huge" = top 1% in scope (P99+), "big" = top 5% (P95+), null = ordinary.
     *  Frontend uses this to gate the "fly-in callout" / convergence-badge
     *  animations so the dashboard doesn't strobe at peak hours. */
    magnitude: scopeThresholds.magnitudeFor({
      category: s.category,
      subcategory: s.subcategory,
      conditionId: s.conditionId,
      sizeUsd,
      side: s.side,
    }),
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
        ts: new Date().toISOString(),
      };
    })
    .get(
      "/api/heatmap",
      async ({ query }) => {
        const mode = query.mode ?? "live";
        const metric = query.metric ?? "signals";
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
          return {
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
        return {
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
            safeEnqueue(`event: signal\ndata: ${JSON.stringify(signalToWire(signal, deps.scopeThresholds))}\n\n`);
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

# CLAUDE.md — Whale Signal Heatmap

> Real-time heatmap of Polymarket whale activity. Bun + Elysia + TimescaleDB.
> North star: "signals flowing and visible within 3 days, not 3 weeks".
> Repo: `Moonkeemoo/whale-signal-heatmap`.

## What this project does

Connects to Polymarket RTDS WebSocket firehose (every trade on the platform), matches against the full v1 corpus of 1504 watched wallets (no classification filter — heatmap surfaces raw activity, lets the data show which wallets actually move markets), enriches with market metadata via Gamma API, stores in PostgreSQL/TimescaleDB, and visualizes as a live heatmap (categories × 5-minute time slots). User sees where smart money is moving in real time.

Sibling project: `Moonkeemoo/oralab` (auto-trading bot). This project is read-only signals + visualization — no trade execution in MVP.

## Architecture (one screen)

```
External:        RTDS WS firehose · Gamma REST · CLOB REST (fallback)
Hetzner svc:     single Bun process (ingestor + API) · PostgreSQL+TimescaleDB · Caddy
Frontend:        Next.js 15 (App Router) + React 19 + Tailwind, Canvas heatmap, SSE for live updates
```

```
RTDS firehose ──▸ whale match ──▸ gamma enrich ──▸ batch insert ──▸ TimescaleDB
(no auth)         (in-memory Map)   (30s TTL cache)  (every 5s)       ↓
                                                                  continuous
                                                                  aggregates
                                                                      ↓
Browser ◂── SSE live push ◂── Elysia API ◂── signals_5min view
```

Full data source docs: `docs/handoff-polymarket-whale-feeds.md` (from oralab repo, commit d6ea7b9).

## Critical rules — top 7

| # | Rule | If violated |
|---|------|------------|
| SIG-1 | Use `@polymarket/real-time-data-client` SDK — never roll a raw `ws` client. SDK handles the on-wire ping/pong, autoReconnect, and the `subscribe({ subscriptions: [{ topic: "activity", type: "trades" }] })` envelope. Layer a warn-only DATA-silence watchdog on top to spot zombies (firehose silent for >45s). | Hand-rolled WS misses control-frame heartbeats and gets killed by a heartbeat watchdog; or sends the wrong subscribe shape and receives nothing |
| SIG-2 | Wallet/asset extraction must probe ALL aliases: wallet = `proxyWallet ?? proxy_wallet ?? user ?? maker ?? taker ?? address`; asset = `asset ?? asset_id ?? token_id ?? market`; condition = `conditionId ?? condition_id` | Missed signals — `proxyWallet` is the most common wallet field in production; `asset_id` is rare. Vanilla `event.user` / `event.asset_id` drops most trades |
| SIG-3 | Gamma `outcomes`/`outcomePrices` are JSON-strings — must `JSON.parse()` | Crash or garbage category data |
| SIG-3a | Gamma `/markets` does NOT return `tags` by default — must add `?include_tag=true`, otherwise every signal categorizes as "Other" | Heatmap rows all collapse into one bucket |
| SIG-4 | Dead-book filter: drop when `bid ≤ 0.02` | Nonsense price data from Polymarket placeholders |
| SIG-5 | `confidence` is the canonical trust signal — never recompute from `win_rate * hold_hours` | Zero for 99% of wallets (oralab bug d0e10c4). **Obsolete here** — this project doesn't carry confidence; kept as historical reference only |
| SIG-6 | Batch insert signals every 5s, not per-event | DB connection exhaustion under firehose load |
| SIG-7 | WS reconnect handled by the SDK (`autoReconnect: true`); on application-level resubscribe failure, restart the SDK client rather than reusing it | Fragmented state, missed subscriptions |

## Conventions

- **TypeScript strict** — no `any`, no implicit any, no unchecked indexes
- **Discriminated unions** for status types — never bare string status
- **Pure functions where possible** — categorization, color calculation, aggregation must be pure
- **PostgreSQL + Drizzle** — never JSON files for state, never in-memory-only for persistent data
- **Bun runtime** — use native Bun APIs where available (fetch, WebSocket client for simple cases)
- **`@polymarket/real-time-data-client` SDK for RTDS** — never raw `ws`. The SDK handles WS protocol pings, autoReconnect, and the subscribe envelope (`{ subscriptions: [{ topic: "activity", type: "trades" }] }`). Layer a warn-only DATA-silence watchdog on top
- **Elysia for API** — type-safe, native SSE support, fastest on Bun
- **Canvas for heatmap rendering** — not DOM cells. 500+ cells at drill-down level = DOM too slow. Canvas single-pass < 16ms
- **Platform UI in English; Claude ↔ Taras collaboration in Ukrainian**
- **No trade execution in MVP** — read-only signals. Execution lives in oralab
- **All env vars in `.env`** — no hardcoded URLs, thresholds, or TTLs in code. See `.env.example`

## Polymarket data sources

### RTDS firehose (primary — whale detection)
- `wss://ws-live-data.polymarket.com` — no auth
- Subscribe: `{ "type": "trades" }` — server pushes every trade, no reply
- Ping: empty string every 20s + random 0-5s jitter
- Event: `{ asset_id, condition_id, size, price, side, user, timestamp, transaction_hash, title }`

### Gamma API (market metadata enrichment)
- `https://gamma-api.polymarket.com/markets?clob_token_ids={asset_id}` — no auth
- Cache: 30s TTL. Category from `tags[].label`
- Gotcha: `outcomes`/`outcomePrices` are JSON-encoded strings, not arrays

### REST book (fallback only)
- `https://clob.polymarket.com/book?token_id={asset_id}` — cache 500ms
- Gotcha: bids array sometimes UNSORTED — sort by price desc

### Production gotchas (all 8, from oralab v2 handoff)
1. RTDS subscribe = just `{ "type": "trades" }`, nothing else
2. Market WS (if added later): MUST include `custom_feature_enabled: true` or silent failure
3. `asset_id` field inconsistency — always fallback (SIG-2)
4. Dead-book `bid ≤ 0.02` = Polymarket placeholder (SIG-4)
5. Dual heartbeat watchdogs required (SIG-1)
6. CLOB v1 SDK broken since 2026-04-27 — must `@polymarket/clob-client-v2` 1.0.2+
7. Gamma JSON-string fields (SIG-3)
8. `/book` REST ~500ms latency — cache aggressively

## Whale corpus

**It's a watchlist, not a profile DB.** Flat list of 1504 lowercase addresses we want to catch trades from. No classification, no confidence, no metrics — neither in the corpus, nor in `Set<string>` we load it into, nor on `signals` rows.

Source: v1 archive `output/_local_backup_1777785223/wallet_profiles.json` from `Moonkeemoo/ora-et-labora` was used to extract addresses. Full archive is preserved as `data/wallet_profiles_v1.json` (2.2MB) for any future ad-hoc reuse, but no code reads it. Working file is `data/whale_corpus.json` — `string[]` of 1504 addresses, ~70KB.

`whale-corpus.ts` loads it into `Set<string>` at startup. Match = `set.has(trade.user.toLowerCase())`. That's the entire whale logic.

(SIG-5 in the critical-rules table is obsolete in this project — we don't carry confidence at all. Kept the row only as a reference to the v1 lesson.)

## Project structure

Bun workspaces monorepo:

```
packages/
├── api/                          — Bun + Elysia: ingestor + REST + SSE
│   ├── src/
│   │   ├── index.ts              — entrypoint: start ingestor + API
│   │   ├── ingestor.ts           — RTDS WS → match → enrich → batch insert
│   │   ├── whale-corpus.ts       — load addresses from data/whale_corpus.json into Set<string>
│   │   ├── gamma-cache.ts        — market metadata with TTL cache
│   │   ├── db.ts                 — Drizzle + postgres connection
│   │   ├── schema.ts             — Drizzle schema (signals hypertable)
│   │   ├── api.ts                — Elysia: GET /api/heatmap + GET /api/stream (SSE)
│   │   └── categorize.ts         — gamma tags → category mapping (pure function)
│   └── Dockerfile
└── web/                          — Next.js 15 (App Router) + React 19 + Tailwind + shadcn
    ├── src/app/                  — pages
    ├── src/components/heatmap/   — Canvas heatmap renderer + controls
    ├── src/hooks/                — useHeatmapData, useSse
    ├── src/lib/                  — api client, color scales
    └── Dockerfile

data/
├── whale_corpus.json             — flat array of 1504 lowercase addresses (the watchlist)
└── wallet_profiles_v1.json       — full v1 archive snapshot (offline; no code reads it)

db/
└── migrate.sql                   — TimescaleDB schema + continuous aggregates + compression + retention
```

## Heatmap view modes — LIVE (MVP) vs PATTERN (v1.1)

The UI exposes a toggle next to the metric selector: `[LIVE] [PATTERN]`. LIVE is the default and the only mode in MVP. PATTERN ships in v1.1 once the DB has accumulated ≥7 days of signals.

**LIVE — sliding window.** Each cell = real signals in a specific time slot. Slots scroll left as time advances. "What is happening right now" — actionable. Implemented in `packages/api/src/heatmap-query.ts` (`time_bucket('5 minutes', ts)` for 1h window). Time scale selector adds 24h × 1h and 7d × 1d slots later.

**PATTERN — cyclical overlay.** Each cell = `AVG(metric)` for a recurring time slot across the lookback range. "Hour 15:00" cell shows the average across ALL 15:00 hours in the last 7/14/30 days. Daily pattern = 24 columns (hours 00–23); weekly pattern = 7 columns (Mon–Sun). Reveals patterns like "Crypto whales fire at 14:00–16:00 UTC" or "Sports weekends are dead". Powered by the existing `signals_hourly` continuous aggregate — no new ingestion code, just a different `GROUP BY EXTRACT(hour FROM bucket)`. UI subtitle: "Середній патерн за останні 7 днів". Tooltip must show avg + min/max + sample-count.

Don't refactor `heatmap-query.ts` to be mode-aware in MVP — add `pattern-query.ts` separately when v1.1 lands.

## Phase plan (one screen)

| Phase | Days | What |
|---|---|---|
| **MVP** | 1-3 | RTDS ingestor + whale match + gamma enrich + TimescaleDB + API + Next.js heatmap UI in **LIVE** mode (1h window, 5min slots) |
| **v1.1** | 4-5 | Time scale selector (1h/24h/7d) for LIVE. **PATTERN mode** (daily + weekly cyclical, queries `signals_hourly`). Hourly continuous aggregate. SSE live cell flash |
| **v1.2** | 6-7 | Drill-down: category → subcategory → market. Breadcrumb nav |
| **v1.3** | 8-9 | Whale profiles (click whale → history). TG alerts for large signals ($500+) |
| **v2** | 10-14 | Trade execution via CLOB v2. Mobile responsive. Real PnL tracking (resolution) |

## MVP scope (locked)

**In:**
1. RTDS ingestor → match against 1504-wallet watchlist → enrich via Gamma → insert into TimescaleDB
2. API: `/api/heatmap` — 1-hour window, category × 5min slots
3. API: `/api/stream` — SSE push each new whale signal
4. UI: Next.js 15 dashboard (App Router) with Canvas heatmap, PnL + Signal Count toggle, 30s auto-refresh + SSE live cell flash
5. Stats bar: total signals, volume, top category, top whale
6. Deploy: Docker Compose (TimescaleDB + app + Caddy) on Hetzner

**Out (post-MVP):**
Drill-down, multiple time scales, trade execution, whale profiles, mobile, real PnL tracking.

## Running

```bash
bun install
docker compose up db -d                   # TimescaleDB
bun run db:migrate                         # apply schema
bun run dev                                # ingestor + API (watch mode)

# Full stack (production)
docker compose up -d                       # db + app + caddy

# Logs
docker compose logs -f app
```

## Static checks

```bash
bun run typecheck                          # tsc --noEmit (strict)
bun test                                   # vitest
bun test --coverage                        # coverage report
```

## Tooling — how to work on this project

### Skills (use reflexively)
- `brainstorming` → `writing-plans` → `executing-plans` — for new features only
- `test-driven-development` — always for pure functions (`categorize.ts`, aggregation logic)
- `systematic-debugging` — when WS connection issues or data anomalies appear
- `verification-before-completion` — before claiming any task done:
  1. Does `bun run typecheck` pass?
  2. Do tests pass?
  3. Is the ingestor actually receiving signals? (check logs)
  4. Does `/api/heatmap` return real data?

### Before writing code
1. Read this file fully
2. Read `docs/handoff-polymarket-whale-feeds.md` in oralab repo for endpoint details
3. Check `.env.example` for all configurable values
4. Understand the critical rules table — especially SIG-1 (dual heartbeat) and SIG-5 (confidence field)

### Code quality gates
- No `console.log` in production — use structured logger
- Every WS event handler must have try/catch — one bad parse must not crash the ingestor
- Batch DB inserts — never insert per-event
- Cache gamma responses — never fetch per-event
- All thresholds from env vars — never hardcode timeouts, intervals, TTLs

## Reference implementations

Copy patterns from `Moonkeemoo/oralab` production code:
- `src/feed/rtds_feed.ts` — RTDS subscriber (the starting point for `ingestor.ts`)
- `src/feed/market_book_ws.ts` (444 LOC) — dual heartbeat + zombie detection + dead-book filter
- `src/api/gamma.ts` — gamma metadata fetch + JSON-string parse
- `src/api/book.ts` — REST `/book` with TTL cache

## Maintenance triggers

Update this file when:
- New data source or WS connection added
- New critical rule discovered
- New API endpoint added
- Convention or stack change
- Phase transition

Skip for: bugfixes, tests, UI tweaks, style changes.

-- Whale Signal Heatmap — Database Schema
-- PostgreSQL 16 + TimescaleDB

-- Enable TimescaleDB
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ══════════════════════════════════════════
-- Signals table (hypertable, partitioned by time)
-- ══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS signals (
  id              BIGSERIAL,
  ts              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  whale_addr      TEXT NOT NULL,             -- lowercase, matched against watchlist
  asset_id        TEXT NOT NULL,
  condition_id    TEXT,
  market_question TEXT,
  category        TEXT NOT NULL DEFAULT 'Other',
  side            TEXT NOT NULL,             -- BUY | SELL | SETTLEMENT
  price           REAL NOT NULL,             -- 0..1 outcome price at trade time (1.0/0.0 on SETTLEMENT)
  size            REAL NOT NULL,             -- shares (NOT USD); USD = size * price
  tx_hash         TEXT,
  realized_pnl    REAL,                      -- NULL for entries (BUY) and unmatched exits;
                                             -- USD for SELL/SETTLEMENT where prior position is known
  exit_kind       TEXT,                      -- NULL for entry; 'SELL' for sell-back; 'RESOLUTION' for settlement
  subcategory     TEXT,                      -- NULL when no canonical sub-tag matched (or pre-deploy rows)
  market_slug     TEXT,                      -- Polymarket event slug for building the public URL; NULL if Gamma omitted it
  market_icon     TEXT                       -- Polymarket-hosted thumbnail URL; NULL if Gamma omitted it
);

-- Idempotent backfill of new columns for already-existing tables (PG ≥ 9.6)
ALTER TABLE signals ADD COLUMN IF NOT EXISTS realized_pnl REAL;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS exit_kind    TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS subcategory  TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS market_slug  TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS market_icon  TEXT;

CREATE INDEX IF NOT EXISTS idx_signals_cat_sub_ts
  ON signals (category, subcategory, ts DESC) WHERE subcategory IS NOT NULL;

-- Convert to hypertable (partitioned by ts, chunk interval 1 day)
SELECT create_hypertable('signals', 'ts',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Indexes for heatmap queries
CREATE INDEX IF NOT EXISTS idx_signals_cat_ts
  ON signals (category, ts DESC);

CREATE INDEX IF NOT EXISTS idx_signals_whale_ts
  ON signals (whale_addr, ts DESC);

-- Powers /api/highlights GROUP BY condition_id within a category window.
-- Without it, 12d/12w highlight queries scan every chunk + GROUP from raw
-- rows; with it, the planner uses an index-only scan over the small
-- (category, condition_id) prefix and aggregates a few pages per chunk.
CREATE INDEX IF NOT EXISTS idx_signals_cat_cond_ts
  ON signals (category, condition_id, ts DESC) WHERE condition_id IS NOT NULL;

-- ══════════════════════════════════════════
-- Continuous aggregate: 5-minute buckets (for 1h heatmap view)
-- ══════════════════════════════════════════

CREATE MATERIALIZED VIEW IF NOT EXISTS signals_5min
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('5 minutes', ts)                                        AS bucket,
  category,
  COUNT(*)                                                            AS signal_count,
  COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)          AS buy_volume_usd,
  COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS realized_pnl_sum,
  COUNT(*) FILTER (WHERE realized_pnl > 0)                            AS win_count,
  COUNT(*) FILTER (WHERE realized_pnl < 0)                            AS loss_count,
  COUNT(DISTINCT whale_addr)                                          AS unique_whales
FROM signals
GROUP BY bucket, category
WITH NO DATA;

-- Refresh every 30 seconds, look back 2 hours
SELECT add_continuous_aggregate_policy('signals_5min',
  start_offset    => INTERVAL '2 hours',
  end_offset      => INTERVAL '30 seconds',
  schedule_interval => INTERVAL '30 seconds',
  if_not_exists   => TRUE
);

-- ══════════════════════════════════════════
-- Continuous aggregate: hourly buckets (for 24h/7d views, post-MVP)
-- ══════════════════════════════════════════

CREATE MATERIALIZED VIEW IF NOT EXISTS signals_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', ts)                                           AS bucket,
  category,
  COUNT(*)                                                            AS signal_count,
  COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)          AS buy_volume_usd,
  COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS realized_pnl_sum,
  COUNT(*) FILTER (WHERE realized_pnl > 0)                            AS win_count,
  COUNT(*) FILTER (WHERE realized_pnl < 0)                            AS loss_count,
  COUNT(DISTINCT whale_addr)                                          AS unique_whales
FROM signals
GROUP BY bucket, category
WITH NO DATA;

SELECT add_continuous_aggregate_policy('signals_hourly',
  start_offset    => INTERVAL '90 days',
  end_offset      => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute',
  if_not_exists   => TRUE
);

-- Real-time aggregation: union materialized buckets with raw signals for the
-- still-open current bucket. Without this, hourly buckets only appear in the
-- view AFTER they end + end_offset → the LIVE 24h heatmap silently dropped
-- the current hour (~5% of the window). Idempotent SET, fine to re-apply.
ALTER MATERIALIZED VIEW signals_hourly SET (timescaledb.materialized_only = false);
ALTER MATERIALIZED VIEW signals_5min   SET (timescaledb.materialized_only = false);

-- ══════════════════════════════════════════
-- Compression policy (compress chunks older than 7 days)
-- ══════════════════════════════════════════

ALTER TABLE signals SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'category',
  timescaledb.compress_orderby = 'ts DESC'
);

SELECT add_compression_policy('signals', INTERVAL '7 days', if_not_exists => TRUE);

-- Retention: drop raw data older than 90 days (aggregates remain)
SELECT add_retention_policy('signals', INTERVAL '90 days', if_not_exists => TRUE);

-- Whale watchlist lives in code (data/whale_corpus.json → Set<string>).
-- No DB table — addresses are static, no joins/ranking needed at query time.

-- ══════════════════════════════════════════
-- Whale positions (state for realized PnL calculation)
-- ══════════════════════════════════════════
--
-- Source-of-truth at runtime is an in-memory Map in position-tracker.ts.
-- This table is the persistent mirror, written-behind every ~2s, and
-- read on boot to hydrate the in-memory state. Lookups during ingest
-- never touch the DB.
--
-- A row exists only while net_shares > 0. When a position is fully
-- closed (SELL drains shares to 0, or RESOLUTION settles it), the row
-- is DELETEd by the tracker.

CREATE TABLE IF NOT EXISTS whale_positions (
  whale_addr        TEXT NOT NULL,
  asset_id          TEXT NOT NULL,
  net_shares        REAL NOT NULL,
  avg_entry_price   REAL NOT NULL,
  total_cost_usd    REAL NOT NULL,
  opened_at         TIMESTAMPTZ NOT NULL,
  last_modified_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (whale_addr, asset_id)
);

-- Lookup helpers for the resolution watcher (asset_id → all open positions)
CREATE INDEX IF NOT EXISTS idx_whale_positions_asset
  ON whale_positions (asset_id);

-- ══════════════════════════════════════════
-- Resolution dedupe (so the watcher doesn't process the same market twice)
-- ══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS processed_resolutions (
  condition_id   TEXT PRIMARY KEY,
  resolved_at    TIMESTAMPTZ NOT NULL,        -- as reported by Gamma (market.endDate or updatedAt)
  winning_asset  TEXT,                        -- the clob_token_id that paid out at $1
  processed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════
-- Auth.js (NextAuth v5) Drizzle adapter tables
-- ══════════════════════════════════════════
--
-- Standard schema from https://authjs.dev/getting-started/adapters/drizzle.
-- Email magic-link provider needs `auth_verification_tokens`. OAuth
-- providers (Twitter) write to `auth_accounts`. SIWE / Telegram credentials
-- stay JWT-only and never touch these tables, but the adapter still requires
-- their existence.

CREATE TABLE IF NOT EXISTS auth_users (
  id               TEXT PRIMARY KEY,
  name             TEXT,
  email            TEXT UNIQUE,
  email_verified   TIMESTAMPTZ,
  image            TEXT
);

CREATE TABLE IF NOT EXISTS auth_accounts (
  user_id              TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  type                 TEXT NOT NULL,
  provider             TEXT NOT NULL,
  provider_account_id  TEXT NOT NULL,
  refresh_token        TEXT,
  access_token         TEXT,
  expires_at           INTEGER,
  token_type           TEXT,
  scope                TEXT,
  id_token             TEXT,
  session_state        TEXT,
  PRIMARY KEY (provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  session_token  TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires        TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_verification_tokens (
  identifier  TEXT NOT NULL,
  token       TEXT NOT NULL,
  expires     TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- Passkey / WebAuthn credentials. Each row is one passkey registered by
-- a user for this site (a user can have many passkeys — one per device).
CREATE TABLE IF NOT EXISTS auth_authenticators (
  credential_id          TEXT NOT NULL UNIQUE,
  user_id                TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  provider_account_id    TEXT NOT NULL,
  credential_public_key  TEXT NOT NULL,
  counter                INTEGER NOT NULL,
  credential_device_type TEXT NOT NULL,
  credential_backed_up   BOOLEAN NOT NULL,
  transports             TEXT,
  PRIMARY KEY (user_id, credential_id)
);

-- Per-user heatmap row order. Scope encodes (level, mode, parents) so that
-- L1, L2, L3 and PATTERN-vs-LIVE each carry an independent ordering. Range
-- is intentionally not part of the scope — the same order applies across
-- 1h/24h/7d/30d for the same mode+level.
--
-- user_id is the OPAQUE session identifier from Auth.js JWT `sub`. For
-- email/OAuth users it matches auth_users.id (a UUID); for SIWE it's the
-- lowercase wallet address; for Telegram it's the numeric tg user id. NO
-- foreign key to auth_users — SIWE and Telegram are JWT-only and don't
-- populate that table, so a FK would silently block their INSERTs (500 →
-- frontend swallows → row order doesn't persist for half of all providers).
CREATE TABLE IF NOT EXISTS user_row_orders (
  user_id      TEXT NOT NULL,
  scope        TEXT NOT NULL,
  ordered_keys JSONB NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, scope)
);

CREATE INDEX IF NOT EXISTS user_row_orders_user_idx
  ON user_row_orders (user_id);

-- ══════════════════════════════════════════
-- Per-user whale watchlist
-- ══════════════════════════════════════════
-- Pinned whales surfaced in the WHALES subject view's WATCHLIST tab.
-- One row per (user_id) — full set of pinned addresses lives in `addrs`
-- as a lowercased text[] sorted alphabetically. Replace-on-write
-- semantics (POST /api/me/watchlist sends the entire current set), so
-- there's no per-(user, addr) row and no need for an index beyond the
-- PK.
--
-- user_id mirrors the user_row_orders convention — Auth.js JWT `sub`,
-- no FK so SIWE / Telegram providers (which don't populate auth_users)
-- still work.
CREATE TABLE IF NOT EXISTS user_whale_watchlist (
  user_id    TEXT PRIMARY KEY,
  addrs      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════
-- Product analytics — anonymised event log
-- ══════════════════════════════════════════
-- First-party event store. Frontend SDK at packages/web/src/lib/analytics.ts
-- buffers user-facing events and POSTs them in batches to /api/analytics.
-- Hypertable so it scales the same way signals do; same retention policy
-- can be applied later when volume justifies it.
--
-- Identity model:
--   session_id — opaque random UUID stored in localStorage. Stable across
--                page reloads on the same browser, regenerated on a hard
--                wipe. NOT a fingerprint; no cross-site tracking.
--   user_id    — Auth.js JWT `sub` when signed in, NULL otherwise.
--                Same value as user_row_orders.user_id so funnels can join.
--
-- Privacy:
--   We only store the IP's coarse country code (Caddy/Cloudflare can fill
--   this via header), never the full IP. Path stored as URL pathname only
--   (no query strings — those can carry PII via referral params). Props is
--   a JSONB blob the SDK fills with explicit, schema-controlled keys.
CREATE TABLE IF NOT EXISTS analytics_events (
  id          BIGSERIAL,
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id  TEXT NOT NULL,
  user_id     TEXT,
  name        TEXT NOT NULL,                    -- event name, e.g. "pageview", "drill_open"
  path        TEXT,                             -- URL pathname only, no query string
  referrer    TEXT,                             -- document.referrer hostname only
  ua_brief    TEXT,                             -- "Chrome 132 / macOS 14" — brief UA, no fingerprint surface
  country     TEXT,                             -- 2-letter ISO country code; NULL until edge headers wired
  props       JSONB NOT NULL DEFAULT '{}'::jsonb
);

SELECT create_hypertable('analytics_events', 'ts',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_analytics_name_ts
  ON analytics_events (name, ts DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_session_ts
  ON analytics_events (session_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_user_ts
  ON analytics_events (user_id, ts DESC) WHERE user_id IS NOT NULL;

-- Drop chunks older than 365 days — rolling year of analytics is plenty
-- for product decisions; further-back rows belong in cold storage if
-- ever needed. Re-applying is safe (idempotent).
SELECT add_retention_policy('analytics_events', INTERVAL '365 days', if_not_exists => TRUE);

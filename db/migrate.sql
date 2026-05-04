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
  market_slug     TEXT                       -- Polymarket event slug for building the public URL; NULL if Gamma omitted it
);

-- Idempotent backfill of new columns for already-existing tables (PG ≥ 9.6)
ALTER TABLE signals ADD COLUMN IF NOT EXISTS realized_pnl REAL;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS exit_kind    TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS subcategory  TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS market_slug  TEXT;

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

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
  whale_addr      TEXT NOT NULL,            -- lowercase, matched against watchlist
  asset_id        TEXT NOT NULL,
  condition_id    TEXT,
  market_question TEXT,
  category        TEXT NOT NULL DEFAULT 'Other',
  side            TEXT NOT NULL,            -- BUY | SELL
  price           REAL NOT NULL,
  size            REAL NOT NULL,            -- USD
  tx_hash         TEXT
);

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
  time_bucket('5 minutes', ts) AS bucket,
  category,
  COUNT(*)                     AS signal_count,
  SUM(size)                    AS total_volume,
  AVG(size)                    AS avg_size,
  COUNT(DISTINCT whale_addr)   AS unique_whales,
  -- Directional PnL proxy:
  -- BUY at price>0.5 = bullish bet, BUY at price<0.5 = contrarian bet
  -- We track net "smart money direction" weighted by size
  SUM(CASE
    WHEN side = 'BUY'  THEN size * (price - 0.5) * 2
    WHEN side = 'SELL' THEN size * (0.5 - price) * 2
    ELSE 0
  END)                         AS directional_score
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
  time_bucket('1 hour', ts)    AS bucket,
  category,
  COUNT(*)                     AS signal_count,
  SUM(size)                    AS total_volume,
  AVG(size)                    AS avg_size,
  COUNT(DISTINCT whale_addr)   AS unique_whales,
  SUM(CASE
    WHEN side = 'BUY'  THEN size * (price - 0.5) * 2
    WHEN side = 'SELL' THEN size * (0.5 - price) * 2
    ELSE 0
  END)                         AS directional_score
FROM signals
GROUP BY bucket, category
WITH NO DATA;

SELECT add_continuous_aggregate_policy('signals_hourly',
  start_offset    => INTERVAL '14 days',
  end_offset      => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute',
  if_not_exists   => TRUE
);

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

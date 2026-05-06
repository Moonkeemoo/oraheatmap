/**
 * Per-whale profile aggregations for the side-drawer in the UI. All metrics
 * scoped to the same window the heatmap is showing (1h / 24h / 12d / 12w).
 *
 * Open positions come from `whale_positions` (which is the in-memory tracker's
 * write-behind mirror); recent trades + window stats come from `signals`.
 * Market metadata (question + slug) is sourced from the most-recent matching
 * signal — `whale_positions` doesn't carry it, but every position must have
 * at least one BUY in `signals` to exist.
 */

import type { Sql } from "postgres";

import { type HeatmapRange, RANGE_CONFIG } from "./heatmap-query";

export type WhaleProfileStats = {
  signals: number;
  volume: number;
  pnl: number;
  /** wins / (wins + losses) over decided exits in window. NULL when no exits. */
  winRate: number | null;
};

export type WhaleCategorySplit = {
  category: string;
  volume: number;
  signals: number;
};

export type WhaleOpenPosition = {
  assetId: string;
  conditionId: string | null;
  marketQuestion: string | null;
  marketSlug: string | null;
  netShares: number;
  avgEntry: number;
  totalCost: number;
  openedAt: string;
  lastModifiedAt: string;
};

export type WhaleRecentTrade = {
  ts: string;
  side: "BUY" | "SELL" | "SETTLEMENT";
  category: string;
  subcategory: string | null;
  conditionId: string | null;
  marketQuestion: string | null;
  marketSlug: string | null;
  size: number;
  price: number;
  sizeUsd: number;
  realizedPnl: number | null;
  exitKind: "SELL" | "RESOLUTION" | null;
};

export type WhalePnlPoint = {
  /** ISO date — day boundary in UTC. */
  day: string;
  /** Cumulative realized PnL up to and including this day, USD. */
  cumulativePnl: number;
};

/** Composite "trader reputation" score on the 90-day window.
 *  Single 0-100 number that combines realized PnL magnitude, win
 *  rate, and sample-size confidence into something the UI can show
 *  as a "profile level". Pure server-side compute so the UI doesn't
 *  have to re-derive the formula. */
export type WhaleReputation = {
  score: number; // 0..100, integer
  /** 90-day realized PnL (USD). */
  realizedPnl90d: number;
  /** Trade count over the 90-day window — drives the trust factor. */
  trades90d: number;
  /** Win rate over decided exits in the 90-day window. NULL when no
   *  resolved trades — the score falls back to neutral in that case. */
  winRate90d: number | null;
};

export type WhaleProfile = {
  addr: string;
  range: HeatmapRange;
  windowMinutes: number;
  stats: WhaleProfileStats;
  /** Reputation score on the 90-day window — independent of `range`,
   *  same lookback as pnlHistory so the score reads "current form". */
  reputation: WhaleReputation;
  categoryMix: ReadonlyArray<WhaleCategorySplit>;
  openPositions: ReadonlyArray<WhaleOpenPosition>;
  recentTrades: ReadonlyArray<WhaleRecentTrade>;
  /** Daily cumulative realized PnL across the whole 90-day lookback —
   *  feeds the "balance growth" line chart in the drawer. Independent of
   *  the active heatmap range (which is a much narrower window). */
  pnlHistory: ReadonlyArray<WhalePnlPoint>;
};

/**
 * Reputation score formula. 50 = neutral baseline, then nudged by
 * three signals all multiplied by a "trust factor" so wallets with
 * <10 trades stay close to 50 instead of swinging to 0/100 on noise.
 *
 *   trustFactor = clamp(0..1, log10(1 + trades) / log10(101))
 *     0 trades = 0,  100 trades ≈ 1
 *
 *   pnlSignal  = sign(pnl) × clamp(0..1, log10(1 + |pnl| / 1000) / log10(101))
 *     |$1k| ≈ 0.15,  |$100k| ≈ 0.74,  |$1M+| ≈ 1
 *
 *   winSignal  = (winRate − 0.5) × 2     // -1..+1, NULL → 0
 *
 *   score = 50 + (pnlSignal × 35 + winSignal × 15) × trustFactor
 *           clamped to 0..100 and rounded
 *
 * Tuning targets:
 *   100 trades, +$500k, 70% wins  → ≈ 91
 *    10 trades, +$50k,  60% wins  → ≈ 66
 *     5 trades, -$10k,  30% wins  → ≈ 40
 *     0 trades                    → 50 (neutral)
 */
export function computeReputation(input: {
  pnl: number;
  trades: number;
  winRate: number | null;
}): number {
  const trustFactor = Math.min(
    1,
    Math.max(0, Math.log10(1 + input.trades) / Math.log10(101)),
  );
  const pnlAbs = Math.abs(input.pnl);
  const pnlMagnitude = Math.min(
    1,
    Math.log10(1 + pnlAbs / 1000) / Math.log10(101),
  );
  const pnlSignal = (input.pnl >= 0 ? 1 : -1) * pnlMagnitude;
  const winSignal = input.winRate === null ? 0 : (input.winRate - 0.5) * 2;
  const raw = 50 + (pnlSignal * 35 + winSignal * 15) * trustFactor;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

const RECENT_TRADES_LIMIT = 50;
const OPEN_POSITIONS_LIMIT = 10;
/** PnL history lookback for the balance-growth chart. Independent of the
 *  active heatmap range — chart should always show the whale's full
 *  recent arc, not a 1h slice. */
const PNL_HISTORY_DAYS = 90;

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchWhaleProfile(
  sql: Sql,
  addr: string,
  range: HeatmapRange,
): Promise<WhaleProfile> {
  const cfg = RANGE_CONFIG[range];
  const windowInterval = `${cfg.windowMinutes} minutes`;

  type StatsRow = {
    signals: string | number;
    volume_usd: string | number;
    pnl_usd: string | number | null;
    win_count: string | number;
    loss_count: string | number;
  };
  type CatRow = { category: string; volume_usd: string | number; signals: string | number };
  type PosRow = {
    asset_id: string;
    condition_id: string | null;
    market_question: string | null;
    market_slug: string | null;
    net_shares: number;
    avg_entry_price: number;
    total_cost_usd: number;
    opened_at: Date | string;
    last_modified_at: Date | string;
  };
  type PnlRow = { day: string; cum_pnl: string | number };
  type TradeRow = {
    ts: Date | string;
    side: "BUY" | "SELL" | "SETTLEMENT";
    category: string;
    subcategory: string | null;
    condition_id: string | null;
    market_question: string | null;
    market_slug: string | null;
    size: number;
    price: number;
    realized_pnl: number | null;
    exit_kind: "SELL" | "RESOLUTION" | null;
  };

  function toIso(v: Date | string): string {
    return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
  }

  // Window-wide stats + per-category split + recent trades all hit the same
  // (whale_addr, ts) index. Run them in parallel — including the wider
  // 90-day pnl history for the balance-growth chart and the matching
  // 90-day stats roll-up that powers the reputation score.
  const [statsRows, rep90Rows, categoryRows, posRows, tradeRows, pnlRows] = await Promise.all([
    sql<StatsRow[]>`
      SELECT
        COUNT(*)::bigint                                                       AS signals,
        COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)             AS volume_usd,
        COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS pnl_usd,
        COUNT(*) FILTER (WHERE realized_pnl > 0)::bigint                       AS win_count,
        COUNT(*) FILTER (WHERE realized_pnl < 0)::bigint                       AS loss_count
      FROM signals
      WHERE whale_addr = ${addr}
        AND ts >= NOW() - (${windowInterval}::interval)
    `,
    // 90-day reputation stats — independent of `range` so the score
    // reads "current form" the same way the balance-growth chart does.
    sql<StatsRow[]>`
      SELECT
        COUNT(*)::bigint                                                       AS signals,
        COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)             AS volume_usd,
        COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS pnl_usd,
        COUNT(*) FILTER (WHERE realized_pnl > 0)::bigint                       AS win_count,
        COUNT(*) FILTER (WHERE realized_pnl < 0)::bigint                       AS loss_count
      FROM signals
      WHERE whale_addr = ${addr}
        AND ts >= NOW() - (${`${PNL_HISTORY_DAYS} days`}::interval)
    `,
    sql<CatRow[]>`
      SELECT
        category,
        COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)             AS volume_usd,
        COUNT(*)::bigint                                                       AS signals
      FROM signals
      WHERE whale_addr = ${addr}
        AND ts >= NOW() - (${windowInterval}::interval)
      GROUP BY category
      ORDER BY volume_usd DESC
    `,
    // Open positions joined to the most-recent signal for the same
    // (whale_addr, asset_id) so we have market_question + market_slug.
    // DISTINCT ON keeps just the freshest signal per asset.
    sql<PosRow[]>`
      WITH meta AS (
        SELECT DISTINCT ON (whale_addr, asset_id)
          whale_addr, asset_id, condition_id, market_question, market_slug
        FROM signals
        WHERE whale_addr = ${addr}
        ORDER BY whale_addr, asset_id, ts DESC
      )
      SELECT
        p.asset_id, m.condition_id, m.market_question, m.market_slug,
        p.net_shares, p.avg_entry_price, p.total_cost_usd,
        p.opened_at, p.last_modified_at
      FROM whale_positions p
      LEFT JOIN meta m ON m.whale_addr = p.whale_addr AND m.asset_id = p.asset_id
      WHERE p.whale_addr = ${addr}
      ORDER BY p.total_cost_usd DESC
      LIMIT ${OPEN_POSITIONS_LIMIT}
    `,
    sql<TradeRow[]>`
      SELECT
        ts, side, category, subcategory, condition_id, market_question, market_slug,
        size, price, realized_pnl, exit_kind
      FROM signals
      WHERE whale_addr = ${addr}
        AND ts >= NOW() - (${windowInterval}::interval)
      ORDER BY ts DESC
      LIMIT ${RECENT_TRADES_LIMIT}
    `,
    sql<PnlRow[]>`
      WITH per_day AS (
        SELECT
          DATE_TRUNC('day', ts AT TIME ZONE 'UTC') AS day,
          COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS daily_pnl
        FROM signals
        WHERE whale_addr = ${addr}
          AND ts >= NOW() - (${`${PNL_HISTORY_DAYS} days`}::interval)
          AND ts <= NOW()
        GROUP BY day
      )
      SELECT
        to_char(day, 'YYYY-MM-DD') AS day,
        SUM(daily_pnl) OVER (ORDER BY day) AS cum_pnl
      FROM per_day
      ORDER BY day
    `,
  ]);

  const s = statsRows[0];
  const wins = num(s?.win_count);
  const losses = num(s?.loss_count);
  const decided = wins + losses;
  const stats: WhaleProfileStats = {
    signals: num(s?.signals),
    volume: num(s?.volume_usd),
    pnl: num(s?.pnl_usd),
    winRate: decided > 0 ? wins / decided : null,
  };

  const r90 = rep90Rows[0];
  const wins90 = num(r90?.win_count);
  const losses90 = num(r90?.loss_count);
  const decided90 = wins90 + losses90;
  const trades90 = num(r90?.signals);
  const pnl90 = num(r90?.pnl_usd);
  const winRate90 = decided90 > 0 ? wins90 / decided90 : null;
  const reputation: WhaleReputation = {
    score: computeReputation({ pnl: pnl90, trades: trades90, winRate: winRate90 }),
    realizedPnl90d: pnl90,
    trades90d: trades90,
    winRate90d: winRate90,
  };

  const categoryMix: WhaleCategorySplit[] = categoryRows.map((r) => ({
    category: r.category,
    volume: num(r.volume_usd),
    signals: num(r.signals),
  }));

  const openPositions: WhaleOpenPosition[] = posRows.map((p) => ({
    assetId: p.asset_id,
    conditionId: p.condition_id,
    marketQuestion: p.market_question,
    marketSlug: p.market_slug,
    netShares: p.net_shares,
    avgEntry: p.avg_entry_price,
    totalCost: p.total_cost_usd,
    openedAt: toIso(p.opened_at),
    lastModifiedAt: toIso(p.last_modified_at),
  }));

  const recentTrades: WhaleRecentTrade[] = tradeRows.map((t) => ({
    ts: toIso(t.ts),
    side: t.side,
    category: t.category,
    subcategory: t.subcategory,
    conditionId: t.condition_id,
    marketQuestion: t.market_question,
    marketSlug: t.market_slug,
    size: t.size,
    price: t.price,
    sizeUsd: t.size * t.price,
    realizedPnl: t.realized_pnl,
    exitKind: t.exit_kind,
  }));

  const pnlHistory: WhalePnlPoint[] = pnlRows.map((r) => ({
    day: r.day,
    cumulativePnl: num(r.cum_pnl),
  }));

  return {
    addr,
    range,
    windowMinutes: cfg.windowMinutes,
    stats,
    reputation,
    categoryMix,
    openPositions,
    recentTrades,
    pnlHistory,
  };
}

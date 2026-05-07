/**
 * Per-cell top markets + top whales for an arbitrary scope+window.
 *
 * Used by MACRO mode tooltip — macro response skips per-cell aggregates
 * (would dominate the 168-cell payload), so we fetch them on-demand
 * when the user opens a drawer.
 *
 * Scope is (category, optional subcategory, optional conditionId)
 * matching the LIVE/MACRO drill levels. Window is fromTs/toTs ISO.
 */

import type { Sql } from "postgres";

import { whaleAlias, whaleAliasInfo, whaleColor } from "./whale-display";

export type CellStatsParams = {
  category: string;
  subcategory: string | null;
  conditionId: string | null;
  fromTs: string | null;
  toTs: string;
};

export type CellStatsResult = {
  markets: ReadonlyArray<{
    conditionId: string;
    marketQuestion: string | null;
    marketSlug: string | null;
    marketIcon: string | null;
    count: number;
    volume: number;
    pnl: number;
    winRate: number | null;
    uniqueWhales: number;
  }>;
  topWhales: ReadonlyArray<{
    addr: string;
    alias: string;
    color: string;
    profileImage: string | null;
    signals: number;
    volume: number;
    pnl: number;
    winRate: number | null;
    wins: number;
    losses: number;
  }>;
};

export async function fetchCellStats(
  sql: Sql,
  params: CellStatsParams,
): Promise<CellStatsResult> {
  const { category: cat, subcategory: sub, conditionId: cid, fromTs, toTs } = params;

  const scopeFilter = cid
    ? sql`condition_id = ${cid}`
    : sub
      ? sql`category = ${cat} AND subcategory = ${sub}`
      : sql`category = ${cat}`;
  const fromFilter = fromTs ? sql`AND ts >= ${fromTs}::timestamptz` : sql``;
  const toFilter = sql`AND ts <= ${toTs}::timestamptz`;

  // Top markets — skip when already drilled to a single condition_id
  // (then there's only one market by definition).
  type MarketRow = {
    condition_id: string;
    market_question: string | null;
    market_slug: string | null;
    market_icon: string | null;
    signals: number | string;
    volume_usd: number | string;
    pnl_usd: number | string;
    win_count: number | string;
    loss_count: number | string;
    unique_whales: number | string;
  };
  const marketRows = cid
    ? []
    : await sql<MarketRow[]>`
        SELECT
          condition_id,
          MAX(market_question) AS market_question,
          MAX(market_slug)     AS market_slug,
          MAX(market_icon)     AS market_icon,
          COUNT(*)::bigint                                              AS signals,
          COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)    AS volume_usd,
          COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS pnl_usd,
          COUNT(*) FILTER (WHERE realized_pnl > 0)::bigint              AS win_count,
          COUNT(*) FILTER (WHERE realized_pnl < 0)::bigint              AS loss_count,
          COUNT(DISTINCT whale_addr)::bigint                            AS unique_whales
        FROM signals
        WHERE ${scopeFilter} ${fromFilter} ${toFilter}
          AND condition_id IS NOT NULL
        GROUP BY condition_id
        ORDER BY signals DESC
        LIMIT 6
      `;

  // Top whales — same window/scope.
  type WhaleRow = {
    whale_addr: string;
    signals: number | string;
    volume_usd: number | string;
    pnl_usd: number | string;
    wins: number | string;
    losses: number | string;
  };
  const whaleRows = await sql<WhaleRow[]>`
    SELECT
      whale_addr,
      COUNT(*)::bigint                                              AS signals,
      COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)    AS volume_usd,
      COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS pnl_usd,
      COUNT(*) FILTER (WHERE realized_pnl > 0)::bigint              AS wins,
      COUNT(*) FILTER (WHERE realized_pnl < 0)::bigint              AS losses
    FROM signals
    WHERE ${scopeFilter} ${fromFilter} ${toFilter}
      AND whale_addr ~ '^0x[0-9a-f]{40}$'
    GROUP BY whale_addr
    ORDER BY volume_usd DESC, signals DESC
    LIMIT 8
  `;

  return {
    markets: marketRows.map((m) => {
      const wins = Number(m.win_count);
      const losses = Number(m.loss_count);
      const decided = wins + losses;
      return {
        conditionId: m.condition_id,
        marketQuestion: m.market_question,
        marketSlug: m.market_slug,
        marketIcon: m.market_icon,
        count: Number(m.signals),
        volume: Number(m.volume_usd),
        pnl: Number(m.pnl_usd),
        winRate: decided > 0 ? wins / decided : null,
        uniqueWhales: Number(m.unique_whales),
      };
    }),
    topWhales: whaleRows.map((w) => {
      const wins = Number(w.wins);
      const losses = Number(w.losses);
      const decided = wins + losses;
      return {
        addr: w.whale_addr,
        alias: whaleAlias(w.whale_addr),
        color: whaleColor(w.whale_addr),
        profileImage: whaleAliasInfo(w.whale_addr)?.profileImage ?? null,
        signals: Number(w.signals),
        volume: Number(w.volume_usd),
        pnl: Number(w.pnl_usd),
        winRate: decided > 0 ? wins / decided : null,
        wins,
        losses,
      };
    }),
  };
}

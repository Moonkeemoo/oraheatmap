/**
 * Per-cell tooltip data for a SINGLE whale × time-bucket (LIVE / MACRO)
 * or whale × pattern-slot (PATTERN). Powers the whales-subject drawer
 * that opens on cell tap.
 *
 * Returns:
 *   - summary: counters for the headline strip (trades, volume, pnl,
 *     buy/sell split, wins/losses)
 *   - trades: chronological signal list — LIVE / MACRO only. PATTERN
 *     cells aggregate across cycles, so a "trade list" would mix
 *     unrelated time windows
 *   - cycles: per-cycle values for the histogram — PATTERN only
 *   - markets: top N markets the whale touched in this scope
 *
 * Was inline in api.ts as a ~200 LOC route handler. Extracted as a
 * pure async function so the route stays a thin wrapper and the
 * SQL/shaping logic is testable on its own.
 */

import type { Sql } from "postgres";

export type WhaleCellParams = {
  addr: string;
  fromTs: string | null;
  toTs: string | null;
  kind: "hour-of-day" | "day-of-week" | null;
  slot: number | undefined;
  lookbackDays: number;
};

export type WhaleCellResult = {
  summary: {
    trades: number;
    volume: number;
    pnl: number;
    buyVolume: number;
    sellVolume: number;
    wins: number;
    losses: number;
  };
  trades: ReadonlyArray<{
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
  }>;
  cycles: ReadonlyArray<{
    cycle: string;
    count: number;
    volume: number;
    pnl: number;
  }>;
  expectedCycles: number;
  markets: ReadonlyArray<{
    conditionId: string;
    marketQuestion: string | null;
    marketSlug: string | null;
    marketIcon: string | null;
    signals: number;
    volume: number;
    pnl: number;
  }>;
};

export async function fetchWhaleCell(
  sql: Sql,
  params: WhaleCellParams,
): Promise<WhaleCellResult> {
  const { addr, fromTs, toTs, kind, slot, lookbackDays } = params;

  const isPattern = kind !== null && slot !== undefined;
  const slotFilter = isPattern
    ? kind === "hour-of-day"
      ? sql`(EXTRACT(hour FROM ts AT TIME ZONE 'UTC')::int / 2) = ${slot}`
      : sql`EXTRACT(dow FROM ts AT TIME ZONE 'UTC')::int = ${slot}`
    : sql`TRUE`;
  const tsFilter = isPattern
    ? sql`AND ts >= NOW() - (${`${lookbackDays} days`}::interval)`
    : fromTs && toTs
      ? sql`AND ts >= ${fromTs}::timestamptz AND ts < ${toTs}::timestamptz`
      : sql``;

  // ── Summary headline (always populated) ───────────────────────────
  type SummaryRow = {
    trades: number | string;
    volume: number | string;
    pnl: number | string | null;
    buy_volume: number | string;
    sell_volume: number | string;
    wins: number | string;
    losses: number | string;
  };
  const summaryRows = await sql<SummaryRow[]>`
    SELECT
      COUNT(*)::bigint                                              AS trades,
      COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)    AS volume,
      COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS pnl,
      COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)    AS buy_volume,
      COALESCE(SUM(size * price) FILTER (WHERE side = 'SELL'), 0)   AS sell_volume,
      COUNT(*) FILTER (WHERE realized_pnl > 0)::bigint              AS wins,
      COUNT(*) FILTER (WHERE realized_pnl < 0)::bigint              AS losses
    FROM signals
    WHERE whale_addr = ${addr}
      AND ${slotFilter}
      ${tsFilter}
  `;
  const s = summaryRows[0];
  const summary = {
    trades: Number(s?.trades ?? 0),
    volume: Number(s?.volume ?? 0),
    pnl: Number(s?.pnl ?? 0),
    buyVolume: Number(s?.buy_volume ?? 0),
    sellVolume: Number(s?.sell_volume ?? 0),
    wins: Number(s?.wins ?? 0),
    losses: Number(s?.losses ?? 0),
  };

  // ── Trade list — LIVE / MACRO only ────────────────────────────────
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
  };
  const trades = isPattern
    ? []
    : await sql<TradeRow[]>`
        SELECT ts, side, category, subcategory, condition_id, market_question,
               market_slug, size, price, realized_pnl
        FROM signals
        WHERE whale_addr = ${addr}
          ${tsFilter}
        ORDER BY ts DESC
        LIMIT 50
      `;

  // ── Cycle histogram — PATTERN only ────────────────────────────────
  type CycleRow = {
    cycle: Date | string;
    count: number | string;
    volume: number | string;
    pnl: number | string | null;
  };
  const cycleExpr =
    kind === "hour-of-day"
      ? sql`DATE_TRUNC('day', ts AT TIME ZONE 'UTC')`
      : sql`DATE_TRUNC('week', ts AT TIME ZONE 'UTC')`;
  const cycles = !isPattern
    ? []
    : await sql<CycleRow[]>`
        SELECT
          ${cycleExpr}                                                AS cycle,
          COUNT(*)::bigint                                            AS count,
          COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)  AS volume,
          COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS pnl
        FROM signals
        WHERE whale_addr = ${addr}
          AND ${slotFilter}
          ${tsFilter}
        GROUP BY cycle
        ORDER BY cycle
      `;
  const expectedCycles = isPattern
    ? kind === "hour-of-day"
      ? lookbackDays
      : Math.max(1, Math.floor(lookbackDays / 7))
    : 0;

  // ── Markets touched ───────────────────────────────────────────────
  type MarketRow = {
    condition_id: string;
    market_question: string | null;
    market_slug: string | null;
    market_icon: string | null;
    signals: number | string;
    volume: number | string;
    pnl: number | string | null;
  };
  const marketRows = await sql<MarketRow[]>`
    SELECT
      condition_id,
      MAX(market_question) AS market_question,
      MAX(market_slug)     AS market_slug,
      MAX(market_icon)     AS market_icon,
      COUNT(*)::bigint                                              AS signals,
      COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)    AS volume,
      COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL), 0) AS pnl
    FROM signals
    WHERE whale_addr = ${addr}
      AND condition_id IS NOT NULL
      AND ${slotFilter}
      ${tsFilter}
    GROUP BY condition_id
    ORDER BY signals DESC
    LIMIT 5
  `;

  return {
    summary,
    trades: trades.map((t) => ({
      ts: typeof t.ts === "string" ? t.ts : (t.ts as Date).toISOString(),
      side: t.side,
      category: t.category,
      subcategory: t.subcategory,
      conditionId: t.condition_id,
      marketQuestion: t.market_question,
      marketSlug: t.market_slug,
      size: Number(t.size),
      price: Number(t.price),
      sizeUsd: Number(t.size) * Number(t.price),
      realizedPnl: t.realized_pnl === null ? null : Number(t.realized_pnl),
    })),
    cycles: cycles.map((c) => ({
      cycle:
        typeof c.cycle === "string"
          ? c.cycle
          : (c.cycle as Date).toISOString(),
      count: Number(c.count),
      volume: Number(c.volume),
      pnl: c.pnl === null ? 0 : Number(c.pnl),
    })),
    expectedCycles,
    markets: marketRows.map((m) => ({
      conditionId: m.condition_id,
      marketQuestion: m.market_question,
      marketSlug: m.market_slug,
      marketIcon: m.market_icon,
      signals: Number(m.signals),
      volume: Number(m.volume),
      pnl: m.pnl === null ? 0 : Number(m.pnl),
    })),
  };
}

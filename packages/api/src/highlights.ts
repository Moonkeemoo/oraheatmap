/**
 * Standout events for the open cell drawer's row, scoped to the header
 * range (whole window, not the cell's bucket). Unit + sort depend on
 * the active heatmap metric:
 *
 *   pnl     → individual exit trades, sorted by |realized_pnl|
 *   volume  → markets, summed USD volume of BUYs
 *   signals → markets, total trade count
 *   whales  → markets, distinct whale_addr count
 *
 * Items are filtered to those at least `threshold`× the baseline
 * (baseline = mean across other items in the same scope+window), so a
 * row where everything is similarly active returns nothing and the UI
 * can show an empty-state instead of mediocre top-N.
 */

import type { Sql } from "postgres";

import { fetchMarketMeta } from "./heatmap-query";
import { whaleAlias, whaleColor } from "./whale-display";

export type HighlightsMetric = "pnl" | "volume" | "signals" | "whales";

export type HighlightsParams = {
  category: string;
  subcategory: string | null;
  conditionId: string | null;
  fromTs: string | null;
  toTs: string;
  metric: HighlightsMetric;
  limit: number;
  threshold: number;
};

export type HighlightsTradeItem = {
  ts: string;
  whaleAddr: string;
  whaleAlias: string;
  whaleColor: string;
  assetId: string;
  conditionId: string | null;
  marketQuestion: string | null;
  marketSlug: string | null;
  category: string;
  subcategory: string | null;
  side: "BUY" | "SELL" | "SETTLEMENT";
  price: number;
  size: number;
  sizeUsd: number;
  realizedPnl: number | null;
  exitKind: "SELL" | "RESOLUTION" | null;
  txHash: string | null;
  multiplier: number;
};

export type HighlightsMarketItem = {
  conditionId: string | null;
  marketQuestion: string | null;
  marketSlug: string | null;
  marketIcon: string | null;
  value: number;
  multiplier: number;
};

export type HighlightsResult =
  | {
      metric: "pnl";
      unit: "trade";
      baseline: number;
      items: ReadonlyArray<HighlightsTradeItem>;
    }
  | {
      metric: Exclude<HighlightsMetric, "pnl">;
      unit: "market";
      baseline: number;
      items: ReadonlyArray<HighlightsMarketItem>;
    };

export async function fetchHighlights(
  sql: Sql,
  params: HighlightsParams,
): Promise<HighlightsResult> {
  const { category: cat, subcategory: sub, conditionId: cid, fromTs, toTs, metric, limit, threshold } = params;

  const scopeFilter = cid
    ? sql`condition_id = ${cid}`
    : sub
      ? sql`category = ${cat} AND subcategory = ${sub}`
      : sql`category = ${cat}`;
  const fromFilter = fromTs ? sql`AND ts >= ${fromTs}::timestamptz` : sql``;
  const toFilter = sql`AND ts <= ${toTs}::timestamptz`;

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
    // Mean (not median) because postgres percentile_cont is heavier
    // and we already cap by `threshold` — outlier-driven mean still
    // gates out only the truly extreme.
    const [baselineRow] = await sql<{ baseline: number | null }[]>`
      SELECT AVG(ABS(realized_pnl))::float8 AS baseline
      FROM signals
      WHERE ${scopeFilter} ${fromFilter} ${toFilter}
        AND realized_pnl IS NOT NULL AND realized_pnl <> 0
    `;
    const baseline = baselineRow?.baseline ?? 0;
    const minAbs = baseline > 0 ? baseline * threshold : 0;
    const rows = await sql<Row[]>`
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
    return {
      metric,
      unit: "trade",
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
  }

  // metric ∈ {volume, signals, whales} — aggregate per condition_id.
  const aggExpr =
    metric === "volume"
      ? sql`SUM(size * price) FILTER (WHERE side = 'BUY')`
      : metric === "signals"
        ? sql`COUNT(*)`
        : sql`COUNT(DISTINCT whale_addr)`;

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
  const all = await sql<AggRow[]>`
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
  // Hydrate market icons via the same gamma cache the heatmap uses, so
  // highlight thumbnails match what the user already sees.
  const cidsForIcons = filtered
    .map((r) => r.condition_id)
    .filter((c): c is string => c !== null);
  const meta =
    cidsForIcons.length > 0 ? await fetchMarketMeta(sql, cidsForIcons) : {};
  return {
    metric,
    unit: "market",
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
}

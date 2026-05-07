/**
 * Recent signals matching a heatmap cell's scope. Powers the live
 * feed inside the click-opened cell drawer. Scope hierarchy:
 *   condition_id (L3) → category + subcategory (L2) → category (L1)
 *
 * Pass whichever applies. SSE prepends fresh ones client-side, so the
 * feed is always anchored at NOW — future-dated rows (rare but seen
 * via the ingestor clamp) get filtered out by `ts <= NOW()`.
 */

import type { Sql } from "postgres";

import { whaleAlias, whaleColor } from "./whale-display";

export type CellFeedParams = {
  category: string;
  subcategory: string | null;
  conditionId: string | null;
  limit: number;
};

export type CellFeedSignal = {
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
};

export async function fetchCellFeed(
  sql: Sql,
  params: CellFeedParams,
): Promise<{ signals: ReadonlyArray<CellFeedSignal> }> {
  const { category: cat, subcategory: sub, conditionId: cid, limit } = params;
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
  // Most-specific scope wins. Always cap at NOW so future-dated rows
  // (rare but seen — see ingestor clamp) don't poison the feed.
  const rows = cid
    ? await sql<Row[]>`
        SELECT ts, whale_addr, asset_id, condition_id, market_question, market_slug,
               category, subcategory, side, price, size, realized_pnl, exit_kind, tx_hash
        FROM signals
        WHERE condition_id = ${cid} AND ts <= NOW()
        ORDER BY ts DESC
        LIMIT ${limit}
      `
    : sub
      ? await sql<Row[]>`
        SELECT ts, whale_addr, asset_id, condition_id, market_question, market_slug,
               category, subcategory, side, price, size, realized_pnl, exit_kind, tx_hash
        FROM signals
        WHERE category = ${cat} AND subcategory = ${sub} AND ts <= NOW()
        ORDER BY ts DESC
        LIMIT ${limit}
      `
      : await sql<Row[]>`
        SELECT ts, whale_addr, asset_id, condition_id, market_question, market_slug,
               category, subcategory, side, price, size, realized_pnl, exit_kind, tx_hash
        FROM signals
        WHERE category = ${cat} AND ts <= NOW()
        ORDER BY ts DESC
        LIMIT ${limit}
      `;
  return {
    signals: rows.map((r) => ({
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
    })),
  };
}

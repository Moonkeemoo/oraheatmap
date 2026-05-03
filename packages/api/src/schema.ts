import { bigserial, index, pgTable, primaryKey, real, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Mirrors db/migrate.sql:signals. We rely on the SQL migration to convert this
 * to a TimescaleDB hypertable + create indexes + continuous aggregates +
 * compression / retention policies — Drizzle just owns the INSERT shape.
 */
export const signals = pgTable("signals", {
  id: bigserial("id", { mode: "bigint" }),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  whaleAddr: text("whale_addr").notNull(),
  assetId: text("asset_id").notNull(),
  conditionId: text("condition_id"),
  marketQuestion: text("market_question"),
  category: text("category").notNull().default("Other"),
  side: text("side").notNull(),
  price: real("price").notNull(),
  size: real("size").notNull(),
  txHash: text("tx_hash"),
  realizedPnl: real("realized_pnl"),
  exitKind: text("exit_kind"),
  subcategory: text("subcategory"),
  marketSlug: text("market_slug"),
});

export type SignalInsert = typeof signals.$inferInsert;

/**
 * Persistent mirror of the in-memory position state in `position-tracker.ts`.
 * A row exists only while net_shares > 0 — closed positions are DELETEd.
 */
export const whalePositions = pgTable(
  "whale_positions",
  {
    whaleAddr: text("whale_addr").notNull(),
    assetId: text("asset_id").notNull(),
    netShares: real("net_shares").notNull(),
    avgEntryPrice: real("avg_entry_price").notNull(),
    totalCostUsd: real("total_cost_usd").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    lastModifiedAt: timestamp("last_modified_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.whaleAddr, t.assetId] }),
    assetIdx: index("idx_whale_positions_asset").on(t.assetId),
  }),
);

export type WhalePositionRow = typeof whalePositions.$inferSelect;
export type WhalePositionInsert = typeof whalePositions.$inferInsert;

/**
 * Resolution dedupe — the watcher writes a row once it has settled all
 * positions of a given market. Lookups happen at watcher startup +
 * every poll cycle to skip already-handled markets.
 */
export const processedResolutions = pgTable("processed_resolutions", {
  conditionId: text("condition_id").primaryKey(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }).notNull(),
  winningAsset: text("winning_asset"),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProcessedResolutionRow = typeof processedResolutions.$inferSelect;

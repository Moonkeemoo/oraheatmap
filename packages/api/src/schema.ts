import { bigserial, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

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
});

export type SignalInsert = typeof signals.$inferInsert;

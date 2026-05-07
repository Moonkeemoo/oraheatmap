/**
 * For a PATTERN-mode cell (slot × category × kind), return the top
 * whales who showed up in this slot ACROSS multiple cycles.
 *
 * Different from cell-stats which sums activity inside ONE window —
 * recurring counts how many distinct cycles each whale was active in,
 * surfacing "wallets that hit this slot like clockwork" rather than
 * "everyone who happened to trade here this lookback".
 *
 * kind:
 *   "hour-of-day" → cycle = 1 day, slot = (UTC hour / 2),
 *                   slotIdx 0..11 covers 0-1, 2-3, …, 22-23
 *   "day-of-week" → cycle = 1 ISO week, slot = ISO weekday,
 *                   slotIdx 0..6 maps Mon..Sun (matches the UI's
 *                   Mon-first display order)
 */

import type { Sql } from "postgres";

import { whaleAlias, whaleAliasInfo, whaleColor } from "./whale-display";

export type RecurringWhalesParams = {
  category: string;
  subcategory: string | null;
  conditionId: string | null;
  kind: "hour-of-day" | "day-of-week";
  slotIdx: number;
  lookbackDays: number;
};

export type RecurringWhalesResult = {
  whales: ReadonlyArray<{
    addr: string;
    alias: string;
    color: string;
    profileImage: string | null;
    cycleHits: number;
    lastSeen: string;
    avgVolume: number;
    totalVolume: number;
  }>;
  expectedCycles: number;
  lookbackDays: number;
  character: {
    buyVolume: number;
    sellVolume: number;
    buyShare: number;
    top1Share: number;
    top3Share: number;
    uniqueWhales: number;
    totalTrades: number;
    totalVolume: number;
  };
};

export async function fetchRecurringWhales(
  sql: Sql,
  params: RecurringWhalesParams,
): Promise<RecurringWhalesResult> {
  const { category: cat, subcategory: sub, conditionId: cid, kind, slotIdx, lookbackDays } = params;

  const scopeFilter = cid
    ? sql`condition_id = ${cid}`
    : sub
      ? sql`category = ${cat} AND subcategory = ${sub}`
      : sql`category = ${cat}`;
  const slotFilter =
    kind === "hour-of-day"
      ? sql`(EXTRACT(hour FROM ts AT TIME ZONE 'UTC')::int / 2) = ${slotIdx}`
      : // ISO dow: Mon=1..Sun=7. UI display is Mon-first 0..6, so
        // slotIdx 0→1, 1→2, …, 6→7. Translate inline.
        sql`EXTRACT(isodow FROM ts AT TIME ZONE 'UTC')::int = ${slotIdx + 1}`;
  const cycleExpr =
    kind === "hour-of-day"
      ? sql`DATE_TRUNC('day', ts AT TIME ZONE 'UTC')`
      : sql`DATE_TRUNC('week', ts AT TIME ZONE 'UTC')`;

  type WhaleRow = {
    whale_addr: string;
    cycle_hits: number | string;
    last_seen: string;
    avg_volume: number | string;
    total_volume: number | string;
  };
  const rows = await sql<WhaleRow[]>`
    WITH per_cycle AS (
      SELECT
        whale_addr,
        ${cycleExpr} AS cycle,
        COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)::numeric AS volume,
        MAX(ts) AS last_ts
      FROM signals
      WHERE ts >= NOW() - (${`${lookbackDays} days`}::interval)
        AND ts <= NOW()
        AND ${scopeFilter}
        AND ${slotFilter}
        AND whale_addr ~ '^0x[0-9a-f]{40}$'
      GROUP BY whale_addr, cycle
      HAVING COUNT(*) > 0
    )
    SELECT
      whale_addr,
      COUNT(*)::bigint                                AS cycle_hits,
      MAX(last_ts)                                    AS last_seen,
      AVG(volume)::numeric                            AS avg_volume,
      SUM(volume)::numeric                            AS total_volume
    FROM per_cycle
    GROUP BY whale_addr
    ORDER BY cycle_hits DESC, total_volume DESC
    LIMIT 5
  `;

  // Slot character — directional bias + whale concentration over the
  // same scope+slot window the recurring-whales query runs on. Three
  // analytical lenses surfaced together so the drawer tells a
  // behaviour story alongside the per-whale leaderboard:
  //   - Direction: BUY vs SELL volume split. 80%+ BUY = hard
  //     consensus; 50/50 = balanced flow.
  //   - Concentration: top-1 / top-3 whale share of total volume.
  //     A single whale at 80% means "this is HIS pattern", not a
  //     market-wide one — totally different read.
  //   - Total trades + unique whales let the UI render the
  //     denominator for sizing/concentration meters.
  type CharRow = {
    total_buy: number | string;
    total_sell: number | string;
    total_volume: number | string;
    top1_volume: number | string;
    top3_volume: number | string;
    unique_whales: number | string;
    total_trades: number | string;
  };
  const charRows = await sql<CharRow[]>`
    WITH per_whale AS (
      SELECT
        whale_addr,
        COALESCE(SUM(size * price) FILTER (WHERE side = 'BUY'), 0)::numeric  AS buy_vol,
        COALESCE(SUM(size * price) FILTER (WHERE side = 'SELL'), 0)::numeric AS sell_vol,
        COUNT(*)::bigint                                                       AS trades
      FROM signals
      WHERE ts >= NOW() - (${`${lookbackDays} days`}::interval)
        AND ts <= NOW()
        AND ${scopeFilter}
        AND ${slotFilter}
        AND whale_addr ~ '^0x[0-9a-f]{40}$'
      GROUP BY whale_addr
    ),
    ranked AS (
      SELECT
        whale_addr,
        buy_vol + sell_vol AS total_vol,
        buy_vol,
        sell_vol,
        trades,
        ROW_NUMBER() OVER (ORDER BY buy_vol + sell_vol DESC) AS rn
      FROM per_whale
    )
    SELECT
      COALESCE(SUM(buy_vol), 0)::numeric                                  AS total_buy,
      COALESCE(SUM(sell_vol), 0)::numeric                                 AS total_sell,
      COALESCE(SUM(total_vol), 0)::numeric                                AS total_volume,
      COALESCE(SUM(total_vol) FILTER (WHERE rn = 1), 0)::numeric          AS top1_volume,
      COALESCE(SUM(total_vol) FILTER (WHERE rn <= 3), 0)::numeric         AS top3_volume,
      COUNT(*)::bigint                                                     AS unique_whales,
      COALESCE(SUM(trades), 0)::bigint                                     AS total_trades
    FROM ranked
  `;
  const c = charRows[0];
  const totalVolume = Number(c?.total_volume ?? 0);
  const top1Share = totalVolume > 0 ? Number(c!.top1_volume) / totalVolume : 0;
  const top3Share = totalVolume > 0 ? Number(c!.top3_volume) / totalVolume : 0;
  const buyVolume = Number(c?.total_buy ?? 0);
  const sellVolume = Number(c?.total_sell ?? 0);
  const directionalVol = buyVolume + sellVolume;
  const buyShare = directionalVol > 0 ? buyVolume / directionalVol : 0;

  // Expected cycle count gives the UI a denominator for the "12 / 30
  // cycles" hit-rate display. Computed server-side so the client
  // doesn't have to reproduce the kind→cycle math.
  const expectedCycles =
    kind === "hour-of-day"
      ? lookbackDays
      : Math.max(1, Math.floor(lookbackDays / 7));

  return {
    whales: rows.map((w) => ({
      addr: w.whale_addr,
      alias: whaleAlias(w.whale_addr),
      color: whaleColor(w.whale_addr),
      profileImage: whaleAliasInfo(w.whale_addr)?.profileImage ?? null,
      cycleHits: Number(w.cycle_hits),
      lastSeen: typeof w.last_seen === "string"
        ? w.last_seen
        : (w.last_seen as unknown as Date).toISOString(),
      avgVolume: Number(w.avg_volume),
      totalVolume: Number(w.total_volume),
    })),
    expectedCycles,
    lookbackDays,
    character: {
      buyVolume,
      sellVolume,
      buyShare,
      top1Share,
      top3Share,
      uniqueWhales: Number(c?.unique_whales ?? 0),
      totalTrades: Number(c?.total_trades ?? 0),
      totalVolume,
    },
  };
}

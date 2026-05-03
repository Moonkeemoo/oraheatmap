import { describe, expect, test } from "bun:test";
import { assembleHeatmap, buildBuckets, RANGE_CONFIG } from "./heatmap-query";

describe("buildBuckets", () => {
  test("12 buckets aligned to 5-minute boundaries (1h)", () => {
    const now = new Date("2026-05-03T11:32:17Z");
    const buckets = buildBuckets(now, 5, 12);
    expect(buckets.length).toBe(12);
    expect(buckets[buckets.length - 1]?.ts).toBe("2026-05-03T11:30:00.000Z");
    expect(buckets[0]?.ts).toBe("2026-05-03T10:35:00.000Z");
  });

  test("24 buckets aligned to 1-hour boundaries (24h)", () => {
    const now = new Date("2026-05-03T11:32:17Z");
    const buckets = buildBuckets(now, 60, 24);
    expect(buckets.length).toBe(24);
    expect(buckets[buckets.length - 1]?.ts).toBe("2026-05-03T11:00:00.000Z");
  });

  test("7 buckets aligned to day boundaries (7d)", () => {
    const now = new Date("2026-05-03T11:32:17Z");
    const buckets = buildBuckets(now, 24 * 60, 7);
    expect(buckets.length).toBe(7);
    expect(buckets[buckets.length - 1]?.ts).toBe("2026-05-03T00:00:00.000Z");
    expect(buckets[0]?.ts).toBe("2026-04-27T00:00:00.000Z");
  });

  test("indices ascending 0..n-1", () => {
    const buckets = buildBuckets(new Date("2026-05-03T11:32:00Z"), 5, 12);
    expect(buckets.map((b) => b.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe("RANGE_CONFIG", () => {
  test("expected bucket / window / slot count for each range", () => {
    expect(RANGE_CONFIG["1h"]).toEqual({ bucketMinutes: 5, windowMinutes: 60, slots: 12 });
    expect(RANGE_CONFIG["24h"]).toEqual({ bucketMinutes: 60, windowMinutes: 1440, slots: 24 });
    expect(RANGE_CONFIG["7d"]).toEqual({ bucketMinutes: 1440, windowMinutes: 10080, slots: 7 });
    expect(RANGE_CONFIG["30d"]).toEqual({ bucketMinutes: 1440, windowMinutes: 43200, slots: 30 });
  });
});

describe("assembleHeatmap — metric aggregation", () => {
  const now = new Date("2026-05-03T11:32:00Z");
  const buckets = buildBuckets(now, 5, 12);
  const latestBucketTs = buckets[buckets.length - 1]!.ts;
  const oldestBucketTs = buckets[0]!.ts;

  test("empty rows → grid of zeros, totals zero, winRate null", () => {
    const out = assembleHeatmap([], [], buckets, "1h", now);
    expect(out.totals.signals).toBe(0);
    expect(out.totals.volume).toBe(0);
    expect(out.totals.pnl).toBe(0);
    expect(out.totals.winRate).toBeNull();
    expect(out.totals.topCategory).toBeNull();
    expect(out.cells.Sports.length).toBe(12);
    expect(out.cells.Sports.every((c) => c.count === 0 && c.winRate === null && c.trades.length === 0)).toBe(true);
  });

  test("places aggregate metrics in correct bucket index", () => {
    const out = assembleHeatmap(
      [
        {
          bucket: latestBucketTs,
          category: "Sports",
          signal_count: 5,
          buy_volume_usd: 250,
          realized_pnl_sum: 30,
          exit_count: 2,
          win_count: 1,
          unique_whales: 3,
        },
      ],
      [],
      buckets,
      "1h",
      now,
    );
    const cell = out.cells.Sports[11];
    expect(cell?.count).toBe(5);
    expect(cell?.volume).toBe(250);
    expect(cell?.pnl).toBe(30);
    expect(cell?.winRate).toBeCloseTo(0.5);
    expect(cell?.uniqueWhales).toBe(3);
    expect(out.totals.signals).toBe(5);
    expect(out.totals.volume).toBe(250);
    expect(out.totals.pnl).toBe(30);
    expect(out.totals.winRate).toBeCloseTo(0.5);
  });

  test("aggregates across cells; topCategory by signal count", () => {
    const out = assembleHeatmap(
      [
        {
          bucket: latestBucketTs, category: "Sports", signal_count: 5,
          buy_volume_usd: 200, realized_pnl_sum: 0, exit_count: 0, win_count: 0,
          unique_whales: 2,
        },
        {
          bucket: latestBucketTs, category: "Crypto", signal_count: 10,
          buy_volume_usd: 50, realized_pnl_sum: 0, exit_count: 0, win_count: 0,
          unique_whales: 4,
        },
        {
          bucket: oldestBucketTs, category: "Sports", signal_count: 3,
          buy_volume_usd: 30, realized_pnl_sum: 0, exit_count: 0, win_count: 0,
          unique_whales: 1,
        },
      ],
      [],
      buckets,
      "1h",
      now,
    );
    expect(out.totals.signals).toBe(18);
    expect(out.totals.volume).toBe(280);
    expect(out.totals.topCategory).toBe("Crypto");
    expect(out.cells.Sports[0]?.count).toBe(3);
    expect(out.cells.Sports[11]?.count).toBe(5);
    expect(out.cells.Crypto[11]?.count).toBe(10);
  });

  test("unknown category falls into Other", () => {
    const out = assembleHeatmap(
      [
        {
          bucket: latestBucketTs, category: "Madeup", signal_count: 7,
          buy_volume_usd: 99, realized_pnl_sum: 0, exit_count: 0, win_count: 0,
          unique_whales: 1,
        },
      ],
      [],
      buckets,
      "1h",
      now,
    );
    expect(out.cells.Other[11]?.count).toBe(7);
  });

  test("rows outside the window are silently dropped", () => {
    const out = assembleHeatmap(
      [
        {
          bucket: "1999-01-01T00:00:00.000Z", category: "Sports", signal_count: 99,
          buy_volume_usd: 999, realized_pnl_sum: 0, exit_count: 0, win_count: 0,
          unique_whales: 9,
        },
      ],
      [],
      buckets,
      "1h",
      now,
    );
    expect(out.totals.signals).toBe(0);
  });
});

describe("assembleHeatmap — trades", () => {
  const now = new Date("2026-05-03T11:32:00Z");
  const buckets = buildBuckets(now, 5, 12);
  const latestBucketTs = buckets[buckets.length - 1]!.ts;

  test("trades land in the correct cell with whaleAlias + whaleColor + sizeUsd", () => {
    const out = assembleHeatmap(
      [],
      [
        {
          bucket: latestBucketTs,
          category: "Sports",
          whale_addr: "0xadc2efbf97ce7b25f7a638aabdba196c657cd1c9",
          side: "BUY",
          size: 100,
          price: 0.45,
          realized_pnl: null,
          market_question: "Will Lakers win?",
        },
      ],
      buckets,
      "1h",
      now,
    );
    const trades = out.cells.Sports[11]?.trades ?? [];
    expect(trades.length).toBe(1);
    expect(trades[0]?.whaleAlias).toBe("0xadc2…cd1c9");
    expect(trades[0]?.whaleColor).toMatch(/^hsl\(\d+, 70%, 55%\)$/);
    expect(trades[0]?.sizeUsd).toBeCloseTo(45);
    expect(trades[0]?.realizedPnl).toBeNull();
    expect(trades[0]?.side).toBe("BUY");
    expect(trades[0]?.marketQuestion).toBe("Will Lakers win?");
  });

  test("multiple trades preserve the (already-sorted) input order", () => {
    const trades = [
      {
        bucket: latestBucketTs, category: "Crypto", whale_addr: "0xa".padEnd(42, "0"),
        side: "BUY" as const, size: 1000, price: 0.5, realized_pnl: null,
        market_question: "BTC > 100k?",
      },
      {
        bucket: latestBucketTs, category: "Crypto", whale_addr: "0xb".padEnd(42, "0"),
        side: "SELL" as const, size: 200, price: 0.6, realized_pnl: 20,
        market_question: "BTC > 100k?",
      },
    ];
    const out = assembleHeatmap([], trades, buckets, "1h", now);
    const cellTrades = out.cells.Crypto[11]?.trades ?? [];
    expect(cellTrades.length).toBe(2);
    expect(cellTrades[0]?.sizeUsd).toBeCloseTo(500);
    expect(cellTrades[1]?.realizedPnl).toBeCloseTo(20);
  });

  test("trade rows outside window are dropped", () => {
    const out = assembleHeatmap(
      [],
      [
        {
          bucket: "1999-01-01T00:00:00.000Z", category: "Sports",
          whale_addr: "0xa".padEnd(42, "0"), side: "BUY", size: 1, price: 1,
          realized_pnl: null, market_question: null,
        },
      ],
      buckets, "1h", now,
    );
    expect(out.cells.Sports[11]?.trades.length).toBe(0);
  });
});

describe("assembleHeatmap — winRate corner cases", () => {
  const now = new Date("2026-05-03T11:32:00Z");
  const buckets = buildBuckets(now, 5, 12);
  const latestBucketTs = buckets[buckets.length - 1]!.ts;

  test("cell with zero exits has winRate=null even with signals/volume", () => {
    const out = assembleHeatmap(
      [
        {
          bucket: latestBucketTs, category: "Sports", signal_count: 5,
          buy_volume_usd: 250, realized_pnl_sum: 0, exit_count: 0, win_count: 0,
          unique_whales: 2,
        },
      ],
      [], buckets, "1h", now,
    );
    expect(out.cells.Sports[11]?.winRate).toBeNull();
  });

  test("totals.winRate aggregates across cells", () => {
    const out = assembleHeatmap(
      [
        {
          bucket: latestBucketTs, category: "Sports", signal_count: 1,
          buy_volume_usd: 0, realized_pnl_sum: 50, exit_count: 4, win_count: 3,
          unique_whales: 1,
        },
        {
          bucket: latestBucketTs, category: "Crypto", signal_count: 1,
          buy_volume_usd: 0, realized_pnl_sum: -10, exit_count: 6, win_count: 1,
          unique_whales: 1,
        },
      ],
      [], buckets, "1h", now,
    );
    // 3 + 1 = 4 wins, 4 + 6 = 10 exits → 0.4
    expect(out.totals.winRate).toBeCloseTo(0.4);
  });
});

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

  test("12 buckets aligned to day boundaries (12d)", () => {
    const now = new Date("2026-05-03T11:32:17Z");
    const buckets = buildBuckets(now, 24 * 60, 12);
    expect(buckets.length).toBe(12);
    expect(buckets[buckets.length - 1]?.ts).toBe("2026-05-03T00:00:00.000Z");
    // 12 days back from 03 May = 22 Apr
    expect(buckets[0]?.ts).toBe("2026-04-22T00:00:00.000Z");
  });

  test("12 buckets aligned to week boundaries (12w)", () => {
    const now = new Date("2026-05-03T11:32:17Z");
    const buckets = buildBuckets(now, 7 * 24 * 60, 12);
    expect(buckets.length).toBe(12);
    // Each bucket = 1 week; 12 weeks = 84 days
    const expectedStart = new Date(buckets[buckets.length - 1]!.ts).getTime() - 11 * 7 * 24 * 3_600_000;
    expect(new Date(buckets[0]!.ts).getTime()).toBe(expectedStart);
  });

  test("indices ascending 0..n-1", () => {
    const buckets = buildBuckets(new Date("2026-05-03T11:32:00Z"), 5, 12);
    expect(buckets.map((b) => b.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe("RANGE_CONFIG", () => {
  test("every range is exactly 12 buckets", () => {
    for (const r of ["1h", "24h", "12d", "12w"] as const) {
      expect(RANGE_CONFIG[r].slots).toBe(12);
      expect(RANGE_CONFIG[r].bucketMinutes * 12).toBe(RANGE_CONFIG[r].windowMinutes);
    }
  });
  test("bucket sizes scale per range", () => {
    expect(RANGE_CONFIG["1h"].bucketMinutes).toBe(5);            // 5 min
    expect(RANGE_CONFIG["24h"].bucketMinutes).toBe(120);         // 2 h
    expect(RANGE_CONFIG["12d"].bucketMinutes).toBe(1440);        // 1 d
    expect(RANGE_CONFIG["12w"].bucketMinutes).toBe(7 * 1440);    // 1 wk
  });
  test("source is raw for 1h, hourly_agg otherwise", () => {
    expect(RANGE_CONFIG["1h"].source).toBe("raw");
    expect(RANGE_CONFIG["24h"].source).toBe("hourly_agg");
    expect(RANGE_CONFIG["12d"].source).toBe("hourly_agg");
    expect(RANGE_CONFIG["12w"].source).toBe("hourly_agg");
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
    expect(out.cells.Sports!.length).toBe(12);
    expect(out.cells.Sports!.every((c) => c.count === 0 && c.winRate === null && c.markets.length === 0)).toBe(true);
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
          win_count: 1,
          loss_count: 1,
          unique_whales: 3,
        },
      ],
      [],
      buckets,
      "1h",
      now,
    );
    const cell = out.cells.Sports![11];
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
          buy_volume_usd: 200, realized_pnl_sum: 0, win_count: 0, loss_count: 0,
          unique_whales: 2,
        },
        {
          bucket: latestBucketTs, category: "Crypto", signal_count: 10,
          buy_volume_usd: 50, realized_pnl_sum: 0, win_count: 0, loss_count: 0,
          unique_whales: 4,
        },
        {
          bucket: oldestBucketTs, category: "Sports", signal_count: 3,
          buy_volume_usd: 30, realized_pnl_sum: 0, win_count: 0, loss_count: 0,
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
    expect(out.cells.Sports![0]?.count).toBe(3);
    expect(out.cells.Sports![11]?.count).toBe(5);
    expect(out.cells.Crypto![11]?.count).toBe(10);
  });

  test("unknown category falls into Other", () => {
    const out = assembleHeatmap(
      [
        {
          bucket: latestBucketTs, category: "Madeup", signal_count: 7,
          buy_volume_usd: 99, realized_pnl_sum: 0, win_count: 0, loss_count: 0,
          unique_whales: 1,
        },
      ],
      [],
      buckets,
      "1h",
      now,
    );
    expect(out.cells.Other![11]?.count).toBe(7);
  });

  test("rows outside the window are silently dropped", () => {
    const out = assembleHeatmap(
      [
        {
          bucket: "1999-01-01T00:00:00.000Z", category: "Sports", signal_count: 99,
          buy_volume_usd: 999, realized_pnl_sum: 0, win_count: 0, loss_count: 0,
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

describe("assembleHeatmap — markets", () => {
  const now = new Date("2026-05-03T11:32:00Z");
  const buckets = buildBuckets(now, 5, 12);
  const latestBucketTs = buckets[buckets.length - 1]!.ts;

  test("market rows land in the correct cell with all metric fields populated", () => {
    const out = assembleHeatmap(
      [],
      [
        {
          bucket: latestBucketTs,
          category: "Sports",
          condition_id: "0xcond1",
          market_question: "Will Lakers win?", market_slug: null,
          signals: 12,
          volume_usd: 4500,
          pnl_usd: 150,
          win_count: 3,
          loss_count: 1,
          unique_whales: 4,
          market_icon: null,
        },
      ],
      buckets,
      "1h",
      now,
    );
    const markets = out.cells.Sports![11]?.markets ?? [];
    expect(markets.length).toBe(1);
    expect(markets[0]?.conditionId).toBe("0xcond1");
    expect(markets[0]?.marketQuestion).toBe("Will Lakers win?");
    expect(markets[0]?.count).toBe(12);
    expect(markets[0]?.volume).toBeCloseTo(4500);
    expect(markets[0]?.pnl).toBeCloseTo(150);
    expect(markets[0]?.winRate).toBeCloseTo(0.75); // 3/(3+1)
  });

  test("multiple markets preserve server-side ordering", () => {
    const markets = [
      {
        bucket: latestBucketTs, category: "Crypto", condition_id: "0xa",
        market_question: "BTC > 100k?", market_slug: null, market_icon: null, signals: 50, volume_usd: 1000, pnl_usd: 0,
        win_count: 0, loss_count: 0, unique_whales: 0,
      },
      {
        bucket: latestBucketTs, category: "Crypto", condition_id: "0xb",
        market_question: "ETH > 5k?", market_slug: null, market_icon: null, signals: 30, volume_usd: 800, pnl_usd: 25,
        win_count: 2, loss_count: 1, unique_whales: 5,
      },
    ];
    const out = assembleHeatmap([], markets, buckets, "1h", now);
    const cellMarkets = out.cells.Crypto![11]?.markets ?? [];
    expect(cellMarkets.length).toBe(2);
    expect(cellMarkets[0]?.conditionId).toBe("0xa");
    expect(cellMarkets[1]?.conditionId).toBe("0xb");
    expect(cellMarkets[1]?.winRate).toBeCloseTo(2 / 3);
  });

  test("market with no decided exits → winRate null", () => {
    const out = assembleHeatmap(
      [],
      [
        {
          bucket: latestBucketTs, category: "Sports", condition_id: "0xc",
          market_question: "Q?", market_slug: null, signals: 5, volume_usd: 100, pnl_usd: 0,
          win_count: 0, loss_count: 0, unique_whales: 0, market_icon: null,
        },
      ],
      buckets, "1h", now,
    );
    expect(out.cells.Sports![11]?.markets[0]?.winRate).toBeNull();
  });

  test("market rows outside window are dropped", () => {
    const out = assembleHeatmap(
      [],
      [
        {
          bucket: "1999-01-01T00:00:00.000Z", category: "Sports", condition_id: "0xz",
          market_question: null, market_slug: null, signals: 9, volume_usd: 0, pnl_usd: null,
          win_count: 0, loss_count: 0, unique_whales: 0, market_icon: null,
        },
      ],
      buckets, "1h", now,
    );
    expect(out.cells.Sports![11]?.markets.length).toBe(0);
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
          buy_volume_usd: 250, realized_pnl_sum: 0, win_count: 0, loss_count: 0,
          unique_whales: 2,
        },
      ],
      [], buckets, "1h", now,
    );
    expect(out.cells.Sports![11]?.winRate).toBeNull();
  });

  test("totals.winRate aggregates across cells", () => {
    const out = assembleHeatmap(
      [
        {
          bucket: latestBucketTs, category: "Sports", signal_count: 1,
          buy_volume_usd: 0, realized_pnl_sum: 50, win_count: 3, loss_count: 1,
          unique_whales: 1,
        },
        {
          bucket: latestBucketTs, category: "Crypto", signal_count: 1,
          buy_volume_usd: 0, realized_pnl_sum: -10, win_count: 1, loss_count: 5,
          unique_whales: 1,
        },
      ],
      [], buckets, "1h", now,
    );
    // 3 + 1 = 4 wins, 4 + 6 = 10 exits → 0.4
    expect(out.totals.winRate).toBeCloseTo(0.4);
  });
});

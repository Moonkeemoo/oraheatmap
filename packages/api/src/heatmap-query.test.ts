import { describe, expect, test } from "bun:test";
import { assembleHeatmap, buildBuckets } from "./heatmap-query";

describe("buildBuckets", () => {
  test("12 buckets aligned to 5-minute boundaries", () => {
    const now = new Date("2026-05-03T11:32:17Z"); // mid-bucket
    const buckets = buildBuckets(now, 5, 60);
    expect(buckets.length).toBe(12);
    // Latest bucket = floor(11:32:17 / 5min) = 11:30
    expect(buckets[buckets.length - 1]?.ts).toBe("2026-05-03T11:30:00.000Z");
    // Oldest bucket = 11:30 - 11*5min = 10:35
    expect(buckets[0]?.ts).toBe("2026-05-03T10:35:00.000Z");
  });

  test("indices are 0..n-1 ascending", () => {
    const buckets = buildBuckets(new Date("2026-05-03T11:32:00Z"), 5, 60);
    expect(buckets.map((b) => b.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  test("exact bucket boundary (11:30:00) → latest bucket is 11:30", () => {
    const buckets = buildBuckets(new Date("2026-05-03T11:30:00Z"), 5, 60);
    expect(buckets[buckets.length - 1]?.ts).toBe("2026-05-03T11:30:00.000Z");
  });
});

describe("assembleHeatmap", () => {
  const now = new Date("2026-05-03T11:32:00Z");
  const buckets = buildBuckets(now, 5, 60);
  const latestBucketTs = buckets[buckets.length - 1]!.ts;

  test("empty rows → grid of zeros, totals zero", () => {
    const out = assembleHeatmap([], buckets, 5, 60, now);
    expect(out.totals).toEqual({
      signals: 0,
      volume: 0,
      uniqueWhales: 0,
      topCategory: null,
      topWhale: null,
    });
    expect(out.cells.Sports.length).toBe(12);
    expect(out.cells.Sports.every((c) => c.count === 0 && c.volume === 0)).toBe(true);
  });

  test("places a row in the correct bucket index", () => {
    const out = assembleHeatmap(
      [{ bucket: latestBucketTs, category: "Sports", signal_count: 5, total_volume: 250, unique_whales: 3 }],
      buckets,
      5,
      60,
      now,
    );
    const sportsRow = out.cells.Sports;
    expect(sportsRow[11]).toEqual({ count: 5, volume: 250, uniqueWhales: 3 });
    expect(sportsRow[10]).toEqual({ count: 0, volume: 0, uniqueWhales: 0 });
    expect(out.totals.signals).toBe(5);
    expect(out.totals.volume).toBe(250);
    expect(out.totals.topCategory).toBe("Sports");
  });

  test("aggregates across categories and buckets, picks top by signal count", () => {
    const out = assembleHeatmap(
      [
        { bucket: latestBucketTs, category: "Sports", signal_count: 5, total_volume: 200, unique_whales: 2 },
        { bucket: latestBucketTs, category: "Crypto", signal_count: 10, total_volume: 50, unique_whales: 4 },
        { bucket: buckets[0]!.ts, category: "Sports", signal_count: 3, total_volume: 30, unique_whales: 1 },
      ],
      buckets,
      5,
      60,
      now,
    );
    expect(out.totals.signals).toBe(18);
    expect(out.totals.volume).toBe(280);
    // Crypto has 10 signals vs Sports' 8 → Crypto wins top
    expect(out.totals.topCategory).toBe("Crypto");
    expect(out.cells.Sports[0]?.count).toBe(3);
    expect(out.cells.Sports[11]?.count).toBe(5);
    expect(out.cells.Crypto[11]?.count).toBe(10);
  });

  test("unknown category falls into Other bucket", () => {
    const out = assembleHeatmap(
      [{ bucket: latestBucketTs, category: "Madeupgenre", signal_count: 7, total_volume: 99, unique_whales: 1 }],
      buckets,
      5,
      60,
      now,
    );
    expect(out.cells.Other[11]?.count).toBe(7);
  });

  test("rows outside the window are dropped silently", () => {
    const out = assembleHeatmap(
      [{ bucket: "1999-01-01T00:00:00.000Z", category: "Sports", signal_count: 99, total_volume: 999, unique_whales: 9 }],
      buckets,
      5,
      60,
      now,
    );
    expect(out.totals.signals).toBe(0);
  });

  test("response shape carries window metadata", () => {
    const out = assembleHeatmap([], buckets, 5, 60, now);
    expect(out.windowMinutes).toBe(60);
    expect(out.bucketMinutes).toBe(5);
    expect(out.windowEnd).toBe(latestBucketTs);
    expect(out.windowStart).toBe(buckets[0]!.ts);
    expect(out.categories.length).toBe(9);
  });
});

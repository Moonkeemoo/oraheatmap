import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import type { Db } from "./db";
import { createPositionTracker, type PositionTracker } from "./position-tracker";

// Stub Db that no-ops everything — lets us exercise applyTrade / settle / get
// without a live PG. hydrate / flush / stop are exercised in their own tests
// via a slightly richer fake.
const noopDb = {
  insert() {
    return { values: () => ({ onConflictDoUpdate: async () => undefined }) };
  },
  delete() {
    return { where: async () => undefined };
  },
  select() {
    return { from: async () => [] };
  },
} as unknown as Db;

describe("position-tracker — applyTrade", () => {
  let pt: PositionTracker;
  beforeEach(() => {
    pt = createPositionTracker({ db: noopDb, flushIntervalMs: 60_000 });
  });
  afterEach(async () => {
    await pt.stop();
  });

  const baseBuy = {
    whaleAddr: "0xa",
    assetId: "asset-1",
    side: "BUY" as const,
    price: 0.4,
    size: 100,
    ts: new Date("2026-05-03T11:00:00Z"),
  };

  test("first BUY opens a position; no PnL yet", () => {
    const r = pt.applyTrade(baseBuy);
    expect(r).toEqual({ realizedPnl: null, exitKind: null });
    const p = pt.get("0xa", "asset-1");
    expect(p?.netShares).toBe(100);
    expect(p?.avgEntryPrice).toBeCloseTo(0.4);
    expect(p?.totalCostUsd).toBeCloseTo(40);
  });

  test("second BUY at different price weighted-averages the entry", () => {
    pt.applyTrade(baseBuy); // 100 @ 0.4
    pt.applyTrade({ ...baseBuy, price: 0.6, size: 100, ts: new Date("2026-05-03T11:01:00Z") }); // 100 @ 0.6
    const p = pt.get("0xa", "asset-1");
    expect(p?.netShares).toBe(200);
    expect(p?.totalCostUsd).toBeCloseTo(100); // 40 + 60
    expect(p?.avgEntryPrice).toBeCloseTo(0.5); // 100/200
  });

  test("partial SELL realizes PnL based on avg entry; remainder keeps avg entry", () => {
    pt.applyTrade(baseBuy); // 100 @ 0.4
    const r = pt.applyTrade({
      ...baseBuy,
      side: "SELL",
      price: 0.7,
      size: 30,
      ts: new Date("2026-05-03T11:02:00Z"),
    });
    // realized = (0.7 - 0.4) * 30 = 9
    expect(r.exitKind).toBe("SELL");
    expect(r.realizedPnl).toBeCloseTo(9);
    const p = pt.get("0xa", "asset-1");
    expect(p?.netShares).toBe(70);
    expect(p?.avgEntryPrice).toBeCloseTo(0.4); // unchanged
    expect(p?.totalCostUsd).toBeCloseTo(28); // 70 * 0.4
  });

  test("SELL exact size closes the position", () => {
    pt.applyTrade(baseBuy); // 100 @ 0.4
    const r = pt.applyTrade({
      ...baseBuy,
      side: "SELL",
      price: 0.55,
      size: 100,
      ts: new Date("2026-05-03T11:02:00Z"),
    });
    expect(r.realizedPnl).toBeCloseTo(15); // (0.55 - 0.4) * 100
    expect(pt.get("0xa", "asset-1")).toBeUndefined();
    expect(pt.size()).toBe(0);
  });

  test("SELL larger than position caps at known shares; oversold portion is silently dropped", () => {
    pt.applyTrade(baseBuy); // 100 @ 0.4
    const r = pt.applyTrade({
      ...baseBuy,
      side: "SELL",
      price: 0.5,
      size: 250, // overshoot by 150
      ts: new Date("2026-05-03T11:02:00Z"),
    });
    // PnL on the 100 we knew about: (0.5 - 0.4) * 100 = 10
    expect(r.realizedPnl).toBeCloseTo(10);
    expect(pt.get("0xa", "asset-1")).toBeUndefined();
  });

  test("SELL with no prior position → realizedPnl null, exit_kind 'SELL'", () => {
    const r = pt.applyTrade({
      ...baseBuy,
      side: "SELL",
      price: 0.5,
      size: 50,
    });
    expect(r).toEqual({ realizedPnl: null, exitKind: "SELL" });
    expect(pt.size()).toBe(0);
  });

  test("loss case: SELL at price below avg entry yields negative PnL", () => {
    pt.applyTrade(baseBuy); // 100 @ 0.4
    const r = pt.applyTrade({
      ...baseBuy,
      side: "SELL",
      price: 0.25,
      size: 100,
      ts: new Date("2026-05-03T11:02:00Z"),
    });
    expect(r.realizedPnl).toBeCloseTo(-15); // (0.25 - 0.4) * 100
  });

  test("positions for different (whale, asset) pairs are independent", () => {
    pt.applyTrade({ ...baseBuy, whaleAddr: "0xa", assetId: "asset-1" });
    pt.applyTrade({ ...baseBuy, whaleAddr: "0xa", assetId: "asset-2", price: 0.6 });
    pt.applyTrade({ ...baseBuy, whaleAddr: "0xb", assetId: "asset-1", price: 0.8 });
    expect(pt.size()).toBe(3);
    expect(pt.get("0xa", "asset-1")?.avgEntryPrice).toBeCloseTo(0.4);
    expect(pt.get("0xa", "asset-2")?.avgEntryPrice).toBeCloseTo(0.6);
    expect(pt.get("0xb", "asset-1")?.avgEntryPrice).toBeCloseTo(0.8);
  });

  test("re-opening: SELL closes position, follow-up BUY starts fresh", () => {
    pt.applyTrade(baseBuy); // 100 @ 0.4
    pt.applyTrade({ ...baseBuy, side: "SELL", price: 0.5, size: 100 });
    expect(pt.size()).toBe(0);
    pt.applyTrade({ ...baseBuy, price: 0.7, size: 50 });
    const p = pt.get("0xa", "asset-1");
    expect(p?.netShares).toBe(50);
    expect(p?.avgEntryPrice).toBeCloseTo(0.7);
  });
});

describe("position-tracker — settle", () => {
  let pt: PositionTracker;
  beforeEach(() => {
    pt = createPositionTracker({ db: noopDb, flushIntervalMs: 60_000 });
  });
  afterEach(async () => {
    await pt.stop();
  });

  test("settling winner asset pays $1/share; closes all matching positions", () => {
    // Two whales hold the YES outcome
    pt.applyTrade({ whaleAddr: "0xa", assetId: "yes", side: "BUY", price: 0.3, size: 100, ts: new Date() });
    pt.applyTrade({ whaleAddr: "0xb", assetId: "yes", side: "BUY", price: 0.5, size: 200, ts: new Date() });
    // One whale holds NO
    pt.applyTrade({ whaleAddr: "0xc", assetId: "no", side: "BUY", price: 0.7, size: 50, ts: new Date() });

    const settlements = pt.settle({
      assetId: "yes",
      payoutPerShare: 1.0,
      resolutionTs: new Date("2026-05-03T12:00:00Z"),
    });

    expect(settlements.length).toBe(2);
    const aSettle = settlements.find((s) => s.whaleAddr === "0xa");
    const bSettle = settlements.find((s) => s.whaleAddr === "0xb");
    expect(aSettle?.realizedPnl).toBeCloseTo(70); // (1 - 0.3) * 100
    expect(bSettle?.realizedPnl).toBeCloseTo(100); // (1 - 0.5) * 200

    // YES positions closed; NO position untouched
    expect(pt.get("0xa", "yes")).toBeUndefined();
    expect(pt.get("0xb", "yes")).toBeUndefined();
    expect(pt.get("0xc", "no")).toBeDefined();
  });

  test("settling loser asset pays $0/share; PnL = -avg_entry * shares", () => {
    pt.applyTrade({ whaleAddr: "0xa", assetId: "no", side: "BUY", price: 0.4, size: 100, ts: new Date() });
    const settlements = pt.settle({
      assetId: "no",
      payoutPerShare: 0,
      resolutionTs: new Date(),
    });
    expect(settlements[0]?.realizedPnl).toBeCloseTo(-40); // (0 - 0.4) * 100
    expect(pt.get("0xa", "no")).toBeUndefined();
  });

  test("settling an asset with no open positions is a no-op", () => {
    const settlements = pt.settle({
      assetId: "phantom",
      payoutPerShare: 1,
      resolutionTs: new Date(),
    });
    expect(settlements).toEqual([]);
  });
});

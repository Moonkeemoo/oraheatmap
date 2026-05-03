import { describe, expect, test } from "bun:test";

import { buildSettlementSignals, createResolutionWatcher } from "./resolution-watcher";

describe("buildSettlementSignals", () => {
  test("maps tracker settlements to Signal rows with side='SETTLEMENT' and exit_kind='RESOLUTION'", () => {
    const out = buildSettlementSignals({
      conditionId: "0xcond",
      marketQuestion: "Will X happen?",
      category: "Crypto",
      settlements: [
        {
          ts: new Date("2026-05-03T12:00:00Z"),
          whaleAddr: "0xa",
          assetId: "asset-yes",
          size: 100,
          price: 1.0,
          realizedPnl: 70,
        },
        {
          ts: new Date("2026-05-03T12:00:00Z"),
          whaleAddr: "0xb",
          assetId: "asset-yes",
          size: 50,
          price: 1.0,
          realizedPnl: 25,
        },
      ],
    });
    expect(out.length).toBe(2);
    expect(out[0]).toMatchObject({
      side: "SETTLEMENT",
      exitKind: "RESOLUTION",
      conditionId: "0xcond",
      marketQuestion: "Will X happen?",
      category: "Crypto",
      whaleAddr: "0xa",
      assetId: "asset-yes",
      price: 1.0,
      size: 100,
      realizedPnl: 70,
      txHash: null,
    });
    expect(out[1]?.whaleAddr).toBe("0xb");
  });

  test("returns empty list when no settlements", () => {
    expect(
      buildSettlementSignals({
        conditionId: "0xc",
        marketQuestion: null,
        category: "Other",
        settlements: [],
      }),
    ).toEqual([]);
  });
});

// ─── pollOnce wiring tests with full mocks ───
type MockTracker = {
  settle: (input: { assetId: string; payoutPerShare: number; resolutionTs: Date }) => Array<{
    ts: Date;
    whaleAddr: string;
    assetId: string;
    size: number;
    price: number;
    realizedPnl: number;
  }>;
};

import type { FetchLike } from "./gamma-cache";

function makeFetchMock(payload: unknown): FetchLike & { callCount(): number; lastUrl(): string | undefined } {
  let calls = 0;
  let lastUrl: string | undefined;
  const fn: FetchLike = async (input) => {
    calls += 1;
    lastUrl = String(input);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return Object.assign(fn, {
    callCount: () => calls,
    lastUrl: () => lastUrl,
  });
}

function makeStubDb(opts: {
  alreadyProcessed?: Set<string>;
}): { db: any; insertedConditionIds: string[] } {
  const inserted: string[] = [];
  const already = opts.alreadyProcessed ?? new Set<string>();
  const db = {
    insert: () => ({
      values: (rows: { conditionId: string }) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (already.has(rows.conditionId)) return [];
            inserted.push(rows.conditionId);
            already.add(rows.conditionId);
            return [{ conditionId: rows.conditionId }];
          },
        }),
      }),
    }),
  };
  return { db, insertedConditionIds: inserted };
}

function makeStubHub(): { hub: any; broadcasts: unknown[] } {
  const broadcasts: unknown[] = [];
  return {
    hub: {
      broadcast: (s: unknown) => broadcasts.push(s),
      subscribe: () => () => {},
      size: () => 0,
    },
    broadcasts,
  };
}

function makeStubTracker(
  byAssetId: Record<string, Array<{ whaleAddr: string; size: number; avgEntry: number }>>,
): { tracker: MockTracker; settleCalls: Array<{ assetId: string; payoutPerShare: number }> } {
  const calls: Array<{ assetId: string; payoutPerShare: number }> = [];
  const tracker: MockTracker = {
    settle: ({ assetId, payoutPerShare, resolutionTs }) => {
      calls.push({ assetId, payoutPerShare });
      const positions = byAssetId[assetId] ?? [];
      delete byAssetId[assetId];
      return positions.map((p) => ({
        ts: resolutionTs,
        whaleAddr: p.whaleAddr,
        assetId,
        size: p.size,
        price: payoutPerShare,
        realizedPnl: (payoutPerShare - p.avgEntry) * p.size,
      }));
    },
  };
  return { tracker, settleCalls: calls };
}

describe("resolution-watcher.pollOnce", () => {
  test("happy path: settles a freshly-resolved market and broadcasts settlement signals", async () => {
    const fetchMock = makeFetchMock([
      {
        id: "1",
        conditionId: "0xcond1",
        question: "Will Lakers win?",
        endDate: "2026-05-03T12:00:00Z",
        clobTokenIds: '["asset-yes","asset-no"]',
        outcomePrices: '["1","0"]',
        tags: [{ id: "1", label: "Sports", slug: "sports" }],
        closed: true,
      },
    ]);
    const { db, insertedConditionIds } = makeStubDb({});
    const { hub, broadcasts } = makeStubHub();
    const { tracker, settleCalls } = makeStubTracker({
      "asset-yes": [{ whaleAddr: "0xa", size: 100, avgEntry: 0.4 }],
    });

    const w = createResolutionWatcher({
      db,
      baseUrl: "https://gamma.test",
      pollIntervalMs: 60_000,
      positions: tracker as any,
      hub,
      fetchImpl: fetchMock,
    });

    const result = await w.pollOnce();

    expect(result).toEqual({ fetched: 1, processed: 1, settlementCount: 1 });
    expect(insertedConditionIds).toEqual(["0xcond1"]);
    expect(settleCalls.length).toBe(2); // attempted both YES and NO assets
    expect(broadcasts.length).toBe(1);
    expect(broadcasts[0]).toMatchObject({
      side: "SETTLEMENT",
      exitKind: "RESOLUTION",
      whaleAddr: "0xa",
      assetId: "asset-yes",
      conditionId: "0xcond1",
      category: "Sports",
      realizedPnl: 60, // (1 - 0.4) * 100
    });
    expect(fetchMock.lastUrl()).toContain("closed=true");
    expect(fetchMock.lastUrl()).toContain("include_tag=true");
  });

  test("dedupe: market already in processed_resolutions is skipped", async () => {
    const fetchMock = makeFetchMock([
      {
        id: "1",
        conditionId: "0xcond1",
        clobTokenIds: '["yes","no"]',
        outcomePrices: '["1","0"]',
        tags: [],
      },
    ]);
    const alreadyProcessed = new Set(["0xcond1"]);
    const { db } = makeStubDb({ alreadyProcessed });
    const { hub, broadcasts } = makeStubHub();
    const { tracker, settleCalls } = makeStubTracker({
      yes: [{ whaleAddr: "0xa", size: 100, avgEntry: 0.4 }],
    });

    const w = createResolutionWatcher({
      db, baseUrl: "https://gamma.test", pollIntervalMs: 60_000,
      positions: tracker as any, hub, fetchImpl: fetchMock,
    });
    const result = await w.pollOnce();
    expect(result.processed).toBe(0);
    expect(settleCalls.length).toBe(0);
    expect(broadcasts.length).toBe(0);
  });

  test("loser asset (price=0) → settlement with negative PnL", async () => {
    const fetchMock = makeFetchMock([
      {
        id: "1",
        conditionId: "0xcond1",
        clobTokenIds: '["winner","loser"]',
        outcomePrices: '["1","0"]',
        tags: [],
      },
    ]);
    const { db } = makeStubDb({});
    const { hub, broadcasts } = makeStubHub();
    const { tracker } = makeStubTracker({
      loser: [{ whaleAddr: "0xa", size: 100, avgEntry: 0.4 }],
    });

    const w = createResolutionWatcher({
      db, baseUrl: "https://gamma.test", pollIntervalMs: 60_000,
      positions: tracker as any, hub, fetchImpl: fetchMock,
    });
    await w.pollOnce();
    expect(broadcasts.length).toBe(1);
    expect((broadcasts[0] as any).realizedPnl).toBe(-40); // (0 - 0.4) * 100
    expect((broadcasts[0] as any).price).toBe(0);
  });

  test("malformed payload (token/price length mismatch) marks processed but emits nothing", async () => {
    const fetchMock = makeFetchMock([
      {
        id: "1",
        conditionId: "0xcond1",
        clobTokenIds: '["yes","no"]',
        outcomePrices: '["1"]', // mismatched
        tags: [],
      },
    ]);
    const { db, insertedConditionIds } = makeStubDb({});
    const { hub, broadcasts } = makeStubHub();
    const { tracker } = makeStubTracker({});
    const w = createResolutionWatcher({
      db, baseUrl: "https://gamma.test", pollIntervalMs: 60_000,
      positions: tracker as any, hub, fetchImpl: fetchMock,
    });
    const result = await w.pollOnce();
    expect(result.processed).toBe(1);
    expect(insertedConditionIds).toEqual(["0xcond1"]);
    expect(broadcasts.length).toBe(0);
  });

  test("non-array Gamma response is handled gracefully (no throw)", async () => {
    const fetchMock = makeFetchMock({ error: "oops" });
    const { db } = makeStubDb({});
    const { hub } = makeStubHub();
    const { tracker } = makeStubTracker({});
    const w = createResolutionWatcher({
      db, baseUrl: "https://gamma.test", pollIntervalMs: 60_000,
      positions: tracker as any, hub, fetchImpl: fetchMock,
    });
    const result = await w.pollOnce();
    expect(result).toEqual({ fetched: 0, processed: 0, settlementCount: 0 });
  });

  test("market without conditionId is skipped", async () => {
    const fetchMock = makeFetchMock([{ id: "1", clobTokenIds: '["yes"]', outcomePrices: '["1"]' }]);
    const { db, insertedConditionIds } = makeStubDb({});
    const { hub } = makeStubHub();
    const { tracker } = makeStubTracker({});
    const w = createResolutionWatcher({
      db, baseUrl: "https://gamma.test", pollIntervalMs: 60_000,
      positions: tracker as any, hub, fetchImpl: fetchMock,
    });
    const result = await w.pollOnce();
    expect(result.processed).toBe(0);
    expect(insertedConditionIds).toEqual([]);
  });
});

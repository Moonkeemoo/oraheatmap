import { describe, expect, test } from "bun:test";
import { createGammaCache, type FetchLike } from "./gamma-cache";

function mockFetch(payloads: Array<unknown | "404" | "throw">): {
  fetch: FetchLike;
  callCount: () => number;
  lastUrl: () => string | undefined;
} {
  let calls = 0;
  let lastUrl: string | undefined;
  const fn: FetchLike = async (input) => {
    lastUrl = String(input);
    const i = calls++;
    const payload = payloads[i] ?? payloads[payloads.length - 1];
    if (payload === "404") return new Response("not found", { status: 404 });
    if (payload === "throw") throw new Error("network blew up");
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetch: fn, callCount: () => calls, lastUrl: () => lastUrl };
}

describe("gamma-cache", () => {
  test("fetches and parses Gamma market (incl. JSON-string outcomes — SIG-3)", async () => {
    const m = mockFetch([[
      {
        question: "Will X happen?",
        endDate: "2026-12-31",
        active: true,
        acceptingOrders: true,
        closed: false,
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.65","0.35"]',
        tags: [{ id: "2", label: "Politics", slug: "politics" }],
      },
    ]]);
    const cache = createGammaCache({ baseUrl: "https://gamma.test", ttlMs: 30_000, fetchImpl: m.fetch });

    const got = await cache.enrich("asset-1");
    expect(got).not.toBeNull();
    expect(got?.question).toBe("Will X happen?");
    expect(got?.category).toBe("Politics");
    expect(got?.active).toBe(true);
    expect(got?.outcomes).toEqual(["Yes", "No"]);
    expect(got?.outcomePrices).toEqual([0.65, 0.35]);
    expect(m.lastUrl()).toContain("/markets?clob_token_ids=asset-1");
  });

  test("caches within TTL — second call does not re-fetch", async () => {
    const m = mockFetch([[{ question: "Q", tags: [{ id: "1", label: "Sports", slug: "sports" }] }]]);
    const cache = createGammaCache({ baseUrl: "https://gamma.test", ttlMs: 30_000, fetchImpl: m.fetch });

    await cache.enrich("asset-1");
    await cache.enrich("asset-1");
    expect(m.callCount()).toBe(1);
  });

  test("re-fetches after TTL expires", async () => {
    const m = mockFetch([
      [{ question: "Q1", tags: [] }],
      [{ question: "Q2", tags: [] }],
    ]);
    const cache = createGammaCache({ baseUrl: "https://gamma.test", ttlMs: 1, fetchImpl: m.fetch });

    await cache.enrich("asset-1");
    await new Promise((r) => setTimeout(r, 5));
    const second = await cache.enrich("asset-1");
    expect(m.callCount()).toBe(2);
    expect(second?.question).toBe("Q2");
  });

  test("returns null and caches the miss when API returns []", async () => {
    const m = mockFetch([[]]);
    const cache = createGammaCache({ baseUrl: "https://gamma.test", ttlMs: 30_000, fetchImpl: m.fetch });

    const got = await cache.enrich("missing");
    expect(got).toBeNull();
    await cache.enrich("missing");
    expect(m.callCount()).toBe(1);
  });

  test("returns null on non-200 without throwing", async () => {
    const m = mockFetch(["404"]);
    const cache = createGammaCache({ baseUrl: "https://gamma.test", ttlMs: 30_000, fetchImpl: m.fetch });

    const got = await cache.enrich("asset-1");
    expect(got).toBeNull();
  });

  test("returns null on fetch throw without crashing the ingestor", async () => {
    const m = mockFetch(["throw"]);
    const cache = createGammaCache({ baseUrl: "https://gamma.test", ttlMs: 30_000, fetchImpl: m.fetch });

    const got = await cache.enrich("asset-1");
    expect(got).toBeNull();
  });

  test("active=false when acceptingOrders is false or closed is true", async () => {
    const m = mockFetch([
      [{ question: "Q", active: true, acceptingOrders: false, closed: false, tags: [] }],
      [{ question: "Q", active: true, acceptingOrders: true, closed: true, tags: [] }],
    ]);
    const cache = createGammaCache({ baseUrl: "https://gamma.test", ttlMs: 0, fetchImpl: m.fetch });

    const a = await cache.enrich("a");
    const b = await cache.enrich("b");
    expect(a?.active).toBe(false);
    expect(b?.active).toBe(false);
  });
});

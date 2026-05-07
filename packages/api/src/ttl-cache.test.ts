import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import { TtlCache } from "./ttl-cache";

describe("TtlCache", () => {
  describe("get/set", () => {
    it("returns undefined for unknown keys", () => {
      const c = new TtlCache<string>();
      expect(c.get("missing")).toBeUndefined();
    });

    it("returns the stored value within TTL", () => {
      const c = new TtlCache<string>();
      c.set("k", "v", 1000);
      expect(c.get("k")).toBe("v");
    });

    it("evicts expired entries past the stale window", async () => {
      const c = new TtlCache<string>();
      c.set("k", "v", 1, 0); // ttl 1ms, stale 0ms
      await Bun.sleep(5);
      expect(c.get("k")).toBeUndefined();
    });

    it("evicts the oldest entry when over capacity", () => {
      const c = new TtlCache<string>(2);
      c.set("a", "1", 60_000);
      c.set("b", "2", 60_000);
      c.set("c", "3", 60_000); // evicts "a"
      expect(c.get("a")).toBeUndefined();
      expect(c.get("b")).toBe("2");
      expect(c.get("c")).toBe("3");
    });

    it("bumps recency on hit (LRU)", () => {
      const c = new TtlCache<string>(2);
      c.set("a", "1", 60_000);
      c.set("b", "2", 60_000);
      c.get("a"); // bump "a"
      c.set("c", "3", 60_000); // should evict "b", not "a"
      expect(c.get("a")).toBe("1");
      expect(c.get("b")).toBeUndefined();
    });
  });

  describe("getOrRefresh — stale-while-revalidate", () => {
    it("hard miss blocks on compute and reports status=miss", async () => {
      const c = new TtlCache<string>();
      const compute = mock(async () => "fresh");
      const r = await c.getOrRefresh("k", 1000, 5000, compute);
      expect(r).toEqual({ value: "fresh", status: "miss" });
      expect(compute).toHaveBeenCalledTimes(1);
    });

    it("fresh hit skips compute and reports status=hit", async () => {
      const c = new TtlCache<string>();
      c.set("k", "cached", 1000, 5000);
      const compute = mock(async () => "fresh");
      const r = await c.getOrRefresh("k", 1000, 5000, compute);
      expect(r).toEqual({ value: "cached", status: "hit" });
      expect(compute).not.toHaveBeenCalled();
    });

    it("stale hit returns prior value AND triggers background refresh", async () => {
      const c = new TtlCache<string>();
      // ttl 5ms, stale window 5000ms — value is stale immediately after sleep.
      c.set("k", "old", 5, 5000);
      await Bun.sleep(15);

      let resolveCompute: (v: string) => void = () => {};
      const compute = mock(
        () => new Promise<string>((res) => { resolveCompute = res; }),
      );

      const r = await c.getOrRefresh("k", 1000, 5000, compute);
      // immediate response with the old value
      expect(r).toEqual({ value: "old", status: "stale" });
      expect(compute).toHaveBeenCalledTimes(1);

      // Resolve background refresh, then a follow-up call sees the new value.
      resolveCompute("new");
      await Bun.sleep(5); // let the refresh promise settle
      const r2 = await c.getOrRefresh("k", 1000, 5000, compute);
      expect(r2).toEqual({ value: "new", status: "hit" });
    });

    it("dedupes concurrent hard misses onto a single compute", async () => {
      const c = new TtlCache<string>();
      let computeCount = 0;
      const compute = async () => {
        computeCount++;
        await Bun.sleep(20);
        return `v${computeCount}`;
      };

      const [r1, r2, r3] = await Promise.all([
        c.getOrRefresh("k", 1000, 5000, compute),
        c.getOrRefresh("k", 1000, 5000, compute),
        c.getOrRefresh("k", 1000, 5000, compute),
      ]);
      expect(computeCount).toBe(1);
      expect(r1.value).toBe("v1");
      expect(r2.value).toBe("v1");
      expect(r3.value).toBe("v1");
    });

    it("preserves the stale entry if a background refresh throws", async () => {
      const c = new TtlCache<string>();
      c.set("k", "old", 5, 5000);
      await Bun.sleep(15);

      const compute = mock(async () => {
        throw new Error("db down");
      });
      const r = await c.getOrRefresh("k", 1000, 5000, compute);
      expect(r).toEqual({ value: "old", status: "stale" });
      // wait for the rejection to settle in the background
      await Bun.sleep(5);

      // Stale entry should still be there for the next caller.
      const r2 = await c.getOrRefresh("k", 1000, 5000, compute);
      expect(r2.value).toBe("old");
      expect(r2.status).toBe("stale");
    });

    it("falls back to a hard miss once past the stale window", async () => {
      const c = new TtlCache<string>();
      c.set("k", "old", 5, 5);
      await Bun.sleep(20);

      const compute = mock(async () => "fresh");
      const r = await c.getOrRefresh("k", 1000, 5000, compute);
      expect(r).toEqual({ value: "fresh", status: "miss" });
    });

    it("counts hits / stale / misses in stats", async () => {
      const c = new TtlCache<string>();
      const compute = async () => "v";
      await c.getOrRefresh("k", 1000, 5000, compute); // miss
      await c.getOrRefresh("k", 1000, 5000, compute); // hit

      // Force stale by manually pushing the entry's expiry behind us. The
      // public API only exposes set() so we re-set with a tiny TTL and wait.
      c.set("k", "v", 1, 5000);
      await Bun.sleep(5);
      await c.getOrRefresh("k", 1000, 5000, compute); // stale

      const s = c.stats();
      expect(s.hits).toBe(1);
      expect(s.stale).toBe(1);
      expect(s.misses).toBe(1);
    });
  });
});

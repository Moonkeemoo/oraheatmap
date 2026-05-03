import { describe, expect, test } from "bun:test";
import { createSignalHub } from "./signal-hub";
import type { Signal } from "./types";

const stubSignal = (whale = "0xabc"): Signal => ({
  ts: new Date(),
  whaleAddr: whale,
  assetId: "asset-1",
  conditionId: null,
  marketQuestion: null,
  category: "Sports",
  side: "BUY",
  price: 0.5,
  size: 100,
  txHash: null,
  realizedPnl: null,
  exitKind: null,
});

describe("signal-hub", () => {
  test("broadcast fans out to all subscribers", () => {
    const hub = createSignalHub();
    const a: Signal[] = [];
    const b: Signal[] = [];
    hub.subscribe((s) => a.push(s));
    hub.subscribe((s) => b.push(s));

    hub.broadcast(stubSignal("0xa1"));
    hub.broadcast(stubSignal("0xa2"));

    expect(a.map((s) => s.whaleAddr)).toEqual(["0xa1", "0xa2"]);
    expect(b.map((s) => s.whaleAddr)).toEqual(["0xa1", "0xa2"]);
  });

  test("unsubscribe stops further deliveries", () => {
    const hub = createSignalHub();
    const seen: string[] = [];
    const off = hub.subscribe((s) => seen.push(s.whaleAddr));

    hub.broadcast(stubSignal("0xa1"));
    off();
    hub.broadcast(stubSignal("0xa2"));

    expect(seen).toEqual(["0xa1"]);
    expect(hub.size()).toBe(0);
  });

  test("a throwing subscriber does not prevent others from receiving", () => {
    const hub = createSignalHub();
    const ok: string[] = [];
    hub.subscribe(() => {
      throw new Error("boom");
    });
    hub.subscribe((s) => ok.push(s.whaleAddr));

    hub.broadcast(stubSignal("0xa1"));
    expect(ok).toEqual(["0xa1"]);
  });

  test("size() reflects subscriber count", () => {
    const hub = createSignalHub();
    expect(hub.size()).toBe(0);
    const o1 = hub.subscribe(() => {});
    const o2 = hub.subscribe(() => {});
    expect(hub.size()).toBe(2);
    o1();
    expect(hub.size()).toBe(1);
    o2();
    expect(hub.size()).toBe(0);
  });

  test("broadcast on empty hub is a no-op (no throw)", () => {
    const hub = createSignalHub();
    expect(() => hub.broadcast(stubSignal())).not.toThrow();
  });
});

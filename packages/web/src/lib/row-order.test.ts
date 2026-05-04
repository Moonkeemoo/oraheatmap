import { describe, expect, it } from "vitest";

import { applyOrder, buildScopeKey } from "./row-order";

describe("applyOrder", () => {
  it("returns natural order when nothing saved", () => {
    expect(applyOrder(["a", "b", "c"], undefined)).toEqual(["a", "b", "c"]);
    expect(applyOrder(["a", "b", "c"], [])).toEqual(["a", "b", "c"]);
  });

  it("uses saved order when all keys still exist", () => {
    expect(applyOrder(["a", "b", "c"], ["c", "a", "b"])).toEqual(["c", "a", "b"]);
  });

  it("drops saved keys that no longer exist in default", () => {
    expect(applyOrder(["a", "c"], ["c", "b", "a"])).toEqual(["c", "a"]);
  });

  it("inserts a brand-new key at its natural position (after its left neighbour)", () => {
    // Default order: A B C D E. Saved: [E, A, B] (user moved E to top, dropped C+D).
    // Wait — saved DOES contain stuff that was reordered, not just kept. Let me
    // model the realistic case: user reordered, then a new key F appears.
    // Default with the new key: A B C D E F. Saved (no F yet): [E, A, B, C, D].
    // F's left neighbour in default is E. In saved, E is at index 0.
    // Result: [E, F, A, B, C, D].
    expect(
      applyOrder(["a", "b", "c", "d", "e", "f"], ["e", "a", "b", "c", "d"]),
    ).toEqual(["e", "f", "a", "b", "c", "d"]);
  });

  it("inserts a new key at the front when it would naturally be first", () => {
    // Default: X A B. Saved: [B, A]. X's natural position is FIRST — no
    // left neighbour exists, so insert at front of result.
    expect(applyOrder(["x", "a", "b"], ["b", "a"])).toEqual(["x", "b", "a"]);
  });

  it("handles multiple new keys in their relative natural positions", () => {
    // Default: A B C D E. Saved: [C, A]. New: B (after A), D (after C), E (after D).
    // After A in saved, insert B → [C, A, B]
    // After C in saved (which is at idx 0), insert D → [C, D, A, B]
    // After D (now in result), insert E → [C, D, E, A, B]
    expect(applyOrder(["a", "b", "c", "d", "e"], ["c", "a"])).toEqual([
      "c",
      "d",
      "e",
      "a",
      "b",
    ]);
  });

  it("preserves order across drop+add combination", () => {
    // Default: A B D E (C removed, E added). Saved: [C, B, A].
    // C dropped (no longer in default). Saved becomes [B, A].
    // D's left neighbour in default is B → insert after B in saved → [B, D, A]
    // E's left neighbour in default is D → insert after D → [B, D, E, A]
    expect(applyOrder(["a", "b", "d", "e"], ["c", "b", "a"])).toEqual([
      "b",
      "d",
      "e",
      "a",
    ]);
  });
});

describe("buildScopeKey", () => {
  it("L1 LIVE", () => {
    expect(buildScopeKey("live", null, 1, [])).toBe("L1:LIVE");
  });

  it("L1 PATTERN-HOUR / DOW each independent", () => {
    expect(buildScopeKey("pattern", "hour-of-day", 1, [])).toBe("L1:PATTERN-HOUR");
    expect(buildScopeKey("pattern", "day-of-week", 1, [])).toBe("L1:PATTERN-DOW");
  });

  it("encodes parents into the scope path", () => {
    expect(buildScopeKey("live", null, 2, ["Sports"])).toBe("L2:LIVE:Sports");
    expect(buildScopeKey("live", null, 3, ["Sports", "nba"])).toBe(
      "L3:LIVE:Sports:nba",
    );
  });
});

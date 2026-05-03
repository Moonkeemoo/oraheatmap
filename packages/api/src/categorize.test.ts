import { describe, expect, test } from "bun:test";
import { categorize, CATEGORIES, type Category } from "./categorize";

describe("categorize", () => {
  test("empty / nullish input → Other", () => {
    expect(categorize(null)).toBe("Other");
    expect(categorize(undefined)).toBe("Other");
    expect(categorize([])).toBe("Other");
  });

  test("tag without slug → Other", () => {
    expect(categorize([{}])).toBe("Other");
    expect(categorize([{ label: "Sports" }])).toBe("Other"); // label alone isn't enough — slug is the canonical key
  });

  const cases: ReadonlyArray<[string, Category]> = [
    // Sports — single bucket
    ["sports", "Sports"],
    // Politics absorbs Elections
    ["politics", "Politics"],
    ["elections", "Politics"],
    // Crypto kept alone
    ["crypto", "Crypto"],
    // Finance = business + economy
    ["business", "Finance"],
    ["economy", "Finance"],
    // Tech = tech + ai + science
    ["tech", "Tech"],
    ["ai", "Tech"],
    ["science", "Tech"],
    // World = news + world
    ["news", "World"],
    ["world", "World"],
    // Culture = entertainment + pop-culture
    ["entertainment", "Culture"],
    ["pop-culture", "Culture"],
    // Climate = weather + climate
    ["weather", "Climate"],
    ["climate", "Climate"],
  ];
  test.each(cases)("slug %s → %s", (slug, expected) => {
    expect(categorize([{ slug }])).toBe(expected);
  });

  test("non-canonical slug (specific tag like counter-strike-2) → Other on its own", () => {
    expect(categorize([{ slug: "counter-strike-2" }])).toBe("Other");
    expect(categorize([{ slug: "btc-eth" }])).toBe("Other");
  });

  test("first canonical tag wins (Polymarket lists broadest tag first)", () => {
    // Real CS2 market shape: [Sports, Esports, Games, counter strike 2]
    expect(
      categorize([
        { slug: "sports" },
        { slug: "esports" }, // not in our canonical map
        { slug: "games" },
        { slug: "counter-strike-2" },
      ]),
    ).toBe("Sports");
  });

  test("skips slug-less tags and uses next canonical", () => {
    expect(
      categorize([
        { label: "Counter-Strike" },
        { slug: "sports" },
      ]),
    ).toBe("Sports");
  });

  test("politics + elections both present → first wins (politics)", () => {
    expect(categorize([{ slug: "politics" }, { slug: "elections" }])).toBe("Politics");
  });

  test("CATEGORIES exposes the 9 buckets including Other", () => {
    expect(CATEGORIES).toContain("Other");
    expect(CATEGORIES.length).toBe(9);
  });

  test("real-world Polymarket tag shapes (sample from /markets?include_tag=true)", () => {
    // Sport / Esports
    expect(
      categorize([
        { id: "1", label: "Sports", slug: "sports" },
        { id: "64", label: "Esports", slug: "esports" },
      ]),
    ).toBe("Sports");
    // Crypto / Bitcoin
    expect(
      categorize([
        { id: "21", label: "Crypto", slug: "crypto" },
        { id: "235", label: "Bitcoin", slug: "bitcoin" },
      ]),
    ).toBe("Crypto");
    // Politics / Elections subset (only 'elections' present)
    expect(
      categorize([
        { id: "144", label: "Elections", slug: "elections" },
      ]),
    ).toBe("Politics");
  });
});

import { describe, expect, test } from "bun:test";
import { pickSubcategory, subcategoriesOf, SUBCATEGORY_LABELS } from "./subcategorize";

describe("pickSubcategory — tag-based matches (preferred path)", () => {
  test("Sports + nba tag → 'nba'", () => {
    expect(pickSubcategory("Sports", [{ slug: "sports" }, { slug: "nba" }], "Lakers vs Celtics")).toBe("nba");
  });

  test("Politics + trump tag → 'trump'", () => {
    expect(pickSubcategory("Politics", [{ slug: "politics" }, { slug: "trump" }], "x")).toBe("trump");
  });

  test("Crypto + bitcoin tag → 'bitcoin'", () => {
    expect(pickSubcategory("Crypto", [{ slug: "crypto" }, { slug: "bitcoin" }], "x")).toBe("bitcoin");
  });

  test("first matching rule wins (us-presidential-election before china)", () => {
    expect(
      pickSubcategory("Politics", [{ slug: "us-presidential-election" }, { slug: "china" }], "x"),
    ).toBe("us-election");
  });
});

describe("pickSubcategory — questionRe fallback (no matching tag)", () => {
  test("Crypto with only generic 'crypto' tag — bitcoin in title", () => {
    expect(
      pickSubcategory("Crypto", [{ slug: "crypto" }], "Will Bitcoin hit $100k by EOY?"),
    ).toBe("bitcoin");
  });

  test("Crypto BTC abbreviation in title", () => {
    expect(pickSubcategory("Crypto", [{ slug: "crypto" }], "BTC > $90k in May"))
      .toBe("bitcoin");
  });

  test("Crypto XRP — no Polymarket tag, only regex", () => {
    expect(pickSubcategory("Crypto", [{ slug: "crypto" }], "XRP up or down 15min"))
      .toBe("xrp");
  });

  test("Climate North America from city name", () => {
    expect(
      pickSubcategory("Climate", [{ slug: "weather" }], "Will NYC see snow > 6 inches in December?"),
    ).toBe("north-america");
  });

  test("Climate Europe from city name", () => {
    expect(
      pickSubcategory("Climate", [{ slug: "weather" }], "Daily temperature in London > 25°C tomorrow"),
    ).toBe("europe");
  });

  test("Climate Asia from country name", () => {
    expect(pickSubcategory("Climate", [], "Heat record in Japan this summer")).toBe("asia");
  });

  test("Climate global keyword", () => {
    expect(pickSubcategory("Climate", [], "Will 2026 be the hottest year on record?")).toBe("global");
  });
});

describe("pickSubcategory — null cases", () => {
  test("Other bucket has no subs", () => {
    expect(pickSubcategory("Other", [{ slug: "anything" }], "anything")).toBeNull();
  });

  test("no matching tag and no matching regex → null", () => {
    expect(pickSubcategory("Sports", [{ slug: "sports" }], "Some obscure event")).toBeNull();
  });

  test("nullish tags + question → null (won't crash)", () => {
    expect(pickSubcategory("Crypto", null, null)).toBeNull();
    expect(pickSubcategory("Crypto", undefined, null)).toBeNull();
  });

  test("Crypto generic 'crypto market' question without token → null (catch-all)", () => {
    expect(pickSubcategory("Crypto", [{ slug: "crypto" }], "Will total crypto market cap exceed $5T?"))
      .toBeNull();
  });
});

describe("priority — tag wins over fallback regex of a later rule", () => {
  test("Sports + nba tag wins even if title also mentions tennis", () => {
    // both 'nba' tag and 'tennis' word — nba is first in rules, wins
    expect(
      pickSubcategory("Sports", [{ slug: "sports" }, { slug: "nba" }], "tennis tournament tonight"),
    ).toBe("nba");
  });

  test("Sports + tennis tag wins over later soccer regex", () => {
    expect(
      pickSubcategory("Sports", [{ slug: "tennis" }], "Champions league soccer match"),
    ).toBe("tennis"); // tennis tag matches before soccer regex even checked
  });
});

describe("subcategoriesOf", () => {
  test("returns ordered list per bucket", () => {
    const sportsList = subcategoriesOf("Sports");
    expect(sportsList.length).toBeGreaterThanOrEqual(10);
    expect(sportsList[0]?.slug).toBe("nba"); // priority order
  });
  test("Other returns empty list", () => {
    expect(subcategoriesOf("Other")).toEqual([]);
  });
});

describe("SUBCATEGORY_LABELS", () => {
  test("contains a label for every rule across all buckets", () => {
    expect(SUBCATEGORY_LABELS["nba"]).toBe("NBA");
    expect(SUBCATEGORY_LABELS["bitcoin"]).toBe("Bitcoin");
    expect(SUBCATEGORY_LABELS["north-america"]).toBe("N. America");
    expect(SUBCATEGORY_LABELS["us-election"]).toBe("US Election");
  });
});

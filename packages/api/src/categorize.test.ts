import { describe, expect, test } from "bun:test";
import { categorize, type Category } from "./categorize";

describe("categorize", () => {
  test("empty / nullish input → Other", () => {
    expect(categorize(null)).toBe("Other");
    expect(categorize(undefined)).toBe("Other");
    expect(categorize([])).toBe("Other");
  });

  test("tag without label → Other", () => {
    expect(categorize([{}])).toBe("Other");
  });

  const cases: ReadonlyArray<[string, Category]> = [
    ["Sports", "Sports"],
    ["sports", "Sports"],
    ["MLB", "Sports"],
    ["NBA", "Sports"],
    ["NFL Season", "Sports"],
    ["F1 Racing", "Sports"],
    ["Politics", "Politics"],
    ["US Election 2028", "Politics"],
    ["Senate Race", "Politics"],
    ["Crypto", "Crypto"],
    ["Bitcoin Price", "Crypto"],
    ["ETH ETF", "Crypto"],
    ["Solana", "Crypto"],
    ["Science", "Science"],
    ["AI Models", "Science"],
    ["SpaceX Launch", "Science"],
    ["Finance", "Finance"],
    ["Fed Rate Cut", "Finance"],
    ["US Inflation", "Finance"],
    ["Culture", "Culture"],
    ["Movie Awards", "Culture"],
    ["Music Charts", "Culture"],
    ["Weather", "Weather"],
    ["Hurricane Path", "Weather"],
  ];
  test.each(cases)("label %s → %s", (label, expected) => {
    expect(categorize([{ label }])).toBe(expected);
  });

  test("unknown label → Other", () => {
    expect(categorize([{ label: "Random Trivia" }])).toBe("Other");
  });

  test("substring traps: word boundaries prevent false positives", () => {
    // "inflation" contains "nfl" — must NOT match Sports
    expect(categorize([{ label: "US Inflation" }])).toBe("Finance");
    // "rain" contains "ai" — must NOT match Science
    expect(categorize([{ label: "Will it rain tomorrow?" }])).toBe("Other");
    // "Mlbgame" without word boundary → still no match (we want clean tags)
    expect(categorize([{ label: "Mlbgame" }])).toBe("Other");
  });

  test("first matching tag wins", () => {
    expect(categorize([{ label: "Bitcoin" }, { label: "Sports" }])).toBe("Crypto");
  });

  test("skips tags without labels and uses next", () => {
    expect(categorize([{}, { label: "NBA Finals" }])).toBe("Sports");
  });
});

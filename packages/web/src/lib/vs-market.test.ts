import { describe, expect, it } from "bun:test";

import { parseVsMarket, teamAbbrev, teamColor } from "./vs-market";

describe("parseVsMarket", () => {
  it("matches plain head-to-head", () => {
    expect(parseVsMarket("Chiefs vs Bills")).toEqual({ teamA: "Chiefs", teamB: "Bills" });
  });

  it("matches dotted vs", () => {
    expect(parseVsMarket("Lakers vs. Celtics")).toEqual({ teamA: "Lakers", teamB: "Celtics" });
  });

  it("matches @ as separator (NBA short form)", () => {
    expect(parseVsMarket("Lakers @ Celtics")).toEqual({ teamA: "Lakers", teamB: "Celtics" });
  });

  it("strips tournament prefix before the colon", () => {
    expect(
      parseVsMarket("Internazionali BNL d'Italia, Qualification: P1 vs P2"),
    ).toEqual({ teamA: "P1", teamB: "P2" });
  });

  it("rejects prediction questions ending with ?", () => {
    expect(parseVsMarket("Will Lakers vs Celtics go to overtime?")).toBeNull();
  });

  it("rejects question-prefixed strings", () => {
    expect(parseVsMarket("Will Bills beat Chiefs")).toBeNull();
    expect(parseVsMarket("Does Trump vs Biden debate happen")).toBeNull();
  });

  it("rejects three-way matchups", () => {
    expect(parseVsMarket("A vs B vs C")).toBeNull();
  });

  it("rejects null / empty", () => {
    expect(parseVsMarket(null)).toBeNull();
    expect(parseVsMarket("")).toBeNull();
    expect(parseVsMarket("    ")).toBeNull();
  });

  it("rejects no separator", () => {
    expect(parseVsMarket("Lakers winning championship")).toBeNull();
  });

  it("rejects when a side is too long", () => {
    const long = "x".repeat(50);
    expect(parseVsMarket(`${long} vs Bills`)).toBeNull();
  });
});

describe("teamAbbrev", () => {
  it("multi-word → initials", () => {
    expect(teamAbbrev("Los Angeles Lakers")).toBe("LAL");
    expect(teamAbbrev("Kansas City Chiefs")).toBe("KCC");
  });

  it("two-word → initials", () => {
    expect(teamAbbrev("New England")).toBe("NE");
  });

  it("single word → first 3 chars uppercased", () => {
    expect(teamAbbrev("Chiefs")).toBe("CHI");
    expect(teamAbbrev("P1")).toBe("P1");
  });

  it("empty → ?", () => {
    expect(teamAbbrev("")).toBe("?");
  });
});

describe("teamColor", () => {
  it("is deterministic for the same name", () => {
    expect(teamColor("Lakers")).toBe(teamColor("Lakers"));
  });

  it("returns valid HSL string", () => {
    expect(teamColor("Bills")).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/);
  });
});

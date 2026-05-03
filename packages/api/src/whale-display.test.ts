import { describe, expect, test } from "bun:test";
import { setWhaleAliases, whaleAlias, whaleColor } from "./whale-display";

describe("whaleAlias", () => {
  test("truncates a normal 0x address to first6 + ellipsis + last5", () => {
    expect(whaleAlias("0xadc2efbf97ce7b25f7a638aabdba196c657cd1c9")).toBe("0xadc2…cd1c9");
  });

  test("short input stays as-is", () => {
    expect(whaleAlias("0xabc")).toBe("0xabc");
    expect(whaleAlias("0xabcdef0123")).toBe("0xabcdef0123");
  });

  test("uses Polymarket username when alias map has the address", () => {
    const addr = "0xadc2efbf97ce7b25f7a638aabdba196c657cd1c9";
    setWhaleAliases(new Map([[addr, "stingo43"]]));
    expect(whaleAlias(addr)).toBe("stingo43");
    // Lookup is case-insensitive on the address
    expect(whaleAlias(addr.toUpperCase())).toBe("stingo43");
    setWhaleAliases(new Map()); // reset for other tests
  });
});

describe("whaleColor", () => {
  test("returns CSS hsl string with hue in 0..360", () => {
    const c = whaleColor("0xadc2efbf97ce7b25f7a638aabdba196c657cd1c9");
    expect(c).toMatch(/^hsl\(\d+, 70%, 55%\)$/);
    const m = /^hsl\((\d+),/.exec(c);
    const hue = m ? Number(m[1]) : -1;
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
  });

  test("deterministic — same input → same output", () => {
    const a = whaleColor("0xabc1234567890abc1234567890abc1234567890");
    const b = whaleColor("0xabc1234567890abc1234567890abc1234567890");
    expect(a).toBe(b);
  });

  test("case-insensitive (0x prefix is normalized away, hex is case-sensitive intentionally)", () => {
    // 0x prefix skipped, but hex characters themselves do affect hue (we never
    // mix lower/upper in the corpus — addresses are always lowercased upstream)
    const lower = whaleColor("0xabcdef0123456789abcdef0123456789abcdef01");
    const withPrefix = whaleColor("abcdef0123456789abcdef0123456789abcdef01");
    expect(lower).toBe(withPrefix);
  });

  test("different addresses spread across the hue circle", () => {
    const samples = [
      "0xadc2efbf97ce7b25f7a638aabdba196c657cd1c9",
      "0x1111111111111111111111111111111111111111",
      "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      "0xc0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ff",
      "0x84ad9c5c547a82ec9a08547b94bd922446e5bfb7",
    ];
    const hues = samples.map((a) => Number(/hsl\((\d+)/.exec(whaleColor(a))?.[1] ?? "0"));
    // Sanity: at least 3 distinct hues across 5 addresses (collision possible
    // but very rare with 360-bucket hash).
    const distinct = new Set(hues).size;
    expect(distinct).toBeGreaterThanOrEqual(3);
  });
});

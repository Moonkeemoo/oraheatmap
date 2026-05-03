import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { writeFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWhaleCorpus } from "./whale-corpus";

let tmpDir: string;
let okPath: string;
let mixedCasePath: string;
let dupePath: string;
let badRootPath: string;
let badEntryPath: string;
let badAddrPath: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "whale-corpus-test-"));
  okPath = join(tmpDir, "ok.json");
  mixedCasePath = join(tmpDir, "mixed.json");
  dupePath = join(tmpDir, "dupe.json");
  badRootPath = join(tmpDir, "bad-root.json");
  badEntryPath = join(tmpDir, "bad-entry.json");
  badAddrPath = join(tmpDir, "bad-addr.json");

  await writeFile(okPath, JSON.stringify([
    "0x0000000000000000000000000000000000000001",
    "0xdeadbeef000000000000000000000000deadbeef",
  ]));
  await writeFile(mixedCasePath, JSON.stringify([
    "0xABCDEF0000000000000000000000000000000123",
  ]));
  await writeFile(dupePath, JSON.stringify([
    "0x0000000000000000000000000000000000000001",
    "0x0000000000000000000000000000000000000001",
  ]));
  await writeFile(badRootPath, JSON.stringify({ wallets: [] }));
  await writeFile(badEntryPath, JSON.stringify(["0x0000000000000000000000000000000000000001", 42]));
  await writeFile(badAddrPath, JSON.stringify(["not-an-address"]));
});

afterAll(async () => {
  for (const p of [okPath, mixedCasePath, dupePath, badRootPath, badEntryPath, badAddrPath]) {
    await unlink(p).catch(() => {});
  }
});

describe("loadWhaleCorpus", () => {
  test("loads valid addresses into a Set", async () => {
    const set = await loadWhaleCorpus(okPath);
    expect(set.size).toBe(2);
    expect(set.has("0x0000000000000000000000000000000000000001")).toBe(true);
    expect(set.has("0xdeadbeef000000000000000000000000deadbeef")).toBe(true);
  });

  test("normalizes mixed-case addresses to lowercase", async () => {
    const set = await loadWhaleCorpus(mixedCasePath);
    expect(set.has("0xabcdef0000000000000000000000000000000123")).toBe(true);
    expect(set.has("0xABCDEF0000000000000000000000000000000123")).toBe(false);
  });

  test("dedupes identical addresses (Set semantics)", async () => {
    const set = await loadWhaleCorpus(dupePath);
    expect(set.size).toBe(1);
  });

  test("rejects non-array root", async () => {
    expect(loadWhaleCorpus(badRootPath)).rejects.toThrow(/must be a JSON array/);
  });

  test("rejects non-string entries", async () => {
    expect(loadWhaleCorpus(badEntryPath)).rejects.toThrow(/not a string/);
  });

  test("rejects malformed addresses", async () => {
    expect(loadWhaleCorpus(badAddrPath)).rejects.toThrow(/not a valid 0x-address/);
  });

  test("rejects when file does not exist", async () => {
    expect(loadWhaleCorpus(join(tmpDir, "nope.json"))).rejects.toThrow();
  });

  test("loads the real watchlist (current Polymarket leaderboard corpus)", async () => {
    const corpusPath = join(import.meta.dir, "../../../data/whale_corpus.json");
    const set = await loadWhaleCorpus(corpusPath);
    // Size depends on the latest refresh-corpus.ts run — assert a reasonable
    // band rather than a hard number so the test doesn't flake on every refresh.
    expect(set.size).toBeGreaterThan(500);
    expect(set.size).toBeLessThan(10000);
    for (const addr of set) {
      expect(addr).toMatch(/^0x[0-9a-f]{40}$/);
    }
  });
});

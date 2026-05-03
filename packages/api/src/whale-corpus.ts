import { readFile } from "node:fs/promises";

const ADDR_RE = /^0x[0-9a-f]{40}$/;

/**
 * Loads the whale watchlist from a JSON file containing a flat array of
 * Ethereum-style addresses. Returns a `Set<string>` of normalized lowercase
 * addresses for O(1) `set.has(addr.toLowerCase())` matching in the ingestor.
 *
 * Throws if:
 *   - file is missing / unreadable
 *   - JSON root is not an array
 *   - any element is not a 0x-prefixed 40-hex-char string (case-insensitive)
 */
export async function loadWhaleCorpus(path: string): Promise<Set<string>> {
  const raw = await readFile(path, "utf8");
  const parsed: unknown = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error(`whale corpus at ${path} must be a JSON array, got ${typeof parsed}`);
  }

  const out = new Set<string>();
  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i];
    if (typeof entry !== "string") {
      throw new Error(`whale corpus entry ${i} is not a string: ${JSON.stringify(entry)}`);
    }
    const lower = entry.toLowerCase();
    if (!ADDR_RE.test(lower)) {
      throw new Error(`whale corpus entry ${i} is not a valid 0x-address: ${entry}`);
    }
    out.add(lower);
  }

  return out;
}

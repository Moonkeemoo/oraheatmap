/**
 * Display helpers for whale addresses. Same address always produces the same
 * alias and color so the UI renders trades from /api/heatmap or /api/stream
 * consistently. Aliases come from data/whale_aliases.json (Polymarket
 * leaderboard usernames); when an address isn't in the alias map we fall
 * back to a truncated 0x-form.
 */

import { readFile } from "node:fs/promises";

export type WhaleAliasInfo = {
  alias: string;
  xHandle: string | null;
  verified: boolean;
  /** Polymarket-hosted avatar URL. NULL when the user never set one. */
  profileImage: string | null;
};

let aliasMap: ReadonlyMap<string, WhaleAliasInfo> = new Map();

/** Load Polymarket usernames keyed by lowercase address.
 *  Tolerant of legacy / partial files: any entry without an `alias` is skipped. */
export async function loadWhaleAliases(path: string): Promise<Map<string, WhaleAliasInfo>> {
  const raw = await readFile(path, "utf8");
  const parsed: unknown = JSON.parse(raw);
  const out = new Map<string, WhaleAliasInfo>();
  if (parsed === null || typeof parsed !== "object") return out;
  for (const [addr, info] of Object.entries(parsed as Record<string, unknown>)) {
    if (info === null || typeof info !== "object") continue;
    const rec = info as {
      alias?: unknown;
      xHandle?: unknown;
      verified?: unknown;
      profileImage?: unknown;
    };
    if (typeof rec.alias !== "string" || rec.alias.length === 0) continue;
    out.set(addr.toLowerCase(), {
      alias: rec.alias,
      xHandle: typeof rec.xHandle === "string" && rec.xHandle.length > 0 ? rec.xHandle : null,
      verified: rec.verified === true,
      profileImage:
        typeof rec.profileImage === "string" && rec.profileImage.length > 0
          ? rec.profileImage
          : null,
    });
  }
  return out;
}

/** Replace the in-memory alias map. Called once at boot, optionally re-run
 *  after a corpus refresh — lookups remain O(1) before/during/after. */
export function setWhaleAliases(map: ReadonlyMap<string, WhaleAliasInfo>): void {
  aliasMap = map;
}

export function whaleAliasMapSize(): number {
  return aliasMap.size;
}

/** Full alias record (including X handle + verified flag) when we have one. */
export function whaleAliasInfo(addr: string): WhaleAliasInfo | null {
  return aliasMap.get(addr.toLowerCase()) ?? null;
}

/**
 * Returns the Polymarket username if we have one, otherwise the address
 * truncated to `0xadc2…cd1c9`.
 */
export function whaleAlias(addr: string): string {
  const info = aliasMap.get(addr.toLowerCase());
  if (info) return info.alias;
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-5)}`;
}

/**
 * Deterministic HSL color derived from the address bytes (post-`0x`). Hue is
 * 0..360 from a fast string hash; saturation/lightness fixed for visual
 * consistency. Returned as a CSS-ready `hsl(...)` string so the UI can drop
 * it straight into a style attribute.
 */
export function whaleColor(addr: string): string {
  // Skip `0x` prefix if present so two addresses that only differ in case
  // produce the same hue regardless.
  const start = addr.startsWith("0x") ? 2 : 0;
  let h = 0;
  for (let i = start; i < addr.length; i++) {
    // (h * 31 + ch) | 0 — same simple polynomial hash as Java's String.hashCode
    h = (Math.imul(h, 31) + addr.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

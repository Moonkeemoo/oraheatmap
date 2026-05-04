/**
 * Refresh data/whale_corpus.json + whale_aliases.json from Polymarket's
 * leaderboard. Designed to run weekly via cron — adds newcomers to the top,
 * updates evolving aliases, and lets fallen-off whales drop out of the
 * watchlist while preserving their historical alias info.
 *
 *   bun run packages/api/scripts/refresh-corpus.ts
 *
 * Behavior:
 *   - Hits https://data-api.polymarket.com/v1/leaderboard for each
 *     Polymarket leaderboard category that maps to one of our 8 buckets,
 *     paginated (limit=50 × N calls per cat to reach TARGET_PER_CATEGORY).
 *   - Polite 200ms delay between calls so we don't hammer Polymarket's API.
 *   - Dedupes across categories (one whale can be top in multiple).
 *   - Writes:
 *       data/whale_corpus.json   — REPLACED with the current top set. The
 *         ingestor reloads this Set on restart; whales no longer in the
 *         file stop receiving new tracking, but their historical signals
 *         in the DB stay.
 *       data/whale_aliases.json  — MERGED. New entries from this run
 *         overwrite per-key, but entries we've seen before that fell off
 *         the top survive so the WhaleDrawer / Tooltip can still show
 *         their last-known alias / X handle / avatar against historical
 *         signals.
 *
 * Does NOT touch the DB. We deliberately do NOT TRUNCATE signals — past
 * trades from now-untracked whales are still load-bearing for receipts,
 * the balance-growth chart, and PATTERN cycles.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ─── Polymarket leaderboard categories → our 8 buckets ───────────────────────

type Bucket = "Sports" | "Politics" | "Crypto" | "Finance" | "Tech" | "Culture" | "Climate";
// (We don't harvest "World" or "Other" — Polymarket has no equivalent leaderboard
// category. Those buckets fill organically from any matched whale's trades.)

const POLY_TO_BUCKET: ReadonlyArray<{ poly: string; bucket: Bucket }> = [
  { poly: "SPORTS",    bucket: "Sports"   },
  { poly: "POLITICS",  bucket: "Politics" },
  { poly: "CRYPTO",    bucket: "Crypto"   },
  // Polymarket exposes ECONOMICS and FINANCE as separate leaderboards;
  // we merge both into our Finance bucket since the audience overlaps heavily.
  { poly: "ECONOMICS", bucket: "Finance"  },
  { poly: "FINANCE",   bucket: "Finance"  },
  { poly: "TECH",      bucket: "Tech"     },
  // CULTURE + MENTIONS both feed our Culture bucket (MENTIONS = celebs).
  { poly: "CULTURE",   bucket: "Culture"  },
  { poly: "MENTIONS",  bucket: "Culture"  },
  { poly: "WEATHER",   bucket: "Climate"  },
];

// ─── Config ──────────────────────────────────────────────────────────────────

const LEADERBOARD_BASE = "https://data-api.polymarket.com/v1/leaderboard";
const PER_CALL = 50; // Polymarket max
// Top-1500 per category × 9 buckets = up to 13.5k candidates; with dedup
// across categories the corpus lands around 5–6k unique addresses.
const TARGET_PER_CATEGORY = 1500; // → 30 paginated calls per cat
const POLITE_DELAY_MS = 200;
const TIME_PERIOD = "ALL"; // proven all-time winners (most stable signal)
const ORDER_BY = "PNL";

// ─── Wire types ──────────────────────────────────────────────────────────────

type LeaderboardEntry = {
  rank?: string | number;
  proxyWallet?: string;
  userName?: string;
  vol?: number;
  pnl?: number;
  xUsername?: string;
  verifiedBadge?: boolean;
  profileImage?: string;
};

type WhaleAlias = {
  alias: string | null;
  xHandle: string | null;
  verified: boolean;
  /** Polymarket-hosted avatar URL (S3). Empty/null when the user never set one. */
  profileImage: string | null;
  sources: Array<{ category: Bucket; rank: number; pnl: number; vol: number }>;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPage(category: string, offset: number): Promise<LeaderboardEntry[]> {
  const url =
    `${LEADERBOARD_BASE}?category=${encodeURIComponent(category)}` +
    `&timePeriod=${TIME_PERIOD}&orderBy=${ORDER_BY}` +
    `&limit=${PER_CALL}&offset=${offset}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`leaderboard ${category}@${offset} → HTTP ${res.status}`);
  }
  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) {
    throw new Error(`leaderboard ${category}@${offset} → not an array`);
  }
  return body as LeaderboardEntry[];
}

async function fetchCategoryTopN(polyCategory: string, n: number): Promise<LeaderboardEntry[]> {
  const out: LeaderboardEntry[] = [];
  let offset = 0;
  while (out.length < n) {
    const remaining = n - out.length;
    const page = await fetchPage(polyCategory, offset);
    if (page.length === 0) break;
    out.push(...page.slice(0, remaining));
    if (page.length < PER_CALL) break;
    offset += PER_CALL;
    await sleep(POLITE_DELAY_MS);
  }
  return out;
}

function normalizeAddr(raw: string | undefined): string | null {
  if (typeof raw !== "string") return null;
  const lower = raw.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(lower)) return null;
  return lower;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const aliasMap = new Map<string, WhaleAlias>();
  const perBucketCounts = new Map<Bucket, number>();

  for (const { poly, bucket } of POLY_TO_BUCKET) {
    process.stdout.write(`fetching ${poly} top ${TARGET_PER_CATEGORY}… `);
    const entries = await fetchCategoryTopN(poly, TARGET_PER_CATEGORY);
    process.stdout.write(`got ${entries.length}\n`);

    let bucketAdds = 0;
    for (const e of entries) {
      const addr = normalizeAddr(e.proxyWallet);
      if (!addr) continue;
      const existing = aliasMap.get(addr);
      const sourceEntry = {
        category: bucket,
        rank: typeof e.rank === "number" ? e.rank : Number(e.rank ?? 0),
        pnl: typeof e.pnl === "number" ? e.pnl : 0,
        vol: typeof e.vol === "number" ? e.vol : 0,
      };
      if (existing) {
        existing.sources.push(sourceEntry);
        // Backfill alias / profileImage from a later category if the first
        // one we saw didn't have them set. Polymarket sometimes returns
        // empty fields for the same wallet on different leaderboards.
        if (!existing.profileImage && typeof e.profileImage === "string" && e.profileImage.length > 0) {
          existing.profileImage = e.profileImage;
        }
        if (!existing.xHandle && typeof e.xUsername === "string" && e.xUsername.length > 0) {
          existing.xHandle = e.xUsername;
        }
      } else {
        aliasMap.set(addr, {
          alias: typeof e.userName === "string" && e.userName.length > 0 ? e.userName : null,
          xHandle: typeof e.xUsername === "string" && e.xUsername.length > 0 ? e.xUsername : null,
          verified: Boolean(e.verifiedBadge),
          profileImage:
            typeof e.profileImage === "string" && e.profileImage.length > 0 ? e.profileImage : null,
          sources: [sourceEntry],
        });
        bucketAdds += 1;
      }
    }
    perBucketCounts.set(bucket, (perBucketCounts.get(bucket) ?? 0) + bucketAdds);
    await sleep(POLITE_DELAY_MS);
  }

  const currentAddrs = Array.from(aliasMap.keys()).sort();
  const currentAliasesObject = Object.fromEntries(
    currentAddrs.map((a) => [a, aliasMap.get(a)!]),
  );

  // Resolve paths relative to the repo root regardless of where the script
  // was invoked from (e.g. project root or packages/api).
  const repoRoot = join(import.meta.dir, "..", "..", "..");
  const corpusPath = join(repoRoot, "data", "whale_corpus.json");
  const aliasesPath = join(repoRoot, "data", "whale_aliases.json");

  // ── Merge aliases with previous run ───────────────────────────────────────
  // Goal: keep names/avatars for whales that fell off the top so historical
  // signals don't suddenly render as raw 0x addresses in the UI.
  const previousAliases: Record<string, WhaleAlias> = {};
  try {
    const prevRaw = await readFile(aliasesPath, "utf8");
    const prevParsed = JSON.parse(prevRaw) as unknown;
    if (prevParsed && typeof prevParsed === "object" && !Array.isArray(prevParsed)) {
      Object.assign(previousAliases, prevParsed as Record<string, WhaleAlias>);
    }
  } catch (err) {
    // First-ever run, file missing, or malformed JSON — fall through with
    // empty previous map. We log because the silent merge-vs-overwrite
    // distinction matters for debugging cron behaviour.
    console.warn(`(no previous aliases merged: ${(err as Error).message})`);
  }
  const previousCount = Object.keys(previousAliases).length;
  const mergedAliases: Record<string, WhaleAlias> = {
    ...previousAliases,
    ...currentAliasesObject,
  };
  // Sort keys so the JSON file diffs cleanly week to week.
  const mergedSortedKeys = Object.keys(mergedAliases).sort();
  const mergedAliasesSorted = Object.fromEntries(
    mergedSortedKeys.map((k) => [k, mergedAliases[k]!]),
  );
  const survivors = mergedSortedKeys.filter(
    (a) => previousAliases[a] && !aliasMap.has(a),
  ).length;
  const newcomers = currentAddrs.filter((a) => !previousAliases[a]).length;
  const refreshed = currentAddrs.filter((a) => previousAliases[a]).length;

  await writeFile(corpusPath, JSON.stringify(currentAddrs, null, 2) + "\n", "utf8");
  await writeFile(aliasesPath, JSON.stringify(mergedAliasesSorted, null, 2) + "\n", "utf8");

  console.log("");
  console.log("─── summary ───");
  console.log(`current top whales (corpus): ${currentAddrs.length}`);
  console.log(`  newcomers vs last run:     ${newcomers}`);
  console.log(`  refreshed (still in top):  ${refreshed}`);
  console.log(`previous file had:           ${previousCount}`);
  console.log(`  survivors (kept for UI):   ${survivors}`);
  console.log(`merged aliases written:      ${mergedSortedKeys.length}`);
  console.log("per bucket (this run):");
  for (const [b, n] of perBucketCounts) {
    console.log(`  ${b.padEnd(10)} ${n}`);
  }
  console.log("");
  console.log(`wrote ${corpusPath}`);
  console.log(`wrote ${aliasesPath}`);
  console.log("");
  console.log(
    "To activate the new corpus on a running deploy, restart the ingestor:\n" +
    "  sudo systemctl restart oraheatmap-api",
  );
  console.log("Do NOT TRUNCATE signals — historical trades from dropped whales remain valuable.");
}

main().catch((err) => {
  console.error("refresh-corpus failed:", (err as Error).message);
  process.exit(1);
});

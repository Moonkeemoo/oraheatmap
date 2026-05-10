/**
 * One element of `gamma_market.tags`. We rely on `slug` (Polymarket's stable
 * canonical identifier), not `label` (which has inconsistent casing across
 * tags). `id` is also unique but we don't need to read it.
 */
export type GammaTag = {
  id?: string;
  label?: string;
  slug?: string;
};

/** 8 heatmap buckets + Other. Display labels are these strings verbatim. */
export type Category =
  | "Sports"
  | "Politics"
  | "Crypto"
  | "Finance"
  | "Tech"
  | "World"
  | "Culture"
  | "Climate"
  | "Other";

/**
 * Slug → bucket mapping based on the canonical Polymarket taxonomy
 * (see /tags/slug/{slug}). Each bucket may collapse multiple Polymarket
 * top-level slugs to keep the heatmap to 8 rows. To extend, just add a
 * slug here — no regex maintenance.
 */
const SLUG_TO_CATEGORY: Readonly<Record<string, Category>> = Object.freeze({
  // Sports — single biggest segment, kept alone
  sports: "Sports",

  // Politics absorbs Elections (subset)
  politics: "Politics",
  elections: "Politics",
  // Geopolitics + war markets — used to leak into Other when Polymarket
  // omitted a `politics` tag and only carried country-specific tags
  // (russia/ukraine/israel/iran). Mapped here per user call 2026-05-10:
  // war/conflict markets read more "politics" than "world news".
  geopolitics:    "Politics",
  russia:         "Politics",
  ukraine:        "Politics",
  "russia-ukraine": "Politics",
  israel:         "Politics",
  iran:           "Politics",
  "israel-hamas": "Politics",
  gaza:           "Politics",
  palestine:      "Politics",
  "middle-east":  "Politics",
  yemen:          "Politics",

  // Crypto — kept alone
  crypto: "Crypto",

  // Finance = business + economy
  business: "Finance",
  economy: "Finance",

  // Tech = tech + ai + science (similar audience, low individual volume)
  tech: "Tech",
  ai: "Tech",
  science: "Tech",

  // World = news + world (geo + breaking)
  news: "World",
  world: "World",

  // Culture = entertainment + pop-culture
  entertainment: "Culture",
  "pop-culture": "Culture",

  // Climate / Weather
  weather: "Climate",
  climate: "Climate",
});

/**
 * Map a market's tags to one of 8 heatmap buckets. Pure function.
 *
 * Polymarket lists tags in order from broadest (e.g. "Sports") to most
 * specific (e.g. "counter strike 2"), so we walk the array and return the
 * first slug that matches a known canonical bucket. Returns "Other" if no
 * tag is canonical.
 *
 * NOTE: requires Gamma `?include_tag=true` query param — without it the API
 * omits the `tags` field entirely.
 */
export function categorize(tags: ReadonlyArray<GammaTag> | null | undefined): Category {
  if (!tags || tags.length === 0) return "Other";
  for (const tag of tags) {
    const slug = tag.slug;
    if (!slug) continue;
    const cat = SLUG_TO_CATEGORY[slug];
    if (cat) return cat;
  }
  return "Other";
}

/** Exposed for tests / for the API to enumerate heatmap rows. */
export const CATEGORIES: ReadonlyArray<Category> = Object.freeze([
  "Sports",
  "Politics",
  "Crypto",
  "Finance",
  "Tech",
  "World",
  "Culture",
  "Climate",
  "Other",
]);

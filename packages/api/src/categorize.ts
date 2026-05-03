export type GammaTag = { label?: string };

export type Category =
  | "Sports"
  | "Politics"
  | "Crypto"
  | "Science"
  | "Finance"
  | "Culture"
  | "Weather"
  | "Other";

/**
 * Word-boundary keyword rules. Plain substring matches caused false positives
 * (e.g. "iNFLation" → Sports because it contains "nfl"), so we anchor to whole
 * words. Order matters — first matching rule wins.
 */
const RULES: ReadonlyArray<{ pattern: RegExp; category: Category }> = [
  { pattern: /\b(sports?|mlb|nba|nfl|nhl|ufc|soccer|football|tennis|golf|f1|formula|racing)\b/i, category: "Sports" },
  { pattern: /\b(politics?|election|president|senate|congress|vote|voting)\b/i, category: "Politics" },
  { pattern: /\b(crypto|bitcoin|btc|ethereum|eth|solana|sol|doge|memecoin)\b/i, category: "Crypto" },
  { pattern: /\b(science|tech|ai|space|nasa|spacex)\b/i, category: "Science" },
  { pattern: /\b(finance|economy|economic|fed|rates|inflation|stocks?|stock\s+market)\b/i, category: "Finance" },
  { pattern: /\b(culture|entertainment|music|movie|movies|film|tv|celebrity|awards?)\b/i, category: "Culture" },
  { pattern: /\b(weather|climate|hurricane|temperature|storm)\b/i, category: "Weather" },
];

/**
 * Map a list of Gamma `tags` to a coarse heatmap category. Pure function.
 * Returns "Other" when no tag matches a known keyword.
 */
export function categorize(tags: ReadonlyArray<GammaTag> | null | undefined): Category {
  if (!tags || tags.length === 0) return "Other";

  for (const tag of tags) {
    const label = tag.label;
    if (!label) continue;
    for (const rule of RULES) {
      if (rule.pattern.test(label)) return rule.category;
    }
  }

  return "Other";
}

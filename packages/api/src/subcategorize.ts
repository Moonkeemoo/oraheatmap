/**
 * Sub-categorisation: given a market's bucket (one of 8 categories) plus its
 * Polymarket tags AND its question text, pick the most specific known
 * subcategory slug for drill-down.
 *
 * Two-stage matching per rule (first hit wins, in declared order):
 *   1. tagSlug — present in market.tags (canonical Polymarket sub-tag,
 *      e.g. 'nba', 'bitcoin', 'trump'). High precision.
 *   2. questionRe — fallback regex against market_question. Catches
 *      categories Polymarket doesn't tag (e.g. continents for Climate;
 *      individual tokens for some Crypto markets that only carry the
 *      generic 'crypto' tag).
 *
 * Rules are intentionally hard-coded rather than data-driven — the set is
 * small, the priority matters, and the semantics need a human's judgment
 * (e.g. is 'AI' a Tech sub or a Finance sub? — both, but our Tech bucket
 * already swallows AI markets via category, so we don't list AI under
 * Crypto's subs even if a market mentions both).
 *
 * pure module — no I/O, easy to unit-test.
 */

import type { Category } from "./categorize";
import type { GammaTag } from "./categorize";

export type SubcategoryRule = {
  /** Internal slug; used as DB value and as URL param. Lowercase, kebab. */
  slug: string;
  /** UI display label. Title-cased. */
  label: string;
  /** Polymarket tag slug to look for in market.tags (preferred match). */
  tagSlug?: string;
  /** Word-boundary regex against market_question (fallback when no tag matches). */
  questionRe?: RegExp;
};

/**
 * Per-bucket rules. ORDER MATTERS — first matching rule wins. List
 * higher-priority/more-specific subs first.
 */
const RULES: Readonly<Record<Category, ReadonlyArray<SubcategoryRule>>> = Object.freeze({
  Sports: [
    { slug: "nba",            label: "NBA",            tagSlug: "nba" },
    { slug: "nfl",            label: "NFL",            tagSlug: "nfl" },
    { slug: "nhl",            label: "NHL",            tagSlug: "nhl" },
    { slug: "ufc",            label: "UFC",            tagSlug: "ufc" },
    { slug: "boxing",         label: "Boxing",         tagSlug: "boxing" },
    { slug: "tennis",         label: "Tennis",         tagSlug: "tennis" },
    { slug: "golf",           label: "Golf",           tagSlug: "golf" },
    { slug: "f1",             label: "F1",             tagSlug: "formula1" },
    { slug: "chess",          label: "Chess",          tagSlug: "chess" },
    { slug: "wnba",           label: "WNBA",           tagSlug: "wnba" },
    { slug: "epl",            label: "EPL",            tagSlug: "epl" },
    { slug: "champions",      label: "UCL",            tagSlug: "champions-league" },
    { slug: "soccer",         label: "Soccer",         tagSlug: "soccer" },
    { slug: "esports",        label: "Esports",        tagSlug: "esports" },
    { slug: "fantasy",        label: "Fantasy FB",     tagSlug: "fantasy-football" },
  ],
  Politics: [
    { slug: "trump",          label: "Trump",          tagSlug: "trump" },
    { slug: "us-election",    label: "US Election",    tagSlug: "us-presidential-election" },
    { slug: "elections",      label: "Elections",      tagSlug: "elections" },
    { slug: "primaries",      label: "Primaries",      tagSlug: "primaries" },
    { slug: "congress",       label: "Congress",       tagSlug: "congress" },
    { slug: "courts",         label: "Courts",         tagSlug: "courts" },
    { slug: "trump-cabinet",  label: "Trump Cabinet",  tagSlug: "trump-cabinet" },
    { slug: "indian-elections", label: "India Elec",   tagSlug: "indian-elections" },
    { slug: "global-elections", label: "Global Elec",  tagSlug: "global-elections" },
    { slug: "china",          label: "China",          tagSlug: "china" },
    { slug: "japan",          label: "Japan",          tagSlug: "japan" },
    { slug: "korea",          label: "Korea",          tagSlug: "south-korea" },
    { slug: "brazil",         label: "Brazil",         tagSlug: "brazil" },
    { slug: "venezuela",      label: "Venezuela",      tagSlug: "venezuela" },
    { slug: "canada",         label: "Canada",         tagSlug: "canada" },
  ],
  Crypto: [
    // Token-specific first (matches the user's mental model).
    { slug: "bitcoin",        label: "Bitcoin",        tagSlug: "bitcoin",      questionRe: /\b(bitcoin|btc)\b/i },
    { slug: "ethereum",       label: "Ethereum",       tagSlug: "ethereum",     questionRe: /\b(ethereum|eth)\b/i },
    { slug: "solana",         label: "Solana",         tagSlug: "solana",       questionRe: /\b(solana|sol)\b/i },
    { slug: "xrp",            label: "XRP",                                     questionRe: /\bxrp\b/i },
    { slug: "doge",           label: "Doge",                                    questionRe: /\bdoge\b/i },
    { slug: "memecoin",       label: "Memecoin",       tagSlug: "memecoin",     questionRe: /\bmemecoin\b/i },
    { slug: "stablecoins",    label: "Stablecoins",    tagSlug: "stablecoins" },
    { slug: "altcoins",       label: "Altcoins",       tagSlug: "altcoins" },
    { slug: "airdrops",       label: "Airdrops",       tagSlug: "airdrops" },
    { slug: "microstrategy",  label: "MicroStrategy",  tagSlug: "microstrategy" },
  ],
  Finance: [
    { slug: "inflation",      label: "Inflation",      tagSlug: "inflation",    questionRe: /\binflation\b/i },
    { slug: "fed-rates",      label: "Fed Rates",      tagSlug: "fed-rates",    questionRe: /\b(fed|rate cut|fomc)\b/i },
    { slug: "economy",        label: "Economy",        tagSlug: "economy" },
    { slug: "trade-war",      label: "Trade War",      tagSlug: "trade-war",    questionRe: /\btrade war|tariff/i },
    { slug: "commodities",    label: "Commodities",    tagSlug: "commodities" },
    { slug: "taxes",          label: "Taxes",          tagSlug: "taxes" },
    { slug: "etf",            label: "ETF",            tagSlug: "etf",          questionRe: /\betf\b/i },
    { slug: "stocks",         label: "Stocks",                                  questionRe: /\b(s&p|spx|nasdaq|dow|stock)\b/i },
  ],
  Tech: [
    { slug: "ai",             label: "AI",             tagSlug: "ai",           questionRe: /\b(ai|artificial intelligence)\b/i },
    { slug: "openai",         label: "OpenAI",         tagSlug: "openai" },
    { slug: "spacex",         label: "SpaceX",         tagSlug: "spacex" },
    { slug: "elon-musk",      label: "Elon Musk",      tagSlug: "elon-musk",    questionRe: /\b(elon|musk)\b/i },
    { slug: "apple",          label: "Apple",          tagSlug: "apple" },
    { slug: "big-tech",       label: "Big Tech",       tagSlug: "big-tech" },
    { slug: "ipos",           label: "IPOs",           tagSlug: "ipos",         questionRe: /\bIPO\b/i },
    { slug: "science",        label: "Science",        tagSlug: "science" },
  ],
  World: [
    { slug: "ukraine",        label: "Ukraine",        tagSlug: "ukraine",      questionRe: /\bukraine\b/i },
    { slug: "gaza",           label: "Gaza",           tagSlug: "gaza" },
    { slug: "israel",         label: "Israel",         tagSlug: "israel" },
    { slug: "iran",           label: "Iran",           tagSlug: "iran" },
    { slug: "middle-east",    label: "Middle East",    tagSlug: "middle-east" },
    { slug: "china",          label: "China",          tagSlug: "china" },
    { slug: "korea",          label: "Korea",          tagSlug: "south-korea" },
    { slug: "india-pak",      label: "India-Pak",      tagSlug: "india-pakistan" },
    { slug: "venezuela",      label: "Venezuela",      tagSlug: "venezuela" },
    { slug: "canada",         label: "Canada",         tagSlug: "canada" },
    { slug: "yemen",          label: "Yemen",          tagSlug: "yemen" },
  ],
  Culture: [
    { slug: "movies",         label: "Movies",         tagSlug: "movies" },
    { slug: "music",          label: "Music",          tagSlug: "music" },
    { slug: "awards",         label: "Awards",         tagSlug: "awards" },
    { slug: "celebrities",    label: "Celebrities",    tagSlug: "celebrities" },
    { slug: "reality-tv",     label: "Reality TV",     tagSlug: "reality-tv" },
    { slug: "eurovision",     label: "Eurovision",     tagSlug: "eurovision" },
    { slug: "taylor-swift",   label: "Taylor Swift",   tagSlug: "taylor-swift" },
    { slug: "mrbeast",        label: "MrBeast",        tagSlug: "mrbeast" },
    { slug: "gta-vi",         label: "GTA VI",         tagSlug: "gta-vi" },
    { slug: "tweets",         label: "Tweets",         tagSlug: "tweets-markets",  questionRe: /\btweets?\b/i },
  ],
  Climate: [
    // Polymarket doesn't geo-tag weather markets; matched purely by question text.
    { slug: "north-america",  label: "N. America",     questionRe: /\b(NYC|New York|Chicago|Boston|Miami|Florida|Texas|California|LA|Los Angeles|Seattle|Toronto|Vancouver|Montreal|Mexico|USA?|Canada|United States)\b/i },
    { slug: "europe",         label: "Europe",         questionRe: /\b(London|Paris|Berlin|Madrid|Barcelona|Rome|Milan|Amsterdam|Dublin|Vienna|Prague|Warsaw|Stockholm|Oslo|Copenhagen|Athens|Lisbon|Munich|Frankfurt|Edinburgh|UK|Britain|England|France|Germany|Spain|Italy|Netherlands|Sweden|Norway|Poland)\b/i },
    { slug: "asia",           label: "Asia",           questionRe: /\b(Tokyo|Beijing|Shanghai|Mumbai|Delhi|Seoul|Bangkok|Hong Kong|Singapore|Manila|Jakarta|Kuala Lumpur|Hanoi|Taipei|Osaka|Japan|China|India|Korea|Thailand|Vietnam|Indonesia|Malaysia|Philippines|Taiwan)\b/i },
    { slug: "south-america",  label: "S. America",     questionRe: /\b(Rio|Sao Paulo|São Paulo|Buenos Aires|Lima|Caracas|Bogota|Bogotá|Santiago|Brazil|Argentina|Chile|Peru|Colombia|Venezuela|Ecuador)\b/i },
    { slug: "middle-east",    label: "Middle East",    questionRe: /\b(Dubai|Riyadh|Tel Aviv|Jerusalem|Tehran|Doha|Kuwait|Beirut|Damascus|Baghdad|Israel|Iran|Saudi|UAE|Qatar|Iraq|Lebanon|Syria)\b/i },
    { slug: "africa",         label: "Africa",         questionRe: /\b(Cairo|Lagos|Nairobi|Johannesburg|Cape Town|Casablanca|Algiers|Egypt|Nigeria|Kenya|South Africa|Morocco|Algeria|Ethiopia|Ghana)\b/i },
    { slug: "oceania",        label: "Oceania",        questionRe: /\b(Sydney|Melbourne|Auckland|Wellington|Brisbane|Perth|Australia|New Zealand)\b/i },
    { slug: "global",         label: "Global",         questionRe: /\b(global|worldwide|hottest year|coldest year|sea level)\b/i },
  ],
  // Other started as a catch-all but has grown to ~110K signals/12d as of
  // 2026-05-10 (mostly stocks + commodities + war markets that don't fit
  // upstream categories). Subcategorize via question text patterns so L2
  // drill-down isn't an empty wall.
  Other: [
    // Stocks (~33% of Other) — match common ticker symbols + the word
    // "stock". Order matters: tickers are short and noisy, list them
    // exhaustively to avoid them sneaking through.
    { slug: "stocks",       label: "Stocks",       questionRe: /\b(NVDA|TSLA|AAPL|MSFT|GOOG|GOOGL|AMZN|META|NFLX|SPY|QQQ|S&P|SPX|NASDAQ|DOW|ABNB|UBER|RBLX|HOOD|PLTR|RIVN|RKLB|OPEN|COIN|FLUT|DIS|TRIP|WMB|MCHP|F|GM|RBLX|stock|stocks)\b/i },
    // Commodities (~30%) — silver/gold/oil/copper/gas etc.
    { slug: "commodities",  label: "Commodities",  questionRe: /\b(silver|gold|oil|copper|XAGUSD|XAUUSD|brent|wti|natural gas)\b/i },
    // Russia-Ukraine war (~11%) — territorial captures + cities.
    { slug: "ru-ua-war",    label: "RU/UA War",    questionRe: /\b(russia|ukraine|kyiv|moscow|kursk|donbas|crimea|capture|serhiivka|donetsk|kharkiv|kherson|lviv|odesa|odessa)\b/i },
    // Middle East (~6%) — Israel/Iran/Gaza + Strait of Hormuz markets.
    { slug: "middle-east",  label: "Middle East",  questionRe: /\b(israel|iran|palestin|gaza|hamas|hezbollah|abbas|netanyahu|tehran|jerusalem|hormuz)\b/i },
    // Earnings calls — distinct vertical worth its own bucket.
    { slug: "earnings",     label: "Earnings",     questionRe: /\bearnings\b/i },
    // IPOs.
    { slug: "ipos",         label: "IPOs",         questionRe: /\bIPO\b/i },
    // Forex.
    { slug: "forex",        label: "Forex",        questionRe: /\b(EUR\/USD|USD\/|GBP\/|JPY|forex)\b/i },
  ],
});

export function subcategoriesOf(bucket: Category): ReadonlyArray<SubcategoryRule> {
  return RULES[bucket] ?? [];
}

/**
 * Pick the most-specific subcategory for a signal. Returns the slug, or null
 * if no rule matches (signal won't appear in drill-down).
 */
export function pickSubcategory(
  bucket: Category,
  tags: ReadonlyArray<GammaTag> | null | undefined,
  marketQuestion: string | null,
): string | null {
  const rules = RULES[bucket];
  if (!rules || rules.length === 0) return null;
  for (const rule of rules) {
    if (rule.tagSlug && tags && tags.some((t) => t.slug === rule.tagSlug)) return rule.slug;
    if (rule.questionRe && marketQuestion && rule.questionRe.test(marketQuestion)) return rule.slug;
  }
  return null;
}

/** Slug → display label map for UI. */
export const SUBCATEGORY_LABELS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    Object.values(RULES).flat().map((r) => [r.slug, r.label]),
  ),
);

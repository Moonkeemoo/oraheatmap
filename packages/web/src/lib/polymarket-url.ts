/**
 * Build a polymarket.com event URL with our referral attached. Single
 * source of truth — previously this helper lived inline in Tooltip,
 * WhaleDrawer, and Grid; if the referral changed (or the URL shape did)
 * we'd have had to keep three places in sync.
 *
 * Default referral is hardcoded as a fallback so the helper still produces
 * a valid URL when running outside of Next.js (tests, scripts). Override
 * via NEXT_PUBLIC_POLYMARKET_REFERRAL at build time.
 */

const POLY_REFERRAL =
  (typeof process !== "undefined" && process.env["NEXT_PUBLIC_POLYMARKET_REFERRAL"]) || "Moonkeee";

export function marketUrl(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return `https://polymarket.com/event/${encodeURIComponent(slug)}?r=${encodeURIComponent(POLY_REFERRAL)}`;
}

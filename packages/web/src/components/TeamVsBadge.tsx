"use client";

import type { ReactElement } from "react";
import { TOKENS } from "@/lib/tokens";
import { parseVsMarket, teamAbbrev, teamColor } from "@/lib/vs-market";

/**
 * Two stacked, slightly-overlapping circular initials badges for sports
 * "Team A vs Team B" markets. We don't have per-team logos from Polymarket
 * gamma — initials + a stable hashed colour give visual differentiation
 * without an external CDN dependency.
 *
 * Returns `null` when the market doesn't look like a head-to-head matchup;
 * caller falls back to the single MarketIcon. Never gates on category — the
 * parser is strict enough that false positives on non-sports questions are
 * extremely rare ("X vs Y" outside of sports is uncommon, and we reject
 * prediction questions).
 */
export function TeamVsBadge({
  question,
  size = 22,
}: {
  question: string | null | undefined;
  size?: number;
}): ReactElement | null {
  const parsed = parseVsMarket(question);
  if (!parsed) return null;
  const { teamA, teamB } = parsed;
  // Solve for outer footprint = size: 2r − overlap = size with r/overlap
  // chosen so the second circle covers ~⅓ of the first. r = 0.6·size,
  // overlap = 0.2·size → 2(0.6) − 0.2 = 1.0 → exactly size.
  const r = Math.round(size * 0.6);
  const overlap = Math.round(size * 0.2);
  const fontPx = Math.max(7, Math.round(r * 0.5));
  const badge = (name: string, isFront: boolean): ReactElement => (
    <span
      title={name}
      style={{
        width: r,
        height: r,
        borderRadius: r,
        background: teamColor(name),
        color: "#fff",
        fontSize: fontPx,
        fontFamily: TOKENS.mono,
        fontWeight: 700,
        letterSpacing: 0.2,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: `1px solid ${TOKENS.panel}`,
        boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
        flexShrink: 0,
        marginLeft: isFront ? -overlap : 0,
        // Front badge sits on top — positive z-index inside the inline-flex
        // parent. zIndex needs `position` to take effect; relative is enough.
        position: "relative",
        zIndex: isFront ? 1 : 0,
      }}
    >
      {teamAbbrev(name)}
    </span>
  );
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        flexShrink: 0,
        // Width = first circle + (second circle minus the overlap). Caps the
        // grid column the parent reserves to ~size × 1.2.
        width: r * 2 - overlap,
        height: r,
      }}
    >
      {badge(teamA, false)}
      {badge(teamB, true)}
    </span>
  );
}

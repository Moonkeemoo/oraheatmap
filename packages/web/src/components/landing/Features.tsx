"use client";

import type { ReactNode } from "react";
import { TOKENS } from "@/lib/tokens";
import { DrillMock } from "./mocks/DrillMock";
import { LiveHeatmapMock } from "./mocks/LiveHeatmapMock";
import { PatternMock } from "./mocks/PatternMock";
import { TooltipMock } from "./mocks/TooltipMock";
import { WhaleProfileMock } from "./mocks/WhaleProfileMock";

/**
 * Four alternating-layout feature blocks. Each one is a real sketch of an
 * app capability with a small synthetic preview. Intentionally not real
 * screenshots — those bit-rot. Hand-built SVG/HTML mocks stay in sync with
 * the dark theme and read crisply at any DPI.
 */
export function Features() {
  return (
    <section id="features" style={{ padding: "80px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <SectionHeading
          eyebrow="What you get"
          title="See conviction, not just price."
          sub="Polymarket's order book tells you where the market settled. oralab tells you who pushed it there — and what they're betting next."
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 60, marginTop: 56 }}>
          <FeatureRow
            eyebrow="LIVE feed"
            title="Every trade, lit up the moment it lands."
            body="A real-time tape across 9 prediction-market categories. Four time scales — 1h, 24h, 12d, 12w. Cells coloured by PnL: green when smart money is winning, red when it's bleeding. The ‘now' column sits on the right, lit up the second a whale clicks Buy."
            visual={<LiveHeatmapMock />}
          />
          <FeatureRow
            reverse
            eyebrow="Whale dossier"
            title="The full story behind every wallet."
            body="Click any whale — get a side panel with 90-day cumulative PnL, category mix breakdown, open positions with mark-to-market, recent trades, win rate over decided exits (not over total trades — that's misleading), and Polymarket leaderboard alias with X handle and verified badge. Not just a chart — the full deep-dive."
            visual={<WhaleProfileMock />}
          />
          <FeatureRow
            eyebrow="Cyclical patterns"
            title="See when each category actually moves."
            body="Toggle from sliding-window LIVE to PATTERN to overlay 30 days of activity onto a single 24-hour clock or 7-day week. Discover that crypto whales fire 14:00–16:00 UTC. Sports activity dies on weeknights. Politics peaks on Tuesday afternoons. Find the cadence."
            visual={<PatternMock />}
          />
          <FeatureRow
            reverse
            eyebrow="One click to the source"
            title="From a hot cell to the exact market."
            body="See a category ripping? Click it. See Crypto split into Bitcoin, Solana, ETH. Click Bitcoin — see every individual market driving the move. Click a market — see its probability chart and the top whales who pushed it there. No tab-switching, no copy-pasting addresses."
            visual={<DrillMock />}
          />
          <FeatureRow
            eyebrow="Lock-and-compare"
            title="Compare any two cells, side-by-side."
            body="Hover any cell — instant breakdown: top markets, top whales, full stats, mini cycle histogram showing how this hour usually looks, probability charts at the deepest drill level. Click to lock the tooltip — then hover another cell to compare. The depth is the product."
            visual={<TooltipMock />}
          />
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Headings + row layout
// ─────────────────────────────────────────────────────────────────────────

export function SectionHeading({
  eyebrow,
  title,
  sub,
  align = "center",
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  align?: "left" | "center";
}) {
  return (
    <div style={{ textAlign: align, maxWidth: align === "center" ? 720 : "none", margin: align === "center" ? "0 auto" : 0 }}>
      {eyebrow && (
        <div
          style={{
            fontSize: 11,
            letterSpacing: 1.6,
            textTransform: "uppercase",
            color: TOKENS.accent,
            fontWeight: 700,
            marginBottom: 14,
            fontFamily: TOKENS.mono,
          }}
        >
          {eyebrow}
        </div>
      )}
      <h2
        style={{
          fontSize: 44,
          margin: 0,
          letterSpacing: -1,
          lineHeight: 1.1,
          fontWeight: 700,
          color: TOKENS.text,
          fontFamily: '"Space Grotesk", -apple-system, sans-serif',
        }}
        className="section-h2"
      >
        {title}
      </h2>
      {sub && (
        <p
          style={{
            margin: "16px auto 0",
            fontSize: 17,
            lineHeight: 1.55,
            color: TOKENS.textSec,
            maxWidth: 600,
          }}
        >
          {sub}
        </p>
      )}
      <style>{`
        @media (max-width: 600px) {
          .section-h2 { font-size: 32px !important; }
        }
      `}</style>
    </div>
  );
}

function FeatureRow({
  eyebrow,
  title,
  body,
  visual,
  reverse,
}: {
  eyebrow: string;
  title: string;
  body: string;
  visual: ReactNode;
  reverse?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 56,
        alignItems: "center",
        direction: reverse ? "rtl" : "ltr",
      }}
      className="feature-row"
    >
      <div style={{ direction: "ltr" }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            color: TOKENS.accent,
            fontWeight: 700,
            marginBottom: 12,
            fontFamily: TOKENS.mono,
          }}
        >
          {eyebrow}
        </div>
        <h3
          style={{
            fontSize: 30,
            margin: 0,
            letterSpacing: -0.6,
            lineHeight: 1.15,
            fontWeight: 700,
            color: TOKENS.text,
            fontFamily: '"Space Grotesk", -apple-system, sans-serif',
          }}
          className="feature-h3"
        >
          {title}
        </h3>
        <p
          style={{
            margin: "16px 0 0",
            fontSize: 16,
            lineHeight: 1.6,
            color: TOKENS.textSec,
            maxWidth: 520,
          }}
        >
          {body}
        </p>
      </div>
      <div style={{ direction: "ltr" }}>{visual}</div>
      <style>{`
        @media (max-width: 900px) {
          .feature-row { grid-template-columns: 1fr !important; gap: 32px !important; direction: ltr !important; }
          .feature-h3 { font-size: 26px !important; }
        }
      `}</style>
    </div>
  );
}


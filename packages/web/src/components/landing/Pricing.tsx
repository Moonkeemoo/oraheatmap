"use client";

import Link from "next/link";
import { TOKENS } from "@/lib/tokens";
import { SectionHeading } from "./Features";

type Tier = {
  name: string;
  tag?: string;
  price: string;
  priceSub?: string;
  cta: string;
  ctaHref: string;
  features: ReadonlyArray<string>;
  highlight?: boolean;
  ctaDisabled?: boolean;
};

const FREE_ANON: Tier = {
  name: "Anonymous",
  price: "Free",
  priceSub: "no signup",
  cta: "Open heatmap",
  ctaHref: "/app",
  features: [
    "Live 24h heatmap, by volume",
    "Top-level categories only",
    "Real-time signal ticker",
    "Public Privacy / Terms / Receipts",
  ],
};

const FREE_AUTH: Tier = {
  name: "Free",
  price: "$0",
  priceSub: "after sign-in",
  cta: "Sign in to unlock",
  ctaHref: "/app",
  features: [
    "All 4 ranges · 1h / 24h / 12d / 12w",
    "All 4 metrics · PnL · Volume · Signals · Win rate",
    "PATTERN mode · daily + weekly cycles",
    "Drill L1 → L2 (subcategories)",
    "Whale drawer with 90-day balance",
    "Drag-to-reorder, persisted",
    "SSE live ticker",
  ],
};

const PRO: Tier = {
  name: "Pro",
  tag: "coming v1.7",
  price: "$9",
  priceSub: "per month · or $79/year",
  cta: "Notify me",
  ctaHref: "/app",
  ctaDisabled: true,
  features: [
    "Everything in Free, plus:",
    "Drill L3 (per-market view)",
    "WHALES convergence metric",
    "Top whales in each cell · click to drawer",
    "Probability charts in market tooltips",
    "PATTERN cycle histograms",
    "Telegram alerts on N+ whale convergence",
    "Receipts page · resolved past signals",
    "Realized-PnL leaderboard on our 7d/30d/90d window",
  ],
  highlight: true,
};

export function Pricing() {
  return (
    <section id="pricing" style={{ padding: "80px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <SectionHeading
          eyebrow="Pricing"
          title="Free for the basics. $9 when you want it sharp."
          sub="The data underneath stays the same — Pro unlocks the deepest views and the alerts. Pricing reads as one Polymarket position size, not a SaaS subscription."
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 20,
            marginTop: 48,
            alignItems: "stretch",
          }}
          className="price-grid"
        >
          <TierCard t={FREE_ANON} />
          <TierCard t={FREE_AUTH} />
          <TierCard t={PRO} />
        </div>
      </div>
      <style>{`
        @media (max-width: 980px) {
          .price-grid { grid-template-columns: 1fr !important; gap: 16px !important; }
        }
      `}</style>
    </section>
  );
}

function TierCard({ t }: { t: Tier }) {
  return (
    <div
      style={{
        background: t.highlight ? TOKENS.panel : TOKENS.panel2,
        border: `1px solid ${t.highlight ? TOKENS.accent : TOKENS.border}`,
        borderRadius: 14,
        padding: 28,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        boxShadow: t.highlight ? "0 20px 60px rgba(240,180,41,0.12)" : "none",
      }}
    >
      {t.tag && (
        <div
          style={{
            position: "absolute",
            top: -10,
            right: 18,
            background: TOKENS.accent,
            color: "#1a1410",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            padding: "3px 9px",
            borderRadius: 999,
            fontFamily: TOKENS.mono,
          }}
        >
          {t.tag}
        </div>
      )}
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: TOKENS.textSec,
          marginBottom: 10,
        }}
      >
        {t.name}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            fontSize: 38,
            fontWeight: 700,
            color: TOKENS.text,
            letterSpacing: -1,
            fontFamily: '"Space Grotesk", -apple-system, sans-serif',
            lineHeight: 1,
          }}
        >
          {t.price}
        </span>
        {t.priceSub && (
          <span style={{ fontSize: 12, color: TOKENS.textMuted, fontFamily: TOKENS.mono }}>
            {t.priceSub}
          </span>
        )}
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: "22px 0 24px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        {t.features.map((f, i) => (
          <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, lineHeight: 1.45, color: TOKENS.textSec }}>
            <span style={{ color: t.highlight ? TOKENS.accent : TOKENS.pos, fontWeight: 700, marginTop: 1 }}>✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        href={t.ctaHref}
        aria-disabled={t.ctaDisabled}
        style={{
          display: "block",
          textAlign: "center",
          background: t.highlight ? TOKENS.accent : "transparent",
          color: t.highlight ? "#1a1410" : TOKENS.text,
          border: t.highlight ? "none" : `1px solid ${TOKENS.borderHi}`,
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: 0.3,
          padding: "13px 18px",
          borderRadius: 9,
          textDecoration: "none",
          opacity: t.ctaDisabled ? 0.5 : 1,
          pointerEvents: t.ctaDisabled ? "none" : "auto",
          transition: "filter .12s, transform .12s",
        }}
        onMouseEnter={(e) => {
          if (t.ctaDisabled) return;
          (e.currentTarget as HTMLAnchorElement).style.filter = "brightness(1.1)";
          (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-1px)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.filter = "none";
          (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)";
        }}
      >
        {t.cta}
      </Link>
    </div>
  );
}

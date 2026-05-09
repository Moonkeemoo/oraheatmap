"use client";

import Link from "next/link";
import { track } from "@/lib/analytics";
import { TOKENS } from "@/lib/tokens";
import { HeroVisual } from "./HeroVisual";

export function Hero() {
  return (
    <section
      style={{
        position: "relative",
        padding: "72px 24px 40px",
        overflow: "hidden",
      }}
    >
      {/* ambient glow */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: -200,
          right: -200,
          width: 700,
          height: 700,
          background:
            "radial-gradient(closest-side, rgba(240,180,41,0.18), rgba(240,180,41,0.04) 60%, transparent 100%)",
          pointerEvents: "none",
          filter: "blur(8px)",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: -200,
          left: -200,
          width: 700,
          height: 700,
          background:
            "radial-gradient(closest-side, rgba(63,185,80,0.12), rgba(63,185,80,0.03) 60%, transparent 100%)",
          pointerEvents: "none",
          filter: "blur(8px)",
        }}
      />

      <div
        style={{
          maxWidth: 1320,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.35fr)",
          gap: 48,
          alignItems: "center",
          position: "relative",
        }}
        className="hero-grid"
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 11px",
              borderRadius: 999,
              background: "rgba(63,185,80,0.08)",
              border: "1px solid rgba(63,185,80,0.25)",
              color: TOKENS.pos,
              fontSize: 11,
              letterSpacing: 0.4,
              fontFamily: TOKENS.mono,
              fontWeight: 600,
              marginBottom: 26,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 6,
                background: TOKENS.pos,
                boxShadow: `0 0 8px ${TOKENS.pos}`,
              }}
            />
            The Nansen of Polymarket
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 60,
              lineHeight: 1.04,
              letterSpacing: -1.2,
              fontWeight: 700,
              color: TOKENS.text,
              fontFamily: '"Space Grotesk", -apple-system, BlinkMacSystemFont, sans-serif',
            }}
            className="hero-h1"
          >
            10,426 Polymarket
            <br />
            millionaires.{" "}
            <span
              style={{
                background:
                  "linear-gradient(90deg, #f0b429 0%, #ffd762 45%, #3fb950 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Every trade. Live.
            </span>
          </h1>
          <p
            style={{
              margin: "24px 0 32px",
              fontSize: 18,
              lineHeight: 1.55,
              color: TOKENS.textSec,
              maxWidth: 540,
            }}
          >
            Real-time <strong style={{ color: TOKENS.text }}>Polymarket whale tracker</strong>{" "}
            with smart-money signals across 9 prediction-market categories. Live PnL heatmap,
            convergence alerts, whale dossier with 90-day balance, drill from a hot cell to
            the markets driving it. The only{" "}
            <strong style={{ color: TOKENS.text }}>prediction-market</strong> dashboard built
            for traders who already trade Polymarket.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <Link
              href="/app"
              onClick={() => track.heroCtaClicked("heatmap")}
              style={{
                background: TOKENS.accent,
                color: "#1a1410",
                fontWeight: 800,
                fontSize: 14,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                padding: "16px 30px",
                borderRadius: 10,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                transition: "filter .12s, transform .12s, box-shadow .12s",
                boxShadow: "0 10px 28px rgba(240,180,41,0.25)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.filter = "brightness(1.08)";
                (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.filter = "none";
                (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)";
              }}
            >
              Open the heatmap
              <span aria-hidden="true">→</span>
            </Link>
            <Link
              href="#how"
              onClick={() => track.heroCtaClicked("how_it_works")}
              style={{
                color: TOKENS.text,
                background: "transparent",
                border: `1px solid ${TOKENS.borderHi}`,
                fontWeight: 600,
                fontSize: 13,
                letterSpacing: 0.2,
                padding: "16px 22px",
                borderRadius: 10,
                textDecoration: "none",
                transition: "background .12s, border-color .12s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background = TOKENS.panel;
                (e.currentTarget as HTMLAnchorElement).style.borderColor = TOKENS.textMuted;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
                (e.currentTarget as HTMLAnchorElement).style.borderColor = TOKENS.borderHi;
              }}
            >
              How it works
            </Link>
          </div>
          <div
            style={{
              marginTop: 24,
              fontSize: 12,
              color: TOKENS.textMuted,
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span style={{ opacity: 0.7 }}>✓</span>
            <span>No signup needed for the basic view · Free forever</span>
            <span aria-hidden="true" style={{ opacity: 0.4 }}>·</span>
            <a
              href="https://t.me/Oralab_bot"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track.heroCtaClicked("telegram")}
              style={{
                color: TOKENS.textSec,
                textDecoration: "none",
                borderBottom: `1px dotted ${TOKENS.textMuted}`,
                paddingBottom: 1,
                transition: "color .12s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = TOKENS.text;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = TOKENS.textSec;
              }}
            >
              Or open in Telegram ↗
            </a>
          </div>
        </div>

        <HeroVisual />
      </div>

      <style>{`
        @media (max-width: 980px) {
          .hero-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
          .hero-h1 { font-size: 48px !important; }
        }
        @media (max-width: 600px) {
          .hero-h1 { font-size: 38px !important; letter-spacing: -0.8px !important; }
        }
      `}</style>
    </section>
  );
}

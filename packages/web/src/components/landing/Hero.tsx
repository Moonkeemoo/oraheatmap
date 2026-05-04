"use client";

import Link from "next/link";
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
          maxWidth: 1200,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.05fr)",
          gap: 56,
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
            10,426 wallets · streaming live
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 64,
              lineHeight: 1.04,
              letterSpacing: -1.2,
              fontWeight: 700,
              color: TOKENS.text,
              fontFamily: '"Space Grotesk", -apple-system, BlinkMacSystemFont, sans-serif',
            }}
            className="hero-h1"
          >
            When whales move,
            <br />
            <span
              style={{
                background:
                  "linear-gradient(90deg, #f0b429 0%, #ffd762 45%, #3fb950 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              you see it.
            </span>
          </h1>
          <p
            style={{
              margin: "24px 0 32px",
              fontSize: 18,
              lineHeight: 1.55,
              color: TOKENS.textSec,
              maxWidth: 520,
            }}
          >
            oralab is a real-time heatmap of every Polymarket trade from the
            top <strong style={{ color: TOKENS.text }}>10,426 wallets</strong> by all-time PnL.
            Categorized, drillable, charted from a 90-day track record.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <Link
              href="/app"
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
            }}
          >
            <span style={{ opacity: 0.7 }}>✓</span>
            No signup needed for the basic view · Free forever
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

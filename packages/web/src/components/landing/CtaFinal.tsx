"use client";

import Link from "next/link";
import { TOKENS } from "@/lib/tokens";

export function CtaFinal() {
  return (
    <section style={{ padding: "100px 24px", position: "relative", overflow: "hidden" }}>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 50% 50%, rgba(240,180,41,0.10), transparent 60%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          textAlign: "center",
          position: "relative",
        }}
      >
        <h2
          style={{
            fontSize: 48,
            margin: 0,
            letterSpacing: -1,
            lineHeight: 1.1,
            fontWeight: 700,
            color: TOKENS.text,
            fontFamily: '"Space Grotesk", -apple-system, sans-serif',
          }}
          className="cta-h2"
        >
          See what whales are doing
          <br />
          <span
            style={{
              background: "linear-gradient(90deg, #f0b429 0%, #ffd762 50%, #3fb950 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            in the next 60 seconds.
          </span>
        </h2>
        <p
          style={{
            margin: "20px auto 32px",
            fontSize: 17,
            lineHeight: 1.55,
            color: TOKENS.textSec,
            maxWidth: 540,
          }}
        >
          Free, no signup needed for the basic view. Sign-in unlocks all ranges,
          metrics, and the whale drawer — also free.
        </p>
        <Link
          href="/app"
          style={{
            background: TOKENS.accent,
            color: "#1a1410",
            fontWeight: 800,
            fontSize: 14,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            padding: "18px 36px",
            borderRadius: 10,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            transition: "filter .12s, transform .12s",
            boxShadow: "0 14px 36px rgba(240,180,41,0.32)",
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
        <div style={{ marginTop: 18, fontSize: 12, color: TOKENS.textMuted }}>
          oralab.xyz · streaming live since 2026
        </div>
      </div>
      <style>{`
        @media (max-width: 600px) {
          .cta-h2 { font-size: 32px !important; }
        }
      `}</style>
    </section>
  );
}

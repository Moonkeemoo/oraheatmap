"use client";

import Link from "next/link";

import { BrandLogo } from "@/components/BrandLogo";
import { Footer } from "@/components/Footer";
import { TOKENS } from "@/lib/tokens";

/**
 * Minimal placeholder landing — full marketing page is planned (see
 * docs/LANDING_PLAN.md). For now: brand mark + one-line pitch + CTA into
 * the heatmap. Existing users with /-bookmarks still get a single click
 * to the app, new visitors get a clear "this is what it is" moment.
 */
export default function LandingPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: TOKENS.bg,
        color: TOKENS.text,
        fontFamily: TOKENS.font,
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, maxWidth: 720, padding: 24, margin: "0 auto", textAlign: "center" }}>
        <BrandLogo size="hero" />
        <p
          style={{
            margin: 0,
            fontSize: 18,
            lineHeight: 1.5,
            color: TOKENS.textSec,
            maxWidth: 560,
          }}
        >
          Real-time map of where Polymarket whales are putting money. 10,000+ top traders
          tracked, every trade, every category, every minute.
        </p>
        <Link
          href="/app"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            background: TOKENS.accent,
            color: "#1a1410",
            fontWeight: 800,
            fontSize: 14,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            padding: "14px 28px",
            borderRadius: 8,
            textDecoration: "none",
            transition: "filter .12s, transform .12s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.filter = "brightness(1.1)";
            (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.filter = "none";
            (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)";
          }}
        >
          Open heatmap →
        </Link>
      </div>
      <Footer />
    </main>
  );
}

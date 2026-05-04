"use client";

import Link from "next/link";
import { TOKENS } from "@/lib/tokens";

/**
 * Footer for landing + legal pages. Skipped on /app because the heatmap
 * is a fullscreen tool — legal docs are still indexable from the public
 * routes and that's what OAuth providers / regulators check.
 */
export function Footer() {
  const linkStyle: React.CSSProperties = {
    color: TOKENS.textSec,
    textDecoration: "none",
    fontSize: 12,
    transition: "color .12s",
  };
  return (
    <footer
      style={{
        width: "100%",
        padding: "20px 24px 24px",
        borderTop: `1px solid ${TOKENS.border}`,
        color: TOKENS.textMuted,
        fontFamily: TOKENS.font,
        fontSize: 12,
        boxSizing: "border-box",
        marginTop: "auto",
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <span style={{ color: TOKENS.textMuted }}>
          © {new Date().getFullYear()} oralab · Not affiliated with Polymarket.
        </span>
        <nav style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <Link href="/" style={linkStyle}>Home</Link>
          <Link href="/app" style={linkStyle}>App</Link>
          <Link href="/privacy" style={linkStyle}>Privacy</Link>
          <Link href="/terms" style={linkStyle}>Terms</Link>
        </nav>
      </div>
    </footer>
  );
}

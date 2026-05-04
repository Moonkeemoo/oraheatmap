"use client";

import Link from "next/link";
import { TOKENS } from "@/lib/tokens";

/**
 * Footer for landing, legal pages, and the app shell. Two visual modes:
 *
 *  - default: two-row, padded, used on landing + /privacy + /terms.
 *  - compact: single thin strip — used on /app where every pixel of grid
 *    real estate matters but legal links still need to be reachable from
 *    a bookmarked /app entry point.
 */
export function Footer({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <footer
        style={{
          width: "100%",
          padding: "6px 16px",
          borderTop: `1px solid ${TOKENS.border}`,
          background: TOKENS.bg,
          color: TOKENS.textMuted,
          fontFamily: TOKENS.font,
          fontSize: 10,
          textAlign: "center",
          boxSizing: "border-box",
          flexShrink: 0,
        }}
      >
        © {new Date().getFullYear()} oralab ·{" "}
        <Link href="/privacy" style={compactLink}>Privacy</Link> ·{" "}
        <Link href="/terms" style={compactLink}>Terms</Link> · Not affiliated with Polymarket
      </footer>
    );
  }
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
          <Link href="/" style={fullLink}>Home</Link>
          <Link href="/app" style={fullLink}>App</Link>
          <Link href="/privacy" style={fullLink}>Privacy</Link>
          <Link href="/terms" style={fullLink}>Terms</Link>
        </nav>
      </div>
    </footer>
  );
}

const fullLink: React.CSSProperties = {
  color: TOKENS.textSec,
  textDecoration: "none",
  fontSize: 12,
  transition: "color .12s",
};

const compactLink: React.CSSProperties = {
  color: TOKENS.textSec,
  textDecoration: "none",
};

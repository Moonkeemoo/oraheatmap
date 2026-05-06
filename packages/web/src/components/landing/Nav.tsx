"use client";

import { useEffect } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { initAnalytics } from "@/lib/analytics";
import { TOKENS } from "@/lib/tokens";

/**
 * Landing nav — intentionally minimal. Single CTA → /app where Sign-in
 * and the burger menu live inside the dashboard chrome, so duplicating
 * them here only added visual noise without giving the user a different
 * destination.
 *
 * Doubles as the landing's analytics entrypoint: initAnalytics fires
 * here on mount so /  pageviews + sessions register the same way the
 * /app + /tg routes do (those init via Heatmap's own useEffect).
 * Without this every visitor that lands on oralab.xyz but doesn't
 * click "Open App" is invisible to our funnel.
 */
export function Nav() {
  useEffect(() => {
    initAnalytics();
  }, []);

  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: "rgba(13, 17, 23, 0.78)",
        backdropFilter: "saturate(180%) blur(12px)",
        WebkitBackdropFilter: "saturate(180%) blur(12px)",
        borderBottom: `1px solid ${TOKENS.border}`,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <Link href="/" style={{ textDecoration: "none", display: "inline-flex" }}>
          <BrandLogo size="compact" />
        </Link>
        <Link
          href="/app"
          style={{
            background: TOKENS.accent,
            color: "#1a1410",
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            padding: "9px 16px",
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
          Open heatmap
        </Link>
      </div>
    </nav>
  );
}

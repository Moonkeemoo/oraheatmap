"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { TOKENS } from "@/lib/tokens";

export function Nav() {
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
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Link
            href="/app"
            style={{
              color: TOKENS.textSec,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: 0.2,
            }}
          >
            Sign in
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
      </div>
    </nav>
  );
}

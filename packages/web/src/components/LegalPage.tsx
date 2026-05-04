"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { Footer } from "@/components/Footer";
import { TOKENS } from "@/lib/tokens";

/**
 * Shared shell for /privacy and /terms — narrow column of prose with the
 * brand mark on top. Same dark palette as the rest of the app so users
 * don't get visually shipped to a different product.
 */
export function LegalPage({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: TOKENS.bg,
        color: TOKENS.text,
        fontFamily: TOKENS.font,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          padding: "20px 24px",
          borderBottom: `1px solid ${TOKENS.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <Link href="/" style={{ textDecoration: "none" }}>
          <BrandLogo size="compact" />
        </Link>
        <Link
          href="/app"
          style={{
            color: TOKENS.link,
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Open heatmap →
        </Link>
      </header>

      <article
        style={{
          maxWidth: 760,
          width: "100%",
          margin: "0 auto",
          padding: "40px 24px 60px",
          fontSize: 15,
          lineHeight: 1.65,
          color: TOKENS.text,
          flex: 1,
        }}
      >
        <h1 style={{ fontSize: 32, fontWeight: 700, margin: "0 0 6px", letterSpacing: -0.5 }}>
          {title}
        </h1>
        <p style={{ color: TOKENS.textMuted, fontSize: 13, margin: "0 0 28px" }}>
          Last updated {lastUpdated}
        </p>
        {children}
      </article>

      <Footer />
    </main>
  );
}

export function H2({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 20,
        fontWeight: 700,
        margin: "32px 0 10px",
        color: TOKENS.text,
        letterSpacing: -0.2,
      }}
    >
      {children}
    </h2>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p style={{ margin: "0 0 14px", color: TOKENS.textSec }}>{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return (
    <ul style={{ margin: "0 0 14px", paddingLeft: 22, color: TOKENS.textSec }}>{children}</ul>
  );
}

export function LI({ children }: { children: ReactNode }) {
  return <li style={{ marginBottom: 6 }}>{children}</li>;
}

export function Strong({ children }: { children: ReactNode }) {
  return <strong style={{ color: TOKENS.text, fontWeight: 600 }}>{children}</strong>;
}

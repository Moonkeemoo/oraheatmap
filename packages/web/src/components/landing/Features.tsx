"use client";

import type { ReactNode } from "react";
import { TOKENS } from "@/lib/tokens";

/**
 * Four alternating-layout feature blocks. Each one is a real sketch of an
 * app capability with a small synthetic preview. Intentionally not real
 * screenshots — those bit-rot. Hand-built SVG/HTML mocks stay in sync with
 * the dark theme and read crisply at any DPI.
 */
export function Features() {
  return (
    <section id="features" style={{ padding: "80px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <SectionHeading
          eyebrow="What you get"
          title="See conviction, not just price."
          sub="Polymarket's order book tells you where the market settled. oralab tells you who pushed it there — and what they're betting next."
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 60, marginTop: 56 }}>
          <FeatureRow
            eyebrow="LIVE mode · the default"
            title="Live heatmap, refreshed in seconds."
            body="Every trade, every category, every minute. Four time scales — 1h, 24h, 12 days, 12 weeks. Click a cell to drill into the markets driving it. Click a market to see the whales driving that."
            visual={<LiveHeatmapMock />}
          />
          <FeatureRow
            reverse
            eyebrow="PATTERN mode · v1.1"
            title="Cyclical view — see the rhythm."
            body="Toggle from sliding-window LIVE to PATTERN to overlay 30 days of activity onto the same 24-hour clock or 7-day week. Whales fire 14:00–16:00 UTC. Sports activity dies on weeknights. Find the cadence."
            visual={<PatternMock />}
          />
          <FeatureRow
            eyebrow="Whale profiles · v1.4"
            title="90-day balance curves per whale."
            body="Click any wallet → side panel with cumulative realized PnL, open positions with mark-to-market, recent trades, and win rate over decided exits — not over total trades. Aliases pulled from Polymarket's leaderboard."
            visual={<WhaleProfileMock />}
          />
          <FeatureRow
            reverse
            eyebrow="Drill-down · v1.2"
            title="Category → subcategory → market."
            body="Click Crypto → see Bitcoin, Solana, ETH separately. Click Bitcoin → see the actual markets — each row is one market with top whales and probability charts in the tooltip."
            visual={<DrillMock />}
          />
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Headings + row layout
// ─────────────────────────────────────────────────────────────────────────

export function SectionHeading({
  eyebrow,
  title,
  sub,
  align = "center",
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  align?: "left" | "center";
}) {
  return (
    <div style={{ textAlign: align, maxWidth: align === "center" ? 720 : "none", margin: align === "center" ? "0 auto" : 0 }}>
      {eyebrow && (
        <div
          style={{
            fontSize: 11,
            letterSpacing: 1.6,
            textTransform: "uppercase",
            color: TOKENS.accent,
            fontWeight: 700,
            marginBottom: 14,
            fontFamily: TOKENS.mono,
          }}
        >
          {eyebrow}
        </div>
      )}
      <h2
        style={{
          fontSize: 44,
          margin: 0,
          letterSpacing: -1,
          lineHeight: 1.1,
          fontWeight: 700,
          color: TOKENS.text,
          fontFamily: '"Space Grotesk", -apple-system, sans-serif',
        }}
        className="section-h2"
      >
        {title}
      </h2>
      {sub && (
        <p
          style={{
            margin: "16px auto 0",
            fontSize: 17,
            lineHeight: 1.55,
            color: TOKENS.textSec,
            maxWidth: 600,
          }}
        >
          {sub}
        </p>
      )}
      <style>{`
        @media (max-width: 600px) {
          .section-h2 { font-size: 32px !important; }
        }
      `}</style>
    </div>
  );
}

function FeatureRow({
  eyebrow,
  title,
  body,
  visual,
  reverse,
}: {
  eyebrow: string;
  title: string;
  body: string;
  visual: ReactNode;
  reverse?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 56,
        alignItems: "center",
        direction: reverse ? "rtl" : "ltr",
      }}
      className="feature-row"
    >
      <div style={{ direction: "ltr" }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            color: TOKENS.accent,
            fontWeight: 700,
            marginBottom: 12,
            fontFamily: TOKENS.mono,
          }}
        >
          {eyebrow}
        </div>
        <h3
          style={{
            fontSize: 30,
            margin: 0,
            letterSpacing: -0.6,
            lineHeight: 1.15,
            fontWeight: 700,
            color: TOKENS.text,
            fontFamily: '"Space Grotesk", -apple-system, sans-serif',
          }}
          className="feature-h3"
        >
          {title}
        </h3>
        <p
          style={{
            margin: "16px 0 0",
            fontSize: 16,
            lineHeight: 1.6,
            color: TOKENS.textSec,
            maxWidth: 520,
          }}
        >
          {body}
        </p>
      </div>
      <div style={{ direction: "ltr" }}>{visual}</div>
      <style>{`
        @media (max-width: 900px) {
          .feature-row { grid-template-columns: 1fr !important; gap: 32px !important; direction: ltr !important; }
          .feature-h3 { font-size: 26px !important; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Visual mocks
// ─────────────────────────────────────────────────────────────────────────

function MockShell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: TOKENS.panel,
        border: `1px solid ${TOKENS.borderHi}`,
        borderRadius: 12,
        padding: 14,
        boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

function LiveHeatmapMock() {
  const rows: ReadonlyArray<{ label: string; color: string }> = [
    { label: "POLITICS", color: "#58a6ff" },
    { label: "SPORTS",   color: "#3fb950" },
    { label: "CRYPTO",   color: "#f0b429" },
    { label: "FINANCE",  color: "#a78bfa" },
  ];
  return (
    <MockShell>
      <div style={{ fontSize: 9, color: TOKENS.textMuted, fontFamily: TOKENS.mono, marginBottom: 8, letterSpacing: 0.5, textTransform: "uppercase" }}>
        LIVE · 24h · volume
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "70px repeat(12, 1fr)", gap: 3 }}>
        {rows.map((r, ri) => (
          <Row key={r.label} row={r} ri={ri} />
        ))}
      </div>
    </MockShell>
  );

  function Row({ row, ri }: { row: { label: string; color: string }; ri: number }) {
    return (
      <>
        <div
          style={{
            background: row.color,
            color: "#fff",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 0.5,
            display: "flex",
            alignItems: "center",
            paddingLeft: 8,
            borderRadius: 3,
            height: 26,
          }}
        >
          {row.label}
        </div>
        {Array.from({ length: 12 }).map((_, i) => {
          const recency = (i + 1) / 12;
          const phase = (Math.sin(ri * 1.3 + i * 0.5) + 1) / 2;
          const alpha = Math.min(1, 0.18 + recency * 0.6 + phase * 0.25);
          return (
            <div
              key={i}
              style={{
                height: 26,
                borderRadius: 3,
                background: row.color,
                opacity: alpha,
              }}
            />
          );
        })}
      </>
    );
  }
}

function PatternMock() {
  return (
    <MockShell>
      <div style={{ fontSize: 9, color: TOKENS.textMuted, fontFamily: TOKENS.mono, marginBottom: 8, letterSpacing: 0.5, textTransform: "uppercase" }}>
        PATTERN · HOUR · 30-day average
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "70px repeat(12, 1fr)", gap: 3 }}>
        {[
          { label: "POLITICS", color: "#58a6ff" },
          { label: "CRYPTO",   color: "#f0b429" },
          { label: "SPORTS",   color: "#3fb950" },
        ].map((row, ri) => (
          <PatternRow key={row.label} row={row} ri={ri} />
        ))}
      </div>
      <div style={{ fontSize: 10, color: TOKENS.textMuted, fontFamily: TOKENS.mono, marginTop: 8, display: "flex", justifyContent: "space-between" }}>
        <span>00 UTC</span>
        <span>14 UTC ⤴ peak</span>
        <span>22 UTC</span>
      </div>
    </MockShell>
  );

  function PatternRow({ row, ri }: { row: { label: string; color: string }; ri: number }) {
    return (
      <>
        <div
          style={{
            background: row.color,
            color: "#fff",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 0.5,
            display: "flex",
            alignItems: "center",
            paddingLeft: 8,
            borderRadius: 3,
            height: 26,
          }}
        >
          {row.label}
        </div>
        {Array.from({ length: 12 }).map((_, i) => {
          // Pattern peaks mid-day (i around 7) — simulated bell curve.
          const dist = Math.abs(i - 7) / 7;
          const bell = 1 - dist * dist;
          const noise = (Math.sin(ri * 1.7 + i * 0.9) + 1) / 2 * 0.15;
          const alpha = Math.max(0.08, bell * 0.85 + noise);
          return (
            <div
              key={i}
              style={{
                height: 26,
                borderRadius: 3,
                background: row.color,
                opacity: alpha,
              }}
            />
          );
        })}
      </>
    );
  }
}

function WhaleProfileMock() {
  // Synthetic balance curve — visually credible, ends positive.
  const points = [0, 8, 5, 14, 22, 18, 30, 41, 38, 55, 62, 70, 84];
  const max = Math.max(...points);
  const min = Math.min(...points, 0);
  const W = 280;
  const H = 80;
  const xOf = (i: number): number => (i / (points.length - 1)) * W;
  const yOf = (v: number): number => H - ((v - min) / (max - min)) * H;
  const path = points.map((v, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  const area = `${path} L${W},${H} L0,${H} Z`;

  return (
    <MockShell>
      {/* drawer header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 10, borderBottom: `1px solid ${TOKENS.border}` }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 36,
            background: "linear-gradient(135deg, #f0b429, #f85149)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#1a1410",
            fontSize: 13,
            fontWeight: 700,
            fontFamily: TOKENS.mono,
          }}
        >
          T4
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TOKENS.text }}>Theo4 ✓</div>
          <div style={{ fontSize: 10, color: TOKENS.textMuted, fontFamily: TOKENS.mono }}>0xa1b2…f9c3</div>
        </div>
      </div>
      {/* stat row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, padding: "10px 0" }}>
        {[
          { label: "Signals", value: "412", color: TOKENS.text },
          { label: "Volume",  value: "$2.1M", color: TOKENS.text },
          { label: "PnL",     value: "+$84k", color: TOKENS.pos },
          { label: "Win",     value: "62%",   color: TOKENS.pos },
        ].map((s) => (
          <div key={s.label}>
            <div style={{ fontSize: 8, letterSpacing: 0.5, textTransform: "uppercase", color: TOKENS.textMuted, fontWeight: 700 }}>{s.label}</div>
            <div style={{ fontSize: 14, color: s.color, fontWeight: 700, marginTop: 2, fontFamily: TOKENS.mono }}>{s.value}</div>
          </div>
        ))}
      </div>
      {/* balance chart */}
      <div style={{ fontSize: 8, letterSpacing: 0.5, textTransform: "uppercase", color: TOKENS.textMuted, fontWeight: 700, marginTop: 4, marginBottom: 4 }}>
        Balance growth · 90 days
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        <path d={area} fill="rgba(63,185,80,0.18)" />
        <path d={path} fill="none" stroke={TOKENS.pos} strokeWidth={1.6} strokeLinejoin="round" />
        <circle cx={xOf(points.length - 1)} cy={yOf(points[points.length - 1]!)} r={2.5} fill={TOKENS.pos} />
      </svg>
    </MockShell>
  );
}

function DrillMock() {
  // L1 → L2 → L3 breadcrumb with synthetic rows
  return (
    <MockShell>
      <div style={{ fontSize: 10, color: TOKENS.textMuted, fontFamily: TOKENS.mono, marginBottom: 10 }}>
        Crypto <span style={{ color: TOKENS.textSec }}>›</span> Bitcoin <span style={{ color: TOKENS.text }}>›</span> Markets
      </div>
      {[
        { q: "Bitcoin Up or Down · 2:30PM ET",        v: "$148.2k", a: 0.95 },
        { q: "Will BTC close above $112k on May 30?", v: "$92.4k",  a: 0.78 },
        { q: "BTC reach $120k in May 2026?",          v: "$54.1k",  a: 0.55 },
        { q: "Bitcoin Up or Down · 3:00PM ET",        v: "$31.8k",  a: 0.40 },
      ].map((m, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            alignItems: "center",
            gap: 10,
            padding: "8px 10px",
            background: TOKENS.panel2,
            borderRadius: 6,
            marginBottom: 6,
            borderLeft: `3px solid ${TOKENS.accent}`,
            opacity: m.a,
          }}
        >
          <span style={{ fontSize: 12, color: TOKENS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {m.q}
          </span>
          <span style={{ fontSize: 11, color: TOKENS.textSec, fontFamily: TOKENS.mono }}>{m.v}</span>
        </div>
      ))}
    </MockShell>
  );
}

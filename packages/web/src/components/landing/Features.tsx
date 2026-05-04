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
            eyebrow="LIVE feed"
            title="Every trade, lit up the moment it lands."
            body="A real-time tape across 9 prediction-market categories. Four time scales — 1h, 24h, 12d, 12w. Cells coloured by PnL: green when smart money is winning, red when it's bleeding. The ‘now' column sits on the right, lit up the second a whale clicks Buy."
            visual={<LiveHeatmapMock />}
          />
          <FeatureRow
            reverse
            eyebrow="Whale dossier"
            title="The full story behind every wallet."
            body="Click any whale — get a side panel with 90-day cumulative PnL, category mix breakdown, open positions with mark-to-market, recent trades, win rate over decided exits (not over total trades — that's misleading), and Polymarket leaderboard alias with X handle and verified badge. Not just a chart — the full deep-dive."
            visual={<WhaleProfileMock />}
          />
          <FeatureRow
            eyebrow="Cyclical patterns"
            title="See when each category actually moves."
            body="Toggle from sliding-window LIVE to PATTERN to overlay 30 days of activity onto a single 24-hour clock or 7-day week. Discover that crypto whales fire 14:00–16:00 UTC. Sports activity dies on weeknights. Politics peaks on Tuesday afternoons. Find the cadence."
            visual={<PatternMock />}
          />
          <FeatureRow
            reverse
            eyebrow="One click to the source"
            title="From a hot cell to the exact market."
            body="See a category ripping? Click it. See Crypto split into Bitcoin, Solana, ETH. Click Bitcoin — see every individual market driving the move. Click a market — see its probability chart and the top whales who pushed it there. No tab-switching, no copy-pasting addresses."
            visual={<DrillMock />}
          />
          <FeatureRow
            eyebrow="Lock-and-compare"
            title="Compare any two cells, side-by-side."
            body="Hover any cell — instant breakdown: top markets, top whales, full stats, mini cycle histogram showing how this hour usually looks, probability charts at the deepest drill level. Click to lock the tooltip — then hover another cell to compare. The depth is the product."
            visual={<TooltipMock />}
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
  // PnL-tinted cells (green up, red down) so this mock matches the hero
  // palette story instead of the per-category brand tints.
  const rows: ReadonlyArray<{ label: string; tilt: number }> = [
    { label: "POLITICS", tilt:  0.55 },
    { label: "SPORTS",   tilt: -0.30 },
    { label: "CRYPTO",   tilt:  0.20 },
    { label: "FINANCE",  tilt: -0.45 },
  ];
  const COLS = 12;
  // Time labels along the bottom — only a handful drawn so they don't crowd.
  const timeLabels = ["−55m", "", "", "−40m", "", "", "−25m", "", "", "−10m", "", "now"];
  // The "trade just landed" callout pins to this row+col so the visual
  // says "fresh signal arrived → cell flashed → tooltip popped".
  const FRESH_ROW = 0; // POLITICS
  const FRESH_COL = COLS - 1; // rightmost = "now"

  return (
    <MockShell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 9, color: TOKENS.textMuted, fontFamily: TOKENS.mono, letterSpacing: 0.5, textTransform: "uppercase" }}>
          LIVE · 1h · sliding window
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9, color: TOKENS.pos, fontFamily: TOKENS.mono, letterSpacing: 0.4, textTransform: "uppercase", fontWeight: 700 }}>
          <span style={{ width: 5, height: 5, borderRadius: 5, background: TOKENS.pos, boxShadow: `0 0 6px ${TOKENS.pos}`, animation: "livePulse 1.4s ease-in-out infinite" }} />
          streaming
        </span>
      </div>
      <div style={{ position: "relative" }}>
        <div style={{ display: "grid", gridTemplateColumns: `64px repeat(${COLS}, 1fr)`, gap: 3 }}>
          {rows.map((r, ri) => (
            <Row key={r.label} row={r} ri={ri} fresh={ri === FRESH_ROW} />
          ))}
        </div>
        {/* "now" column guide */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -2,
            bottom: 0,
            // Right column position: total area − 1 cell + half-cell
            right: `calc((100% - 64px - 3px) / ${COLS} / 2)`,
            transform: "translateX(50%)",
            width: 1,
            background: TOKENS.accent,
            opacity: 0.45,
            pointerEvents: "none",
          }}
        />
        {/* "+$48.2k · BUY" callout pinned to fresh cell */}
        <FreshCallout col={FRESH_COL} cols={COLS} />
      </div>
      {/* time scale */}
      <div
        style={{
          marginTop: 6,
          display: "grid",
          gridTemplateColumns: `64px repeat(${COLS}, 1fr)`,
          gap: 3,
          fontSize: 8,
          fontFamily: TOKENS.mono,
          color: TOKENS.textMuted,
        }}
      >
        <span />
        {timeLabels.map((t, i) => (
          <span
            key={i}
            style={{
              textAlign: "center",
              color: i === COLS - 1 ? TOKENS.accent : TOKENS.textMuted,
              fontWeight: i === COLS - 1 ? 700 : 400,
            }}
          >
            {t}
          </span>
        ))}
      </div>
      <style>{`
        @keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes freshFlash {
          0%   { box-shadow: 0 0 0 0 rgba(63,185,80,0.7); transform: scale(1); }
          50%  { box-shadow: 0 0 0 5px rgba(63,185,80,0.0); transform: scale(1.06); }
          100% { box-shadow: 0 0 0 0 rgba(63,185,80,0); transform: scale(1); }
        }
      `}</style>
    </MockShell>
  );

  function Row({ row, ri, fresh }: { row: { label: string; tilt: number }; ri: number; fresh: boolean }) {
    return (
      <>
        <div
          style={{
            background: TOKENS.panel2,
            color: TOKENS.textSec,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 0.5,
            display: "flex",
            alignItems: "center",
            paddingLeft: 8,
            borderRadius: 3,
            border: `1px solid ${TOKENS.border}`,
            height: 26,
          }}
        >
          {row.label}
        </div>
        {Array.from({ length: COLS }).map((_, i) => {
          const recency = (i + 1) / COLS;
          const phase = Math.sin(ri * 1.3 + i * 0.5) * 0.4;
          const signed = Math.max(-1, Math.min(1, (row.tilt + phase) * (0.55 + recency * 0.45)));
          const a = Math.abs(signed);
          const isQuiet = a < 0.06;
          const baseColor = isQuiet
            ? "#30363d"
            : signed > 0
              ? "#3fb950"
              : "#f85149";
          const baseAlpha = isQuiet ? 0.35 : 0.22 + a * 0.7;
          const isFresh = fresh && i === FRESH_COL;
          return (
            <div
              key={i}
              style={{
                height: 26,
                borderRadius: 3,
                background: baseColor,
                opacity: baseAlpha,
                position: "relative",
                animation: isFresh ? "freshFlash 1.6s ease-out infinite" : undefined,
                outline: isFresh ? `1.5px solid ${TOKENS.pos}` : undefined,
                outlineOffset: isFresh ? "-1px" : undefined,
                zIndex: isFresh ? 1 : 0,
              }}
            />
          );
        })}
      </>
    );
  }

  function FreshCallout({ col, cols }: { col: number; cols: number }) {
    return (
      <div
        style={{
          position: "absolute",
          // Position over the fresh cell. The 64px label column + (col / cols)
          // of the rest of the row, then nudge up so the callout floats
          // above the row.
          right: `calc((100% - 64px - 3px) * ${1 - (col + 0.5) / cols})`,
          transform: "translate(50%, -50%)",
          top: -2,
          background: TOKENS.panel,
          border: `1px solid ${TOKENS.pos}`,
          borderRadius: 6,
          padding: "5px 8px",
          fontSize: 10,
          color: TOKENS.text,
          fontFamily: TOKENS.mono,
          fontWeight: 700,
          whiteSpace: "nowrap",
          boxShadow: "0 6px 18px rgba(0,0,0,0.5)",
          pointerEvents: "none",
        }}
      >
        <span style={{ color: TOKENS.pos }}>↑ +$48.2k</span>
        <span style={{ color: TOKENS.textMuted, margin: "0 4px" }}>·</span>
        <span style={{ color: TOKENS.text }}>Theo4 · BUY</span>
      </div>
    );
  }
}

function PatternMock() {
  // PATTERN reads as a "clock cycle" — bars instead of a heatmap row, with
  // an average-curve line drawn ON TOP and explicit hour labels around the
  // axis. Visually distinct from LIVE's tape-style cells.
  const HOURS = 12; // each col = 2-hour slot
  // Bell-curved averages, peak at slot 7 (≈14 UTC) to match the copy.
  const heights: number[] = Array.from({ length: HOURS }, (_, i) => {
    const dist = Math.abs(i - 7) / 7;
    const bell = 1 - dist * dist;
    const noise = (Math.sin(i * 1.3) + 1) / 2 * 0.08;
    return Math.max(0.08, bell * 0.92 + noise);
  });
  const W = 320;
  const H = 80;
  const padX = 10;
  const innerW = W - padX * 2;
  const barW = innerW / HOURS - 4;

  // Smoothed line drawn over the bars — same curve, but as a continuous
  // path so the eye reads "this is an aggregate, not raw data".
  const linePath = heights
    .map((h, i) => {
      const x = padX + (i + 0.5) * (innerW / HOURS);
      const y = H - h * (H - 14) - 4;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <MockShell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 9, color: TOKENS.textMuted, fontFamily: TOKENS.mono, letterSpacing: 0.5, textTransform: "uppercase" }}>
          PATTERN · HOUR · 30-day average
        </span>
        <span style={{ fontSize: 9, color: TOKENS.accent, fontFamily: TOKENS.mono, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 700 }}>
          ↻ cycles
        </span>
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {/* gridlines — three horizontal references */}
        {[0.33, 0.66, 1].map((g, i) => (
          <line
            key={i}
            x1={padX}
            x2={W - padX}
            y1={H - g * (H - 14) - 4}
            y2={H - g * (H - 14) - 4}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={0.5}
            strokeDasharray="2 3"
          />
        ))}
        {/* bars — accent-tinted, peak emphasised */}
        {heights.map((h, i) => {
          const x = padX + i * (innerW / HOURS) + 2;
          const y = H - h * (H - 14) - 4;
          const barH = h * (H - 14);
          const isPeak = i === 7;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barW}
              height={barH}
              rx={2}
              fill={isPeak ? TOKENS.accent : "rgba(240,180,41,0.55)"}
              opacity={isPeak ? 1 : 0.55 + h * 0.4}
            />
          );
        })}
        {/* curve overlay — connects the dots, story = "this IS the average" */}
        <path d={linePath} fill="none" stroke={TOKENS.text} strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
        {heights.map((h, i) => {
          const x = padX + (i + 0.5) * (innerW / HOURS);
          const y = H - h * (H - 14) - 4;
          return <circle key={i} cx={x} cy={y} r={1.6} fill={TOKENS.text} opacity={0.85} />;
        })}
        {/* peak marker */}
        <line
          x1={padX + 7.5 * (innerW / HOURS)}
          x2={padX + 7.5 * (innerW / HOURS)}
          y1={4}
          y2={H - 14}
          stroke={TOKENS.accent}
          strokeWidth={0.6}
          strokeDasharray="2 2"
          opacity={0.6}
        />
      </svg>

      {/* hour axis — shows full 24h cycle, peak labelled */}
      <div
        style={{
          marginTop: 4,
          padding: `0 ${padX}px`,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 8,
          fontFamily: TOKENS.mono,
          color: TOKENS.textMuted,
          letterSpacing: 0.4,
        }}
      >
        {["00", "04", "08", "12", "16", "20"].map((h, i) => (
          <span key={h} style={{ color: i === 3 ? TOKENS.accent : TOKENS.textMuted, fontWeight: i === 3 ? 700 : 400 }}>
            {h}{i === 3 ? "↑" : ""}
          </span>
        ))}
      </div>

      <div style={{ marginTop: 10, fontSize: 10, color: TOKENS.textSec, lineHeight: 1.4, padding: "8px 10px", background: TOKENS.panel2, border: `1px solid ${TOKENS.border}`, borderRadius: 6 }}>
        <span style={{ color: TOKENS.text, fontWeight: 600 }}>Crypto whales fire 14:00–16:00 UTC.</span>{" "}
        <span style={{ color: TOKENS.textSec }}>2.4× more active than the daily mean.</span>
      </div>
    </MockShell>
  );
}

function WhaleProfileMock() {
  // Synthetic balance curve — visually credible, ends positive.
  const points = [0, 8, 5, 14, 22, 18, 30, 41, 38, 55, 62, 70, 84];
  const max = Math.max(...points);
  const min = Math.min(...points, 0);
  const W = 280;
  const H = 60;
  const xOf = (i: number): number => (i / (points.length - 1)) * W;
  const yOf = (v: number): number => H - ((v - min) / (max - min)) * H;
  const path = points.map((v, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  const area = `${path} L${W},${H} L0,${H} Z`;

  // Category mix breakdown — proportions read believable for a politics-
  // and-crypto-focused trader.
  const mix: ReadonlyArray<{ cat: string; pct: number; color: string }> = [
    { cat: "Politics", pct: 0.42, color: "#58a6ff" },
    { cat: "Crypto",   pct: 0.28, color: "#f0b429" },
    { cat: "Sports",   pct: 0.18, color: "#3fb950" },
    { cat: "Other",    pct: 0.12, color: "#7d8590" },
  ];

  return (
    <MockShell>
      {/* drawer header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 10, borderBottom: `1px solid ${TOKENS.border}` }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 32,
            background: "linear-gradient(135deg, #f0b429, #f85149)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#1a1410",
            fontSize: 12,
            fontWeight: 700,
            fontFamily: TOKENS.mono,
          }}
        >
          T4
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: TOKENS.text, display: "flex", gap: 4, alignItems: "center" }}>
            Theo4 <span style={{ color: TOKENS.accent, fontSize: 10 }}>✓</span>
            <span style={{ color: TOKENS.link, fontSize: 10, fontFamily: TOKENS.mono, marginLeft: 6, fontWeight: 500 }}>@theo4</span>
          </div>
          <div style={{ fontSize: 10, color: TOKENS.textMuted, fontFamily: TOKENS.mono }}>0xa1b2…f9c3</div>
        </div>
      </div>
      {/* stat row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, padding: "10px 0" }}>
        {[
          { label: "Signals", value: "412",   color: TOKENS.text },
          { label: "Volume",  value: "$2.1M", color: TOKENS.text },
          { label: "PnL",     value: "+$84k", color: TOKENS.pos },
          { label: "Win",     value: "62%",   color: TOKENS.pos },
        ].map((s) => (
          <div key={s.label}>
            <div style={{ fontSize: 8, letterSpacing: 0.5, textTransform: "uppercase", color: TOKENS.textMuted, fontWeight: 700 }}>{s.label}</div>
            <div style={{ fontSize: 13, color: s.color, fontWeight: 700, marginTop: 2, fontFamily: TOKENS.mono }}>{s.value}</div>
          </div>
        ))}
      </div>
      {/* balance chart */}
      <div style={{ fontSize: 8, letterSpacing: 0.5, textTransform: "uppercase", color: TOKENS.textMuted, fontWeight: 700, marginBottom: 4 }}>
        Balance growth · 90 days
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        <line
          x1={0}
          x2={W}
          y1={yOf(0)}
          y2={yOf(0)}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={0.5}
          strokeDasharray="2 2"
        />
        <path d={area} fill="rgba(63,185,80,0.18)" />
        <path d={path} fill="none" stroke={TOKENS.pos} strokeWidth={1.6} strokeLinejoin="round" />
        <circle cx={xOf(points.length - 1)} cy={yOf(points[points.length - 1]!)} r={2.5} fill={TOKENS.pos} />
      </svg>
      {/* category mix */}
      <div style={{ fontSize: 8, letterSpacing: 0.5, textTransform: "uppercase", color: TOKENS.textMuted, fontWeight: 700, marginTop: 12, marginBottom: 6 }}>
        Category mix · by volume
      </div>
      <div
        style={{
          display: "flex",
          width: "100%",
          height: 5,
          borderRadius: 3,
          overflow: "hidden",
          marginBottom: 6,
        }}
      >
        {mix.map((m) => (
          <div key={m.cat} style={{ width: `${m.pct * 100}%`, background: m.color }} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 10, color: TOKENS.textSec }}>
        {mix.map((m) => (
          <span key={m.cat} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
            <span style={{ width: 6, height: 6, borderRadius: 6, background: m.color }} />
            {m.cat} {Math.round(m.pct * 100)}%
          </span>
        ))}
      </div>
      {/* open positions strip */}
      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: `1px solid ${TOKENS.border}`,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: TOKENS.textMuted,
          fontFamily: TOKENS.mono,
        }}
      >
        <span><strong style={{ color: TOKENS.text }}>5</strong> open positions</span>
        <span><strong style={{ color: TOKENS.text }}>41</strong> trades · 7d</span>
        <span><strong style={{ color: TOKENS.pos }}>+$12.4k</strong> · 24h</span>
      </div>
    </MockShell>
  );
}

function TooltipMock() {
  // Compact version of the real Tooltip component — top markets, top whales,
  // a mini sparkline, and a stat header. Mirrors the actual lock-on-click
  // dashboard tooltip enough to be recognisable to anyone who's used the app.
  const sparkPoints = [12, 18, 9, 22, 28, 19, 35, 31, 44, 38, 52, 49];
  const W = 110;
  const H = 28;
  const max = Math.max(...sparkPoints);
  const min = Math.min(...sparkPoints);
  const sxOf = (i: number): number => (i / (sparkPoints.length - 1)) * W;
  const syOf = (v: number): number => H - ((v - min) / (max - min || 1)) * H;
  const sparkPath = sparkPoints
    .map((v, i) => `${i === 0 ? "M" : "L"}${sxOf(i).toFixed(1)},${syOf(v).toFixed(1)}`)
    .join(" ");

  return (
    <MockShell>
      {/* hovered cell badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 9,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: TOKENS.textMuted,
          fontWeight: 700,
          paddingBottom: 8,
          borderBottom: `1px solid ${TOKENS.border}`,
        }}
      >
        <span style={{ color: "#f0b429" }}>● CRYPTO · 14:00 UTC</span>
        <span style={{ color: TOKENS.textMuted }}>🔒 click to lock</span>
      </div>

      {/* big stat */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 10 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: TOKENS.text, fontFamily: '"Space Grotesk", -apple-system, sans-serif', letterSpacing: -0.5, lineHeight: 1 }}>
            $2.4M
          </div>
          <div style={{ fontSize: 10, color: TOKENS.textMuted, fontFamily: TOKENS.mono, marginTop: 2 }}>
            47 trades · 12 unique whales
          </div>
        </div>
        <svg width={W} height={H} style={{ display: "block" }}>
          <path d={sparkPath} fill="none" stroke={TOKENS.accent} strokeWidth={1.4} strokeLinejoin="round" />
        </svg>
      </div>

      {/* mini cycle histogram */}
      <div style={{ marginTop: 12, fontSize: 8, letterSpacing: 0.5, textTransform: "uppercase", color: TOKENS.textMuted, fontWeight: 700, marginBottom: 4 }}>
        How this hour usually looks · 30-day
      </div>
      <div style={{ display: "flex", gap: 2, height: 18, alignItems: "flex-end" }}>
        {[0.3, 0.45, 0.6, 0.4, 0.7, 0.85, 1.0, 0.92, 0.78, 0.55, 0.42, 0.3].map((h, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${h * 100}%`,
              background: i === 6 ? TOKENS.accent : "rgba(240,180,41,0.35)",
              borderRadius: 2,
            }}
          />
        ))}
      </div>

      {/* top whales */}
      <div style={{ marginTop: 12, fontSize: 8, letterSpacing: 0.5, textTransform: "uppercase", color: TOKENS.textMuted, fontWeight: 700, marginBottom: 6 }}>
        Top whales in this cell
      </div>
      {[
        { name: "Theo4 ✓",     pnl: "+$22k",  vol: "$140k", color: "#f0b429" },
        { name: "@PrincessOfCo", pnl: "+$18k", vol: "$98k",  color: "#58a6ff" },
        { name: "GammaGod",    pnl: "+$11k",  vol: "$74k",  color: "#3fb950" },
      ].map((w) => (
        <div
          key={w.name}
          style={{
            display: "grid",
            gridTemplateColumns: "16px 1fr auto auto",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            paddingBottom: 5,
          }}
        >
          <span style={{ width: 12, height: 12, borderRadius: 12, background: w.color }} />
          <span style={{ color: TOKENS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</span>
          <span style={{ fontFamily: TOKENS.mono, fontSize: 10, color: TOKENS.textMuted }}>{w.vol}</span>
          <span style={{ fontFamily: TOKENS.mono, fontSize: 11, color: TOKENS.pos, fontWeight: 700 }}>{w.pnl}</span>
        </div>
      ))}

      {/* top markets */}
      <div style={{ marginTop: 6, paddingTop: 8, borderTop: `1px solid ${TOKENS.border}`, fontSize: 8, letterSpacing: 0.5, textTransform: "uppercase", color: TOKENS.textMuted, fontWeight: 700, marginBottom: 6 }}>
        Top markets
      </div>
      {[
        { q: "Bitcoin Up or Down · 2:30PM ET",       v: "$1.1M" },
        { q: "Will BTC close above $112k on May 30?", v: "$680k" },
      ].map((m) => (
        <div
          key={m.q}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            paddingBottom: 4,
          }}
        >
          <span style={{ color: TOKENS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.q}</span>
          <span style={{ fontFamily: TOKENS.mono, fontSize: 10, color: TOKENS.textSec }}>{m.v}</span>
        </div>
      ))}
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { TOKENS } from "@/lib/tokens";

/**
 * Animated heatmap mock for the hero. 8 categories × 16 time slots, cells
 * pulse with random opacity to simulate live signal flow. A floating
 * "signal" card animates between cells every few seconds.
 *
 * Pure visual — not connected to real SSE. Data-shaped enough to feel
 * authentic to anyone who's seen the dashboard. No external deps.
 */

const ROWS: ReadonlyArray<{ label: string; tilt: number }> = [
  // tilt ∈ [-1, 1] — bias toward positive or negative PnL for that category.
  // Story: politics ripping, finance bleeding, crypto mixed, etc. Picked so
  // the grid visually tells a "smart money is rotating" story.
  { label: "POLITICS", tilt:  0.55 },
  { label: "SPORTS",   tilt: -0.35 },
  { label: "CRYPTO",   tilt:  0.20 },
  { label: "FINANCE",  tilt: -0.50 },
  { label: "TECH",     tilt:  0.15 },
  { label: "WORLD",    tilt:  0.40 },
  { label: "CULTURE",  tilt: -0.20 },
  { label: "CLIMATE",  tilt:  0.05 },
];
const COLS = 16;

/** Signed cell value in [-1, 1] — used to pick green/red and intensity. */
function seedSigned(row: number, col: number): number {
  const tilt = ROWS[row]!.tilt;
  // Recency weight — recent cells (right) more saturated than older (left).
  const recency = (col + 1) / COLS;
  // Per-cell phase noise so the row isn't a flat shade.
  const phase = Math.sin(row * 1.7 + col * 0.6) * 0.4;
  // Combine: tilt sets sign+baseline, phase adds variation, recency boosts.
  return Math.max(-1, Math.min(1, (tilt + phase) * (0.55 + recency * 0.45)));
}

/** Map a signed value to (color, alpha) using the dashboard's PnL palette. */
function pnlColor(signed: number): { color: string; alpha: number } {
  const a = Math.abs(signed);
  // Below this threshold cells read as "no data" — fade to a faint gray.
  if (a < 0.06) return { color: "#30363d", alpha: 0.35 };
  const color = signed > 0 ? "#3fb950" : "#f85149";
  // 0.22 floor so even small-magnitude cells are visible against panel bg.
  return { color, alpha: 0.22 + a * 0.7 };
}

export function HeroVisual() {
  // Per-cell pulse offset — kicks tiny opacity bumps so the grid feels
  // alive without being seizure-y. Initialized after mount to avoid
  // hydration mismatches.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 1000), 380);
    return () => clearInterval(id);
  }, []);

  const cells = useMemo(() => {
    const arr: { row: number; col: number; signed: number }[] = [];
    for (let r = 0; r < ROWS.length; r++) {
      for (let c = 0; c < COLS; c++) {
        arr.push({ row: r, col: c, signed: seedSigned(r, c) });
      }
    }
    return arr;
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "relative",
        background: TOKENS.panel,
        border: `1px solid ${TOKENS.borderHi}`,
        borderRadius: 16,
        padding: 16,
        boxShadow: "0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(240, 180, 41, 0.06)",
        overflow: "hidden",
      }}
    >
      {/* fake header bar — mimics the app's chrome */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          paddingBottom: 10,
          borderBottom: `1px solid ${TOKENS.border}`,
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          {[TOKENS.neg, TOKENS.accent, TOKENS.pos].map((c) => (
            <span
              key={c}
              style={{ width: 10, height: 10, borderRadius: 10, background: c, opacity: 0.55 }}
            />
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span
            style={{
              fontSize: 10,
              color: TOKENS.textMuted,
              fontFamily: TOKENS.mono,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            LIVE · 24h · PnL
          </span>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 6,
              background: TOKENS.pos,
              boxShadow: `0 0 10px ${TOKENS.pos}`,
              animation: "heroPulse 1.6s ease-in-out infinite",
            }}
          />
        </div>
      </div>

      {/* heatmap grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `74px repeat(${COLS}, 1fr)`,
          gap: 3,
        }}
      >
        {ROWS.map((row, r) => (
          <RowFragment key={row.label} row={r} tick={tick} cells={cells} />
        ))}
      </div>

      {/* floating signal callout */}
      <SignalCallout tick={tick} />

      <style>{`
        @keyframes heroPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.45; transform: scale(0.85); }
        }
        @keyframes heroCellPulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}

function RowFragment({
  row,
  tick,
  cells,
}: {
  row: number;
  tick: number;
  cells: ReadonlyArray<{ row: number; col: number; signed: number }>;
}) {
  const r = ROWS[row]!;
  const rowCells = cells.filter((c) => c.row === row);
  // Row label — neutral chip with the category name. Replaces the prior
  // colored badge so rows aren't visually competing with the PnL palette.
  return (
    <>
      <div
        style={{
          background: TOKENS.panel2,
          color: TOKENS.textSec,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 0.6,
          padding: "0 8px",
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          height: 28,
          border: `1px solid ${TOKENS.border}`,
        }}
      >
        {r.label}
      </div>
      {rowCells.map((cell) => {
        // Per-cell pulse: stronger-magnitude cells flicker more.
        const mag = Math.abs(cell.signed);
        const pulse = (Math.sin((tick + row * 3 + cell.col * 5) * 0.7) + 1) / 2;
        const { color, alpha } = pnlColor(cell.signed);
        const adjusted = Math.min(1, alpha + pulse * mag * 0.12);
        return (
          <div
            key={cell.col}
            style={{
              height: 28,
              borderRadius: 3,
              background: color,
              opacity: adjusted,
              transition: "opacity .35s ease-out",
            }}
          />
        );
      })}
    </>
  );
}

function SignalCallout({ tick }: { tick: number }) {
  // Cycle through a handful of fake signals — enough variety to feel real,
  // few enough to render predictably. Kept short.
  const samples: ReadonlyArray<{ alias: string; cat: string; side: "BUY" | "SELL"; usd: string; market: string }> = [
    { alias: "Theo4",       cat: "CRYPTO",  side: "BUY",  usd: "$48.2k", market: "Bitcoin Up or Down · 2:30PM" },
    { alias: "@PrincessOfCo", cat: "POLITICS", side: "BUY",  usd: "$120k", market: "Trump confirms cabinet pick" },
    { alias: "0xAce…f7",    cat: "SPORTS",  side: "SELL", usd: "$31.5k", market: "Lakers vs Celtics" },
    { alias: "@BetMaker",   cat: "FINANCE", side: "BUY",  usd: "$84k",   market: "Fed rate cut May 2026" },
    { alias: "GammaGod",    cat: "CRYPTO",  side: "BUY",  usd: "$22k",   market: "Solana Up or Down · 2:45PM" },
  ];
  const idx = Math.floor(tick / 5) % samples.length;
  const s = samples[idx]!;
  const sideColor = s.side === "BUY" ? TOKENS.link : TOKENS.accent;
  return (
    <div
      style={{
        position: "absolute",
        right: 28,
        bottom: 22,
        background: TOKENS.panel2,
        border: `1px solid ${TOKENS.borderHi}`,
        borderRadius: 10,
        padding: "10px 12px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.5), 0 0 0 1px rgba(240,180,41,0.18)",
        minWidth: 220,
        animation: "tipIn .35s ease-out",
        pointerEvents: "none",
      }}
      key={idx}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 9,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: TOKENS.textMuted,
          fontWeight: 700,
          marginBottom: 4,
        }}
      >
        <span style={{ color: sideColor }}>{s.side}</span>
        <span>·</span>
        <span>{s.cat}</span>
        <span>·</span>
        <span style={{ color: TOKENS.text }}>{s.usd}</span>
      </div>
      <div style={{ fontSize: 12, color: TOKENS.text, fontWeight: 600, lineHeight: 1.3 }}>
        {s.alias}
      </div>
      <div
        style={{
          fontSize: 11,
          color: TOKENS.textSec,
          marginTop: 2,
          maxWidth: 220,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {s.market}
      </div>
      <style>{`
        @keyframes tipIn {
          from { opacity: 0; transform: translateY(8px) scale(.98); }
          to   { opacity: 1; transform: translateY(0)  scale(1);   }
        }
      `}</style>
    </div>
  );
}

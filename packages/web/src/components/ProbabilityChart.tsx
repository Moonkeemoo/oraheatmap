"use client";

import { TOKENS } from "@/lib/tokens";
import type { OutcomeSeries } from "@/hooks/useMarketHistory";

/**
 * Multi-line probability chart for a market — Polymarket-style.
 * Y axis: 0–100% (right side, sparse). X axis: span min..max ts (sparse).
 * Each outcome is a separate line in its own colour. Below the chart is a
 * compact legend showing latest price per outcome.
 *
 * Pure SVG, no chart deps. Sized to fit the 340px-wide tooltip with a bit
 * of room: 320×140 chart + ~20px legend.
 */

const PALETTE: ReadonlyArray<string> = [
  "#3fb950", // green
  "#58a6ff", // blue
  "#f0b429", // gold
  "#f85149", // red
  "#a78bfa", // purple
  "#ff9e64", // orange
  "#7ee787", // light green
  "#79c0ff", // light blue
  "#bc8cff", // lilac
  "#ffa657", // amber
  "#ff7b72", // pink-red
  "#56d4dd", // cyan
];

const W = 320;
const H = 140;
const PAD_T = 8;
const PAD_R = 32; // right side for % labels
const PAD_B = 18; // bottom for date labels
const PAD_L = 8;

function lastPrice(s: OutcomeSeries): number | null {
  if (s.points.length === 0) return null;
  return s.points[s.points.length - 1]?.p ?? null;
}

function fmtPct(p: number): string {
  return Math.round(p * 1000) / 10 + "%";
}

function fmtDate(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  // "4 May" / "26 Aug" — short and locale-stable.
  return `${d.getDate()} ${d.toLocaleString("en-US", { month: "short" })}`;
}

export function ProbabilityChart({
  outcomes,
}: {
  outcomes: ReadonlyArray<OutcomeSeries>;
}) {
  // Pick outcomes that have data. Sort by descending last price so the most
  // probable outcome is first in the legend (matches Polymarket UX).
  const populated = outcomes
    .filter((o) => o.points.length > 1)
    .map((o) => ({ ...o, last: lastPrice(o) ?? 0 }))
    .sort((a, b) => b.last - a.last)
    .slice(0, 6);
  if (populated.length === 0) {
    return (
      <div style={{ fontSize: 11, color: TOKENS.textMuted, padding: "8px 0" }}>
        No price history available.
      </div>
    );
  }

  // X domain: min t across all points → max t.
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const o of populated) {
    for (const pt of o.points) {
      if (pt.t < tMin) tMin = pt.t;
      if (pt.t > tMax) tMax = pt.t;
    }
  }
  if (!Number.isFinite(tMin) || !Number.isFinite(tMax) || tMax === tMin) {
    return (
      <div style={{ fontSize: 11, color: TOKENS.textMuted, padding: "8px 0" }}>
        Not enough data.
      </div>
    );
  }

  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const xOf = (t: number): number => PAD_L + ((t - tMin) / (tMax - tMin)) * innerW;
  const yOf = (p: number): number => PAD_T + (1 - p) * innerH;

  // 4 X-axis ticks: tMin, ~33%, ~66%, tMax.
  const xTicks = [tMin, tMin + (tMax - tMin) / 3, tMin + (2 * (tMax - tMin)) / 3, tMax];
  // 3 Y-axis grid lines: 0%, 50%, 100% (right-side labels).
  const yTicks = [0, 0.5, 1];

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {/* Y grid */}
        {yTicks.map((y) => (
          <g key={`y-${y}`}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={yOf(y)}
              y2={yOf(y)}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={0.5}
            />
            <text
              x={W - PAD_R + 4}
              y={yOf(y) + 3}
              fontSize={9}
              fill={TOKENS.textMuted}
              fontFamily={TOKENS.mono}
            >
              {fmtPct(y)}
            </text>
          </g>
        ))}
        {/* X tick labels */}
        {xTicks.map((t, i) => (
          <text
            key={`x-${i}`}
            x={xOf(t)}
            y={H - 4}
            fontSize={9}
            fill={TOKENS.textMuted}
            fontFamily={TOKENS.mono}
            textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
          >
            {fmtDate(t)}
          </text>
        ))}
        {/* Series lines */}
        {populated.map((o, i) => {
          const color = PALETTE[i % PALETTE.length];
          const path = o.points
            .map((pt, idx) => `${idx === 0 ? "M" : "L"}${xOf(pt.t).toFixed(2)},${yOf(pt.p).toFixed(2)}`)
            .join(" ");
          return (
            <path
              key={o.tokenId}
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={1.4}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
      </svg>

      {/* Legend — compact 2-column grid; clamped at 4 entries to keep tooltip
          height predictable. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "4px 12px",
          marginTop: 6,
        }}
      >
        {populated.slice(0, 4).map((o, i) => {
          const color = PALETTE[i % PALETTE.length];
          return (
            <div
              key={o.tokenId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 10,
                color: TOKENS.textSec,
                minWidth: 0,
              }}
              title={o.label}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 8,
                  background: color,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {o.label}
              </span>
              <span
                style={{
                  fontFamily: TOKENS.mono,
                  fontWeight: 700,
                  color: TOKENS.text,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtPct(o.last)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

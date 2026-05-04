"use client";

import { fmtMoneyShort } from "@/lib/format";
import { TOKENS } from "@/lib/tokens";

const W = 380;
const H = 110;
const PAD_T = 8;
const PAD_R = 44;
const PAD_B = 16;
const PAD_L = 4;

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${d.getUTCDate()} ${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })}`;
}

export function BalanceChart({
  points,
}: {
  points: ReadonlyArray<{ day: string; cumulativePnl: number }>;
}) {
  if (points.length < 2) {
    return (
      <div style={{ fontSize: 11, color: TOKENS.textSec, padding: "4px 0" }}>
        not enough realized-PnL history
      </div>
    );
  }

  const last = points[points.length - 1]!.cumulativePnl;
  const lineColor = last > 0 ? TOKENS.pos : last < 0 ? TOKENS.neg : TOKENS.textSec;
  const fillColor =
    last > 0 ? "rgba(63,185,80,0.14)" : last < 0 ? "rgba(248,81,73,0.14)" : "rgba(255,255,255,0.06)";

  // Y domain: include 0 baseline so the curve sits relative to break-even.
  let yMin = 0;
  let yMax = 0;
  for (const p of points) {
    if (p.cumulativePnl < yMin) yMin = p.cumulativePnl;
    if (p.cumulativePnl > yMax) yMax = p.cumulativePnl;
  }
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }

  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const xOf = (i: number): number => PAD_L + (i / (points.length - 1)) * innerW;
  const yOf = (v: number): number =>
    PAD_T + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(2)},${yOf(p.cumulativePnl).toFixed(2)}`)
    .join(" ");
  const fillPath =
    `M${xOf(0).toFixed(2)},${yOf(0).toFixed(2)} ` +
    points.map((p, i) => `L${xOf(i).toFixed(2)},${yOf(p.cumulativePnl).toFixed(2)}`).join(" ") +
    ` L${xOf(points.length - 1).toFixed(2)},${yOf(0).toFixed(2)} Z`;

  const baselineY = yOf(0);
  const firstDay = points[0]!.day;
  const lastDay = points[points.length - 1]!.day;
  const midDay = points[Math.floor(points.length / 2)]!.day;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {/* 0 baseline */}
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={baselineY}
          y2={baselineY}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={0.5}
          strokeDasharray="2 2"
        />
        <text
          x={W - PAD_R + 4}
          y={baselineY + 3}
          fontSize={9}
          fill={TOKENS.textMuted}
          fontFamily={TOKENS.mono}
        >
          $0
        </text>
        {/* Max label */}
        <text
          x={W - PAD_R + 4}
          y={yOf(yMax) + 3}
          fontSize={9}
          fill={TOKENS.textMuted}
          fontFamily={TOKENS.mono}
        >
          {fmtMoneyShort(yMax)}
        </text>
        {/* Min label (only if below 0) */}
        {yMin < 0 && (
          <text
            x={W - PAD_R + 4}
            y={yOf(yMin) + 3}
            fontSize={9}
            fill={TOKENS.textMuted}
            fontFamily={TOKENS.mono}
          >
            {fmtMoneyShort(yMin)}
          </text>
        )}

        {/* Area fill */}
        <path d={fillPath} fill={fillColor} />
        {/* Line */}
        <path
          d={path}
          fill="none"
          stroke={lineColor}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* End-of-line dot */}
        <circle
          cx={xOf(points.length - 1)}
          cy={yOf(last)}
          r={2.5}
          fill={lineColor}
        />

        {/* X tick labels */}
        <text x={PAD_L} y={H - 3} fontSize={9} fill={TOKENS.textMuted} fontFamily={TOKENS.mono} textAnchor="start">
          {fmtDate(firstDay)}
        </text>
        <text
          x={PAD_L + innerW / 2}
          y={H - 3}
          fontSize={9}
          fill={TOKENS.textMuted}
          fontFamily={TOKENS.mono}
          textAnchor="middle"
        >
          {fmtDate(midDay)}
        </text>
        <text
          x={W - PAD_R}
          y={H - 3}
          fontSize={9}
          fill={TOKENS.textMuted}
          fontFamily={TOKENS.mono}
          textAnchor="end"
        >
          {fmtDate(lastDay)}
        </text>
      </svg>
    </div>
  );
}

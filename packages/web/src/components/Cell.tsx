"use client";

import { useRef, useState } from "react";
import { getCellFill, getCellValue, getValueColor } from "@/lib/colors";
import { fmtCellValue } from "@/lib/format";
import { TOKENS } from "@/lib/tokens";
import type { HeatmapCell, HeatmapMetric } from "@/lib/types";
import type { TooltipAnchor } from "./Tooltip";

function recentForMetric(metric: HeatmapMetric, cell: HeatmapCell): number | null {
  switch (metric) {
    case "signals": return cell.count;
    case "volume":  return cell.volume;
    case "pnl":     return cell.pnl;
    case "winrate": return cell.winRate;
    case "whales":  return cell.uniqueWhales ?? null;
  }
}

function deltaForMetric(metric: HeatmapMetric, cell: HeatmapCell): number | null {
  const d = cell.delta;
  if (!d) return null;
  switch (metric) {
    case "signals": return d.count;
    case "volume":  return d.volume;
    case "pnl":     return d.pnl;
    case "winrate": return d.winRate; // 0..1 fraction
    case "whales":  return null;       // not aggregated in PATTERN
  }
}

/** Full-lookback average for the active metric. Backend exposes `cell.full`
 *  with null-tolerant per-half combining, so we read it directly. Falls back
 *  to recent value when `full` isn't on the cell (LIVE mode, older API
 *  responses) or when the metric isn't aggregated in PATTERN. */
function avgForMetric(metric: HeatmapMetric, cell: HeatmapCell): number | null {
  const f = cell.full;
  if (f) {
    switch (metric) {
      case "signals": return f.count;
      case "volume":  return f.volume;
      case "pnl":     return f.pnl;
      case "winrate": return f.winRate;
      case "whales":  return f.uniqueWhales ?? null;
    }
  }
  return recentForMetric(metric, cell);
}

function fmtAvg(metric: HeatmapMetric, avg: number | null): string {
  if (avg === null) return "—";
  if (metric === "winrate") return Math.round(avg * 100) + "%";
  // Signed display for PnL avg — match the headline value's "+/-" prefix.
  if (metric === "pnl") {
    const v = fmtCellValue(avg);
    return avg > 0 ? `+${v}` : v;
  }
  return fmtCellValue(avg);
}

export function Cell({
  cell,
  metric,
  intensityFn,
  isNowCol,
  flashSeq,
  heat,
  showDelta,
  compact,
  isLocked,
  onHover,
  onClick,
}: {
  cell: HeatmapCell;
  metric: HeatmapMetric;
  intensityFn: (c: HeatmapCell) => number;
  isNowCol: boolean;
  flashSeq: number;
  /** Continuous "burst level" derived from recent SSE arrivals on this
   *  cell — bumps by 1 per signal, decays exponentially over ~2s.
   *  Drives the live glow aura + scale, so a single signal pings briefly
   *  and a burst (5+ in a second) holds the cell visibly hot for a beat. */
  heat: number;
  /** Render the parenthetical delta next to the main value (PATTERN mode only). */
  showDelta: boolean;
  /** Macro mode: skip value text + ring animations + heat aura. The cell
   *  becomes a pure colour swatch — image carries the signal. */
  compact?: boolean;
  /** This cell currently has the locked tooltip — render a persistent ring. */
  isLocked: boolean;
  onHover: (h: { cell: HeatmapCell; anchor: TooltipAnchor } | null) => void;
  onClick: (h: { cell: HeatmapCell; anchor: TooltipAnchor }) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);

  const isEmpty = cell.count === 0;
  const bg = getCellFill(metric, cell, intensityFn);
  // visualEmpty covers BOTH actually-empty cells (count = 0) AND cells
  // with activity but no fill for the current metric — e.g. WIN RATE on
  // a slot with no decided trades, or WHALES on a PATTERN cell when the
  // backend hasn't aggregated uniqueWhales. Without this, those cells
  // collapsed into pure-black gaps and read as "the layout is broken".
  const visualEmpty = isEmpty || bg === "transparent";
  // Treat "metric value is exactly 0 even though cell.count > 0" the same
  // as empty for display purposes — e.g. VOLUME on a Thu cell that only
  // saw SELLs (no BUYs this slot) reads as "0 (0)" otherwise, which
  // looks like a system error. visualEmpty already gets true when the
  // colour ramp goes transparent, so reuse it as the no-value gate.
  const value = visualEmpty ? "" : getCellValue(metric, cell);
  // PATTERN parens now show full-lookback AVG (not Δ vs older half) — gives
  // the user a baseline to compare the current cell against. Color stays
  // muted because it's a reference value, not a positive/negative trend.
  const avg = showDelta && !visualEmpty ? avgForMetric(metric, cell) : null;
  // PATTERN cell: paint the value green when current > lookback avg,
  // red when below, and prepend ▲/▼. Applied to every non-empty cell
  // in PATTERN — each column already shows current-vs-avg natively.
  //
  // Equality / near-equality is intentionally null (no arrow, default
  // colour). When the backend has only one half of lookback data
  // populated, `avg` falls back to the same value as `cur` — pretending
  // there's a trend would be misleading. Use a relative tolerance so
  // floating-point rounding noise (e.g. cur=100.0001, avg=100.0002)
  // doesn't fake a direction either.
  const cur = !visualEmpty ? recentForMetric(metric, cell) : null;
  // Tolerance check: treat near-equal cur/avg as "no real trend" so
  // floating-point rounding noise (cur=100.0001, avg=100.0002) doesn't
  // fake a direction. Used by both the trend arrow AND the parens
  // gate below — when cur ≈ avg the parens are pure visual noise
  // (they just repeat the headline number).
  const isNearEqual = cur !== null && avg !== null && (() => {
    const ref = Math.max(Math.abs(cur), Math.abs(avg));
    const tolerance = Math.max(ref * 0.005, metric === "winrate" ? 0.001 : 1);
    return Math.abs(cur - avg) < tolerance;
  })();
  const trend: "up" | "down" | null = (() => {
    if (!showDelta || visualEmpty || cur === null || avg === null) return null;
    if (isNearEqual) return null;
    return cur > avg ? "up" : "down";
  })();
  // Show the avg in parens only when it carries information — i.e.
  // cur ≠ avg. Otherwise we just stuff "$25M ($25M)" on screen.
  const showAvgParens = avg !== null && !isNearEqual;
  const valColor = isEmpty
    ? TOKENS.text
    : trend === "up"
      ? TOKENS.pos
      : trend === "down"
        ? TOKENS.neg
        : getValueColor(metric, cell);

  function captureAnchor(): TooltipAnchor | null {
    if (!ref.current) return null;
    const r = ref.current.getBoundingClientRect();
    const parent = ref.current.closest("[data-hm-grid-wrap]") as HTMLElement | null;
    const pr = parent?.getBoundingClientRect();
    return {
      x: r.left - (pr?.left ?? 0),
      y: r.top - (pr?.top ?? 0),
      w: r.width,
      h: r.height,
      parentW: pr?.width ?? r.width,
      parentH: pr?.height ?? r.height,
    };
  }

  const onEnter = (): void => {
    setHovered(true);
    if (isEmpty) return;
    const anchor = captureAnchor();
    if (anchor) onHover({ cell, anchor });
  };

  const onLeave = (): void => {
    setHovered(false);
    onHover(null);
  };

  const onClickHandler = (): void => {
    if (isEmpty) return;
    const anchor = captureAnchor();
    if (anchor) onClick({ cell, anchor });
  };

  // Heat → flash-ring amplitude. The discrete flash on each signal
  // (driven by flashSeq retrigger) is the visible event; heat just
  // modulates how big and how bright that flash is. Colour stays
  // neutral white — the cell's own background already encodes the
  // PnL direction, so re-tinting the flash on top of that read as
  // visual noise. Saturation + spread + speed do all the work.
  const heatNorm = Math.min(heat, 6);
  // 6px → 14px ring spread; 0.55 → 0.95 ring alpha.
  const ringSpread = 6 + heatNorm * 1.35;
  const ringAlpha = Math.min(0.95, 0.55 + heatNorm * 0.07);
  // Slightly faster flash duration on hotter cells so consecutive
  // bursts stack visually instead of blurring into a steady tint.
  const ringDuration = Math.max(0.55, 0.95 - heatNorm * 0.07);

  const finalShadow =
    isLocked && !isEmpty
      ? `0 8px 22px rgba(0,0,0,0.55), 0 0 0 2px ${TOKENS.accent}`
      : hovered && !isEmpty
        ? `0 8px 22px rgba(0,0,0,0.55), 0 0 0 1px ${TOKENS.borderHi}`
        : "none";

  // Macro variant — sharper / more saturated colour, dim ground for
  // empty cells (so the matrix reads as a continuous surface, not a
  // pixel field with random gaps), no per-cell animations.
  const macroBg = compact && visualEmpty
    ? TOKENS.panel2
    : compact && !visualEmpty
      ? bg
      : bg;

  return (
    <div
      ref={ref}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClickHandler}
      style={{
        background: compact ? macroBg : bg,
        backgroundImage: !compact && visualEmpty
          ? `radial-gradient(circle at 50% 50%, ${TOKENS.border} 0.5px, transparent 1px)`
          : "none",
        backgroundSize: !compact && visualEmpty ? "6px 6px" : "auto",
        border: !compact && visualEmpty ? `1px solid ${TOKENS.border}` : "none",
        borderRadius: compact ? 2 : 7,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: isEmpty ? "default" : "pointer",
        transform: !compact && hovered && !isEmpty ? "scale(1.1)" : "scale(1)",
        transition: compact
          ? "background .15s ease-out"
          : "transform .14s cubic-bezier(.2,.7,.3,1), box-shadow .14s, background .3s",
        // Compact: brighter on hover instead of scaling (scale at 1px
        // gap distances would clip neighbours). Plus a subtle outline.
        boxShadow:
          compact && hovered && !isEmpty
            ? `0 0 0 1px ${TOKENS.text}66, 0 0 6px rgba(0,0,0,0.6)`
            : finalShadow,
        filter: compact && hovered && !isEmpty ? "brightness(1.4)" : undefined,
        position: "relative",
        zIndex: isLocked ? 6 : hovered ? 5 : 1,
        animation: compact ? undefined : "cellLand .35s cubic-bezier(.2,.7,.3,1) both",
        outline: !compact && isNowCol && !isEmpty ? `1px solid rgba(63,185,80,0.28)` : "none",
        outlineOffset: -1,
      }}
    >
      {!compact && flashSeq > 0 && (
        <span
          key={`flash-${flashSeq}`}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 7,
            pointerEvents: "none",
            animation: `flashRing ${ringDuration}s ease-out forwards`,
            // Per-flash spread + alpha — keyframe in globals.css reads
            // these custom properties so a hot cell expands a bigger,
            // brighter ring per event while a quiet cell just pings
            // softly. Colour stays white across all heat levels.
            ["--ring-color" as string]: `rgba(255,255,255,${ringAlpha.toFixed(2)})`,
            ["--ring-spread" as string]: `${ringSpread}px`,
          }}
        />
      )}
      {!compact && !isEmpty && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "baseline",
            gap: 4,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: 0.2,
            textShadow: "0 1px 2px rgba(0,0,0,0.5)",
            position: "relative",
            zIndex: 1,
            // PATTERN cells get a dim pill backdrop on every non-empty
            // value — the metric's per-cell colour ramp produces bright
            // yellow / green / red backgrounds where the foreground value
            // would otherwise wash out. Trended cells additionally pick
            // up a tinted outline matching their direction. Non-PATTERN
            // (LIVE / MACRO) cells stay un-pilled to keep the heatmap
            // visually quiet at default.
            ...(showDelta && !isEmpty
              ? {
                  background: "rgba(13, 17, 23, 0.55)",
                  padding: "3px 8px",
                  borderRadius: 6,
                  boxShadow: trend
                    ? `inset 0 0 0 1px ${trend === "up" ? "rgba(63,185,80,0.45)" : "rgba(248,81,73,0.45)"}`
                    : undefined,
                }
              : {}),
          }}
        >
          {trend && (
            <span
              aria-hidden
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: valColor,
                lineHeight: 1,
                marginRight: 1,
              }}
              title={trend === "up" ? "above the lookback average" : "below the lookback average"}
            >
              {trend === "up" ? "▲" : "▼"}
            </span>
          )}
          <span style={{ fontSize: 12, fontWeight: 700, color: valColor }}>{value}</span>
          {showAvgParens && (
            // Parens text reads against coloured cell backgrounds (yellow,
            // dim green, dim red), so TOKENS.textMuted (a flat gray) gets
            // crushed. A translucent white holds contrast across every
            // background tint while still feeling secondary to the primary
            // value — matched 0.72 opacity by eye on the worst-case yellow
            // PATTERN cell. Hidden when avg ≈ cur (pure visual noise).
            <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.72)" }}>
              ({fmtAvg(metric, avg)})
            </span>
          )}
        </span>
      )}
    </div>
  );
}


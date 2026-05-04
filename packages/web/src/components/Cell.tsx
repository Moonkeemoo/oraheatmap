"use client";

import { useRef, useState } from "react";
import { getCellFill, getCellValue, getValueColor } from "@/lib/colors";
import { fmtCellValue } from "@/lib/format";
import { TOKENS } from "@/lib/tokens";
import type { HeatmapCell, HeatmapMetric } from "@/lib/types";
import type { TooltipAnchor } from "./Tooltip";

function deltaForMetric(metric: HeatmapMetric, cell: HeatmapCell): number | null {
  const d = cell.delta;
  if (!d) return null;
  switch (metric) {
    case "signals":
      return d.count;
    case "volume":
      return d.volume;
    case "pnl":
      return d.pnl;
    case "winrate":
      return d.winRate; // already a delta of 0..1 fractions
    case "whales":
      // PATTERN delta doesn't carry a uniqueWhales delta yet — skip the
      // arrow indicator. The cell still shows the current count via the
      // main label; we just don't compare to historical baseline.
      return null;
  }
}

function fmtDelta(metric: HeatmapMetric, delta: number | null): string {
  // Sparse-cycle case (e.g. winrate with no decided trades in older half).
  // Render an explicit "no comparison" glyph so the parens don't disappear
  // — empty parens read as a bug, "(—)" reads as "we have nothing yet".
  if (delta === null) return "—";
  if (delta === 0) return "0";
  if (metric === "winrate") {
    const pct = Math.round(delta * 100);
    return (pct >= 0 ? "+" : "") + pct + "%";
  }
  if (metric === "pnl" || metric === "volume") {
    const sign = delta > 0 ? "+" : "";
    return sign + fmtCellValue(delta);
  }
  // signals — fractional avg in PATTERN; abbreviate via fmtCellValue.
  const sign = delta > 0 ? "+" : "";
  return sign + fmtCellValue(delta);
}

export function Cell({
  cell,
  metric,
  intensityFn,
  isNowCol,
  flashSeq,
  showDelta,
  isLocked,
  onHover,
  onClick,
}: {
  cell: HeatmapCell;
  metric: HeatmapMetric;
  intensityFn: (c: HeatmapCell) => number;
  isNowCol: boolean;
  flashSeq: number;
  /** Render the parenthetical delta next to the main value (PATTERN mode only). */
  showDelta: boolean;
  /** This cell currently has the locked tooltip — render a persistent ring. */
  isLocked: boolean;
  onHover: (h: { cell: HeatmapCell; anchor: TooltipAnchor } | null) => void;
  onClick: (h: { cell: HeatmapCell; anchor: TooltipAnchor }) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);

  const isEmpty = cell.count === 0;
  const bg = getCellFill(metric, cell, intensityFn);
  const value = isEmpty ? "" : getCellValue(metric, cell);
  const valColor = isEmpty ? TOKENS.text : getValueColor(metric, cell);
  const delta = showDelta && !isEmpty ? deltaForMetric(metric, cell) : null;
  const deltaColor = delta === null
    ? TOKENS.textMuted
    : delta > 0
      ? TOKENS.pos
      : delta < 0
        ? TOKENS.neg
        : TOKENS.textSec;

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

  return (
    <div
      ref={ref}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClickHandler}
      style={{
        background: bg,
        backgroundImage: isEmpty
          ? `radial-gradient(circle at 50% 50%, ${TOKENS.border} 0.5px, transparent 1px)`
          : "none",
        backgroundSize: isEmpty ? "6px 6px" : "auto",
        border: isEmpty ? `1px solid ${TOKENS.border}` : "none",
        borderRadius: 7,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: isEmpty ? "default" : "pointer",
        transform: hovered && !isEmpty ? "scale(1.1)" : "scale(1)",
        transition: "transform .14s cubic-bezier(.2,.7,.3,1), box-shadow .14s, background .3s",
        boxShadow:
          isLocked && !isEmpty
            ? `0 8px 22px rgba(0,0,0,0.55), 0 0 0 2px ${TOKENS.accent}`
            : hovered && !isEmpty
              ? `0 8px 22px rgba(0,0,0,0.55), 0 0 0 1px ${TOKENS.borderHi}`
              : "none",
        position: "relative",
        zIndex: isLocked ? 6 : hovered ? 5 : 1,
        animation: "cellLand .35s cubic-bezier(.2,.7,.3,1) both",
        outline: isNowCol && !isEmpty ? `1px solid rgba(63,185,80,0.28)` : "none",
        outlineOffset: -1,
      }}
    >
      {flashSeq > 0 && (
        <span
          key={`flash-${flashSeq}`}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 7,
            pointerEvents: "none",
            animation: "flashRing .9s ease-out forwards",
          }}
        />
      )}
      {!isEmpty && (
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
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: valColor }}>{value}</span>
          {showDelta && (
            <span style={{ fontSize: 9, fontWeight: 700, color: deltaColor }}>
              ({fmtDelta(metric, delta)})
            </span>
          )}
        </span>
      )}
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { getCellFill, getCellValue, getValueColor } from "@/lib/colors";
import { TOKENS } from "@/lib/tokens";
import type { HeatmapCell, HeatmapMetric } from "@/lib/types";
import type { TooltipAnchor } from "./Tooltip";

export function Cell({
  cell,
  metric,
  intensityFn,
  isNowCol,
  flashSeq,
  onHover,
}: {
  cell: HeatmapCell;
  metric: HeatmapMetric;
  intensityFn: (c: HeatmapCell) => number;
  isNowCol: boolean;
  /** Monotonic counter: bumped each time THIS cell receives a fresh SSE signal. */
  flashSeq: number;
  onHover: (h: { cell: HeatmapCell; anchor: TooltipAnchor } | null) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);

  const isEmpty = cell.count === 0;
  const bg = getCellFill(metric, cell, intensityFn);
  const value = isEmpty ? "" : getCellValue(metric, cell);
  const valColor = isEmpty ? TOKENS.text : getValueColor(metric, cell);

  const onEnter = (): void => {
    setHovered(true);
    if (isEmpty || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const parent = ref.current.closest("[data-hm-grid-wrap]") as HTMLElement | null;
    const pr = parent?.getBoundingClientRect();
    onHover({
      cell,
      anchor: {
        x: r.left - (pr?.left ?? 0),
        y: r.top - (pr?.top ?? 0),
        w: r.width,
        h: r.height,
        parentW: pr?.width ?? r.width,
        parentH: pr?.height ?? r.height,
      },
    });
  };

  const onLeave = (): void => {
    setHovered(false);
    onHover(null);
  };

  return (
    <div
      ref={ref}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
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
          hovered && !isEmpty
            ? `0 8px 22px rgba(0,0,0,0.55), 0 0 0 1px ${TOKENS.borderHi}`
            : "none",
        position: "relative",
        zIndex: hovered ? 5 : 1,
        // cellLand runs once on mount (when grid is rebuilt — i.e. on initial
        // load or range change). Data refresh keeps the same cell mounted, so
        // no animation flicker on every refetch.
        animation: "cellLand .35s cubic-bezier(.2,.7,.3,1) both",
        outline: isNowCol && !isEmpty ? `1px solid rgba(63,185,80,0.28)` : "none",
        outlineOffset: -1,
      }}
    >
      {/* Flash overlay: only present when flashSeq > 0. The key includes flashSeq
          so each new signal re-mounts the overlay and re-runs the flashRing
          animation exactly once per signal — no more nonstop blinking. */}
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
            fontSize: 12,
            fontWeight: 700,
            color: valColor,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: 0.2,
            textShadow: "0 1px 2px rgba(0,0,0,0.5)",
            position: "relative",
            zIndex: 1,
          }}
        >
          {value}
        </span>
      )}
    </div>
  );
}

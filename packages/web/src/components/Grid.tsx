"use client";

import { Fragment, useMemo } from "react";
import { categoryMeta } from "@/lib/categories";
import { makeIntensityFn } from "@/lib/colors";
import { TOKENS } from "@/lib/tokens";
import type { Category, HeatmapCell, HeatmapMetric, HeatmapRange, HeatmapResponse } from "@/lib/types";
import { Cell } from "./Cell";
import type { FlashByCategory } from "./Heatmap";
import type { TooltipAnchor } from "./Tooltip";

const LABEL_W = 100;
const TIME_ROW_H = 26;

/**
 * Bucket timestamp → human label in the viewer's LOCAL timezone.
 * Each range has 12 buckets, so we always show all 12 labels — no crowding.
 *   1h  → "16:35"  HH:MM (5-min boundary)
 *   24h → "16:00"  HH:00 (2-hour boundary)
 *   12d → "03/05"  DD/MM (day boundary)
 *   12w → "21/04"  DD/MM (week-start, day boundary)
 * Time labels move with the chart automatically because each bucket carries
 * its own ts; shifting the window shifts the visible labels with it.
 */
function formatSlotLabel(range: HeatmapRange, ts: string): string {
  const d = new Date(ts);
  if (range === "1h" || range === "24h") {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  // 12d / 12w
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mo}`;
}

export function Grid({
  data,
  metric,
  onHover,
  flashByCategory,
  gridKey,
}: {
  data: HeatmapResponse;
  metric: HeatmapMetric;
  onHover: (h: { cell: HeatmapCell; anchor: TooltipAnchor; category: string; slotLabel: string } | null) => void;
  flashByCategory: FlashByCategory;
  gridKey: string;
}) {
  const num = data.buckets.length;

  const intensityFn = useMemo(() => {
    if (metric === "winrate") {
      return (c: HeatmapCell) => c.winRate ?? 0;
    }
    const key = metric === "pnl" ? "pnl" : metric === "volume" ? "volume" : "count";
    const flat: HeatmapCell[] = [];
    for (const cat of data.categories) flat.push(...data.cells[cat]);
    return makeIntensityFn(flat, key);
  }, [data, metric]);

  const cellFontSize = 12;

  return (
    <div
      data-hm-grid-wrap
      style={{
        display: "grid",
        gridTemplateColumns: `${LABEL_W}px repeat(${num}, minmax(0, 1fr))`,
        gridTemplateRows: `${TIME_ROW_H}px repeat(${data.categories.length}, minmax(0, 1fr))`,
        gap: 4,
        width: "100%",
        height: "100%",
        position: "relative",
        fontSize: cellFontSize,
        boxSizing: "border-box",
      }}
    >
      <div />
      {data.buckets.map((b, i) => {
        const lbl = formatSlotLabel(data.range, b.ts);
        const isNow = i === num - 1;
        return (
          <div
            key={i}
            style={{
              fontSize: 10,
              fontFamily: TOKENS.mono,
              color: isNow ? TOKENS.pos : TOKENS.textSec,
              fontWeight: isNow ? 700 : 500,
              letterSpacing: 0.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isNow ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 6,
                    background: TOKENS.pos,
                    boxShadow: `0 0 6px ${TOKENS.pos}`,
                  }}
                />
                {lbl}
              </span>
            ) : (
              lbl
            )}
          </div>
        );
      })}

      {data.categories.map((cat) => {
        const meta = categoryMeta(cat);
        return (
          <Fragment key={cat}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
                paddingRight: 10,
              }}
            >
              <span
                style={{
                  background: meta.color,
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  padding: "5px 10px",
                  borderRadius: 3,
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                {meta.label}
              </span>
            </div>
            {data.cells[cat].map((cell, slot) => {
              const isNowCol = slot === num - 1;
              // Per-cell flash sequence — only the NOW cell of a category that
              // received a fresh signal will have a non-zero, monotonically
              // growing seq. Other cells stay at 0 → no flash.
              const flashSeq = isNowCol ? (flashByCategory[cat as Category] ?? 0) : 0;
              return (
                <Cell
                  key={`${cat}-${slot}-${gridKey}`}
                  cell={cell}
                  metric={metric}
                  intensityFn={intensityFn}
                  isNowCol={isNowCol}
                  flashSeq={flashSeq}
                  onHover={(h) =>
                    onHover(
                      h
                        ? {
                            ...h,
                            category: cat,
                            slotLabel: formatSlotLabel(data.range, data.buckets[slot]?.ts ?? ""),
                          }
                        : null,
                    )
                  }
                />
              );
            })}
          </Fragment>
        );
      })}
    </div>
  );
}

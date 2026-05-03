"use client";

import { Fragment, useMemo } from "react";
import { categoryMeta } from "@/lib/categories";
import { makeIntensityFn } from "@/lib/colors";
import { TOKENS } from "@/lib/tokens";
import type { HeatmapCell, HeatmapMetric, HeatmapRange, HeatmapResponse } from "@/lib/types";
import { Cell } from "./Cell";
import type { TooltipAnchor } from "./Tooltip";

const LABEL_W = 124;
const TIME_ROW_H = 28;

function slotLabel(range: HeatmapRange, slotIdx: number, total: number): string {
  const fromEnd = total - 1 - slotIdx;
  if (fromEnd === 0) return range === "7d" || range === "30d" ? "TODAY" : "NOW";
  if (range === "1h") return `-${fromEnd * 5}m`;
  if (range === "24h") return `-${fromEnd}h`;
  return `-${fromEnd}d`;
}

export function Grid({
  data,
  metric,
  onHover,
  justArrivedTick,
  gridKey,
}: {
  data: HeatmapResponse;
  metric: HeatmapMetric;
  onHover: (h: { cell: HeatmapCell; anchor: TooltipAnchor; category: string; slotLabel: string } | null) => void;
  justArrivedTick: boolean;
  gridKey: string;
}) {
  const num = data.buckets.length;

  // Per-grid intensity normalization. Computed once per (data, metric).
  const intensityFn = useMemo(() => {
    if (metric === "winrate") {
      return (c: HeatmapCell) => (c.winRate ?? 0);
    }
    const key = metric === "pnl" ? "pnl" : metric === "volume" ? "volume" : "count";
    const flat: HeatmapCell[] = [];
    for (const cat of data.categories) flat.push(...data.cells[cat]);
    return makeIntensityFn(flat, key);
  }, [data, metric]);

  const cellFontSize = num > 16 ? 10 : 12;

  return (
    <div
      data-hm-grid-wrap
      style={{
        display: "grid",
        gridTemplateColumns: `${LABEL_W}px repeat(${num}, minmax(0, 1fr))`,
        gridTemplateRows: `${TIME_ROW_H}px repeat(${data.categories.length}, minmax(0, 1fr))`,
        gap: 5,
        width: "100%",
        height: "100%",
        position: "relative",
        fontSize: cellFontSize,
      }}
    >
      <div />
      {Array.from({ length: num }).map((_, i) => {
        const lbl = slotLabel(data.range, i, num);
        const showLabel = num <= 12 || i % Math.ceil(num / 12) === 0 || i === num - 1;
        const isNow = lbl === "NOW" || lbl === "TODAY";
        return (
          <div
            key={i}
            style={{
              fontSize: num > 16 ? 9 : 10,
              fontFamily: TOKENS.mono,
              color: isNow ? TOKENS.pos : TOKENS.textSec,
              fontWeight: isNow ? 700 : 500,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: showLabel ? 1 : 0,
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
              const justArrived = isNowCol && justArrivedTick;
              return (
                <Cell
                  key={`${cat}-${slot}-${gridKey}`}
                  cell={cell}
                  metric={metric}
                  intensityFn={intensityFn}
                  isNowCol={isNowCol}
                  justArrived={justArrived}
                  gridKey={gridKey}
                  onHover={(h) =>
                    onHover(
                      h
                        ? { ...h, category: cat, slotLabel: slotLabel(data.range, slot, num) }
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

"use client";

import { Fragment, useMemo } from "react";
import { categoryMeta } from "@/lib/categories";
import { makeIntensityFn } from "@/lib/colors";
import { TOKENS } from "@/lib/tokens";
import type { Category, HeatmapBucket, HeatmapCell, HeatmapMetric, HeatmapResponse } from "@/lib/types";
import { Cell } from "./Cell";
import type { FlashByCell } from "./Heatmap";
import type { TooltipAnchor } from "./Tooltip";

const LABEL_W = 100;
const TIME_ROW_H = 26;

/**
 * Bucket → human label.
 *   LIVE 1h/24h           → "16:35"  HH:MM, local TZ from bucket.ts
 *   LIVE 12d/12w          → "03/05"  DD/MM, local TZ
 *   PATTERN hour-of-day   → "16:00"  local hour after rotation (slotPosition is local hour)
 *   PATTERN day-of-week   → "Mon".."Sun" from server
 */
function formatSlotLabel(
  bucket: HeatmapBucket,
  mode: HeatmapResponse["mode"],
  patternKind: HeatmapResponse["patternKind"],
  slotPosition: number,
  range?: HeatmapResponse["range"],
): string {
  if (mode === "pattern") {
    if (patternKind === "hour-of-day") {
      // After rotation, slotPosition IS the local hour (0..23).
      return String(slotPosition).padStart(2, "0") + ":00";
    }
    return bucket.label ?? String(bucket.index);
  }
  if (!bucket.ts) return bucket.label ?? "";
  const d = new Date(bucket.ts);
  if (range === "1h" || range === "24h") {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mo}`;
}

export function Grid({
  data,
  metric,
  onHover,
  flashByCell,
  gridKey,
}: {
  data: HeatmapResponse;
  metric: HeatmapMetric;
  onHover: (h: { cell: HeatmapCell; anchor: TooltipAnchor; category: string; slotLabel: string } | null) => void;
  flashByCell: FlashByCell;
  gridKey: string;
}) {
  const num = data.buckets.length;
  const isPattern = data.mode === "pattern";

  // Backend pattern queries group by UTC hour / dow. To display in viewer's
  // local TZ we rotate the bucket array.
  //
  // We want: displayColumn[localHour] to show server data for the UTC hour
  // that corresponds to local `localHour`. utcHour = localHour - tzOffset.
  // After slice+concat: displayColumn[i] = server[(i + shift) % 24].
  // So shift = (-tzOffset mod 24).
  //
  // Worked example for UTC+3 (Kyiv): tzOffset = +3, shift = 21.
  //   displayColumn[14] = server[(14+21)%24] = server[11] = UTC 11 data
  //   == "what happens at local 14:00, averaged"
  const localShiftIdx = useMemo<number>(() => {
    if (data.mode !== "pattern") return 0;
    if (data.patternKind === "hour-of-day") {
      const tzOffset = -new Date().getTimezoneOffset() / 60;
      return ((Math.round(-tzOffset) % 24) + 24) % 24;
    }
    return 0; // day-of-week: leave UTC dow for MVP — TZ shift rarely changes day
  }, [data]);

  const buckets = useMemo(() => {
    if (localShiftIdx === 0) return data.buckets;
    return data.buckets.slice(localShiftIdx).concat(data.buckets.slice(0, localShiftIdx));
  }, [data.buckets, localShiftIdx]);

  const cellsByCat = useMemo(() => {
    if (localShiftIdx === 0) return data.cells;
    const out: Record<Category, ReadonlyArray<HeatmapCell>> = {} as Record<
      Category,
      ReadonlyArray<HeatmapCell>
    >;
    for (const cat of data.categories) {
      const row = data.cells[cat];
      out[cat] = row.slice(localShiftIdx).concat(row.slice(0, localShiftIdx));
    }
    return out;
  }, [data, localShiftIdx]);

  const intensityFn = useMemo(() => {
    if (metric === "winrate") {
      return (c: HeatmapCell) => c.winRate ?? 0;
    }
    const key = metric === "pnl" ? "pnl" : metric === "volume" ? "volume" : "count";
    const flat: HeatmapCell[] = [];
    for (const cat of data.categories) flat.push(...cellsByCat[cat]);
    return makeIntensityFn(flat, key);
  }, [data.categories, cellsByCat, metric]);

  // Highlight the slot corresponding to "now" in PATTERN — it's where new
  // signals will land. Computed in viewer's local TZ to match label format.
  // For hour-of-day after local rotation, NOW = local hour (column position).
  const nowSlotIndex = useMemo<number | null>(() => {
    if (data.mode === "live") return num - 1;
    if (data.patternKind === "hour-of-day") return new Date().getHours();
    if (data.patternKind === "day-of-week") {
      const dow = new Date().getDay(); // 0=Sun
      const monFirst = [1, 2, 3, 4, 5, 6, 0];
      return monFirst.indexOf(dow);
    }
    return null;
  }, [data, num]);

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
        fontSize: 12,
        boxSizing: "border-box",
      }}
    >
      <div />
      {buckets.map((b, i) => {
        const lbl = formatSlotLabel(b, data.mode, data.patternKind, i, data.range);
        const isNow = i === nowSlotIndex;
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
            {cellsByCat[cat].map((cell, slot) => {
              const isNowCol = slot === nowSlotIndex;
              // flashByCell key is keyed by ORIGINAL bucket position (server
              // index). After local-shift rotation, original index = (slot + shift) mod num.
              const originalIdx = (slot + localShiftIdx) % num;
              const flashSeq = flashByCell[`${cat}:${originalIdx}`] ?? 0;
              return (
                <Cell
                  key={`${cat}-${slot}-${gridKey}`}
                  cell={cell}
                  metric={metric}
                  intensityFn={intensityFn}
                  isNowCol={isNowCol}
                  flashSeq={flashSeq}
                  showDelta={isPattern}
                  onHover={(h) =>
                    onHover(
                      h
                        ? {
                            ...h,
                            category: cat,
                            slotLabel: formatSlotLabel(buckets[slot]!, data.mode, data.patternKind, slot, data.range),
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

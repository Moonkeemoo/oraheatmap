// Ported 1:1 from Reference/heatmap-shared.jsx with TS typing.

import type { HeatmapCell, HeatmapMetric } from "./types";

export function pnlColor(intensity: number, isPos: boolean): string {
  const a = 0.08 + Math.pow(intensity, 0.7) * 0.77;
  const rgb = isPos ? "63, 185, 80" : "248, 81, 73";
  return `rgba(${rgb}, ${a.toFixed(3)})`;
}

export function signalsColor(intensity: number): string {
  const a = 0.08 + Math.pow(intensity, 0.7) * 0.85;
  return `rgba(88, 166, 255, ${a.toFixed(3)})`;
}

export function volumeColor(intensity: number): string {
  const a = 0.08 + Math.pow(intensity, 0.7) * 0.85;
  return `rgba(240, 180, 41, ${a.toFixed(3)})`;
}

/** Convergence / unique-whales colour — purple, distinct from the four
 *  existing metric hues (green/red for pnl, blue for signals, gold for
 *  volume) so the user instantly sees they're on a different lens. */
export function whalesColor(intensity: number): string {
  const a = 0.08 + Math.pow(intensity, 0.7) * 0.85;
  return `rgba(167, 139, 250, ${a.toFixed(3)})`;
}

export function winRateColor(wr: number | null): string {
  if (wr === null || wr <= 0) return "transparent";
  const dist = Math.abs(wr - 0.5) * 2; // 0..1
  const a = 0.12 + Math.pow(dist, 0.7) * 0.73;
  const rgb = wr >= 0.5 ? "63, 185, 80" : "248, 81, 73";
  return `rgba(${rgb}, ${a.toFixed(3)})`;
}

/**
 * Per-grid normalization: takes the active metric's max value across all
 * non-zero cells in the bundle and produces an intensity 0..1 for each cell.
 */
export function makeIntensityFn(
  cells: ReadonlyArray<HeatmapCell>,
  key: "count" | "volume" | "pnl" | "uniqueWhales",
): (cell: HeatmapCell) => number {
  const vals = cells.map((c) => Math.abs(c[key])).filter((v) => v > 0);
  const max = vals.length ? Math.max(...vals) : 1;
  return (cell: HeatmapCell) => {
    const v = Math.abs(cell[key]);
    return max > 0 ? Math.min(1, v / max) : 0;
  };
}

export function getCellFill(
  metric: HeatmapMetric,
  cell: HeatmapCell,
  intensityFn: (c: HeatmapCell) => number,
): string {
  if (cell.count === 0) return "transparent";
  // For directional / volume-style metrics, treat "active but exactly
  // zero" the same as "no activity" — otherwise pnl-balanced cells
  // (BUY without an exit, or wins exactly cancelling losses) draw a
  // faint coloured tint with a meaningless "0" overlay, which the
  // user can't tell apart from a meaningful low-value cell. Dropping
  // to transparent here triggers Cell.tsx's empty-pattern path so
  // the row reads "no signal here" consistently.
  if (metric === "pnl" && cell.pnl === 0) return "transparent";
  if (metric === "volume" && cell.volume === 0) return "transparent";
  if (metric === "whales" && (cell.uniqueWhales ?? 0) === 0) return "transparent";
  if (metric === "pnl") return pnlColor(intensityFn(cell), cell.pnl >= 0);
  if (metric === "volume") return volumeColor(intensityFn(cell));
  if (metric === "signals") return signalsColor(intensityFn(cell));
  if (metric === "winrate") return winRateColor(cell.winRate);
  if (metric === "whales") {
    // PATTERN cells don't carry uniqueWhales — bail out to transparent so we
    // don't paint with NaN-tainted alpha (or, worse, leak the previous
    // metric's color when the React diff doesn't replace `style.background`).
    if (cell.uniqueWhales == null || cell.uniqueWhales <= 0) return "transparent";
    return whalesColor(intensityFn(cell));
  }
  return "transparent";
}

import { fmtCellValue } from "./format";

export function getCellValue(metric: HeatmapMetric, cell: HeatmapCell): string {
  if (cell.count === 0) return "";
  if (metric === "pnl") {
    // PnL is signed — fmtCellValue already prepends "-" on negatives,
    // mirror with an explicit "+" on positives so the user reads
    // direction at a glance instead of hunting for a missing minus.
    const v = fmtCellValue(cell.pnl);
    return cell.pnl > 0 ? `+${v}` : v;
  }
  if (metric === "volume") return fmtCellValue(cell.volume);
  // PATTERN serves AVG count per cycle (fractional) — abbreviate the same
  // way as pnl/volume so we don't render "5850.333333333333".
  if (metric === "signals") return fmtCellValue(cell.count);
  if (metric === "winrate") return cell.winRate === null ? "" : Math.round(cell.winRate * 100) + "%";
  if (metric === "whales") {
    // Empty when no aggregate. PATTERN serves AVG(unique-whales-per-day)
    // which is fractional → run through fmtCellValue so cells display
    // rounded integers ("122" not "122.33333333").
    if (cell.uniqueWhales == null) return "";
    return fmtCellValue(cell.uniqueWhales);
  }
  return "";
}

export function getValueColor(metric: HeatmapMetric, cell: HeatmapCell): string {
  if (metric === "pnl") return cell.pnl >= 0 ? "#dcffe2" : "#ffe2e0";
  if (metric === "volume") return "#fff5d9";
  if (metric === "signals") return "#e6f1ff";
  if (metric === "winrate") {
    if (cell.winRate === null) return "#7d8590";
    return cell.winRate >= 0.5 ? "#dcffe2" : "#ffe2e0";
  }
  if (metric === "whales") return "#ede9ff";
  return "#e6edf3";
}

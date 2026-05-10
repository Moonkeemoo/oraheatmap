import type { HeatmapMetric, PatternKind } from "@/lib/types";

/** Translate the row-cell index (position in the RAW server-ordered
 *  `data.cells[cat]` array, NOT the rotated display order) into the slot
 *  encoding the cell-cycles backend expects.
 *
 *  HOUR pattern — server cells are already keyed by UTC 2-hour slot 0..11,
 *  so the index IS the UTC slot. The rotation Grid applies for display
 *  doesn't change ref identity, so `findIndex` against the raw array
 *  recovers the server slot directly.
 *
 *  DOW pattern — server cells are ordered Mon..Sun (DOW_DISPLAY_ORDER), so
 *  index N at the frontend = Postgres dow DOW_DISPLAY_ORDER[N] (0=Sun). */
const DOW_DISPLAY_ORDER: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6, 0];

export function rowIndexToServerSlot(kind: PatternKind, rowIndex: number): number {
  if (kind === "hour-of-day") return rowIndex;
  return DOW_DISPLAY_ORDER[rowIndex] ?? 0;
}

/** Bar-fill colour for a single sample, matched to the active metric's
 *  heatmap palette. Centered metrics (pnl, winrate) split green/red on
 *  a midpoint; the others use a single hue with reduced alpha. */
function pickHistogramFill(metric: HeatmapMetric, v: number): string {
  if (v === 0) return "rgba(125,133,144,0.22)";
  switch (metric) {
    case "pnl":
      return v > 0 ? "rgba(63,185,80,0.7)" : "rgba(248,81,73,0.7)";
    case "volume":
      return "rgba(240,180,41,0.7)";
    case "signals":
      return "rgba(88,166,255,0.7)";
    case "winrate":
      return v >= 0.5 ? "rgba(63,185,80,0.7)" : "rgba(248,81,73,0.7)";
    case "whales":
      return "rgba(167,139,250,0.7)";
  }
}

/** Histogram of past-cycle values for a single (category × slot) cell.
 *  Each bar = one cycle (day for HOUR pattern, week for DOW pattern).
 *  PNL bars centre on a zero baseline. The faint horizontal line marks
 *  the mean across cycles so the user can eyeball the spread. */
export function CycleHistogram({
  samples,
  metric,
  height = 44,
}: {
  samples: ReadonlyArray<{ count: number; volume: number; pnl: number; winRate: number | null }>;
  metric: HeatmapMetric;
  height?: number;
}) {
  if (samples.length === 0) return null;
  // Defensive: NaN / Infinity / null in `vals` would propagate to bar
  // height = NaN, and Chrome renders NaN-height SVG rects as huge bars
  // that overflow the viewBox (caused the 2026-05-10 "vertical line"
  // regression on PNL cycles when one cycle had a malformed value).
  // Coerce non-finite numbers to 0 here so the histogram is bounded.
  const vals = samples.map((s) => {
    let v: number;
    switch (metric) {
      case "signals": v = s.count; break;
      case "volume":  v = s.volume; break;
      case "pnl":     v = s.pnl; break;
      case "winrate": v = s.winRate ?? 0; break;
      case "whales":  v = s.count; break; // proxy — whales not in pattern aggregate
    }
    return Number.isFinite(v) ? v : 0;
  });
  const isPnl = metric === "pnl";
  const maxAbs = Math.max(...vals.map(Math.abs), 1);
  const nonZero = vals.filter((v) => v !== 0);
  const mean = nonZero.length > 0 ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;
  const meanY = isPnl
    ? height / 2 - (height / 2) * (mean / maxAbs)
    : height - 1 - (height - 2) * (Math.abs(mean) / maxAbs);
  const n = vals.length;
  const slot = 10;
  const gap = 2;
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${n * slot} ${height}`}
      preserveAspectRatio="none"
      style={{ display: "block", overflow: "hidden" }}
    >
      {vals.map((v, i) => {
        const ratio = Math.min(1, Math.max(0, Math.abs(v) / maxAbs));
        const barH = Math.max(0, Math.min(
          isPnl ? height / 2 : height - 2,
          (isPnl ? height / 2 : height - 2) * ratio,
        ));
        const y = isPnl
          ? v >= 0 ? height / 2 - barH : height / 2
          : height - 1 - barH;
        const x = i * slot + gap / 2;
        const w = slot - gap;
        const fill = pickHistogramFill(metric, v);
        return (
          <rect key={i} x={x} y={y} width={w} height={Math.max(1, barH)} fill={fill} rx={1} />
        );
      })}
      {isPnl && (
        <line x1={0} x2={n * slot} y1={height / 2} y2={height / 2}
              stroke="rgba(255,255,255,0.18)" strokeWidth={0.5} />
      )}
      {nonZero.length > 1 && (
        <line x1={0} x2={n * slot} y1={meanY} y2={meanY}
              stroke="rgba(240,180,41,0.55)" strokeWidth={0.7} strokeDasharray="3 2" />
      )}
    </svg>
  );
}

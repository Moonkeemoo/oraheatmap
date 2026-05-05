import { TOKENS } from "@/lib/tokens";
import type { HeatmapCell, HeatmapMetric } from "@/lib/types";

/** Numeric value of a cell for the active metric — only used by the
 *  sparkline so we keep it co-located. */
function cellMetricValue(metric: HeatmapMetric, c: HeatmapCell): number {
  switch (metric) {
    case "signals":
      return c.count;
    case "volume":
      return c.volume;
    case "pnl":
      return c.pnl;
    case "winrate":
      return c.winRate ?? 0;
    case "whales":
      return c.uniqueWhales;
  }
}

/** Sparkline of a single row across all time slots in the chosen frame.
 *  Highlights the active slot in TOKENS.accent. PNL bars centre on a
 *  zero baseline (positive up, negative down); other metrics rest on the
 *  bottom edge. Pure SVG — no chart deps. */
export function RowSparkline({
  rowCells,
  metric,
  activeSlot,
  height = 36,
}: {
  rowCells: ReadonlyArray<HeatmapCell>;
  metric: HeatmapMetric;
  activeSlot: number;
  height?: number;
}) {
  if (rowCells.length === 0) return null;
  const vals = rowCells.map((c) => cellMetricValue(metric, c));
  const isPnl = metric === "pnl";
  const maxAbs = Math.max(...vals.map(Math.abs), 1);
  // Equal-width bars with a small gutter so the silhouette reads cleanly
  // at 12 buckets in a ~310px tooltip width.
  const n = vals.length;
  const gap = 2;
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${n * 10} ${height}`}
      preserveAspectRatio="none"
      style={{ display: "block" }}
    >
      {vals.map((v, i) => {
        const isActive = i === activeSlot;
        const ratio = Math.min(1, Math.abs(v) / maxAbs);
        const barH = isPnl ? (height / 2) * ratio : (height - 2) * ratio;
        const y = isPnl
          ? v >= 0
            ? height / 2 - barH
            : height / 2
          : height - 1 - barH;
        const x = i * 10 + gap / 2;
        const w = 10 - gap;
        const fill = isActive
          ? TOKENS.accent
          : isPnl
            ? v >= 0
              ? "rgba(63,185,80,0.55)"
              : "rgba(248,81,73,0.55)"
            : "rgba(125,133,144,0.45)";
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={w}
            height={Math.max(1, barH)}
            fill={fill}
            rx={1}
          />
        );
      })}
      {isPnl && (
        <line
          x1={0}
          x2={n * 10}
          y1={height / 2}
          y2={height / 2}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={0.5}
        />
      )}
    </svg>
  );
}

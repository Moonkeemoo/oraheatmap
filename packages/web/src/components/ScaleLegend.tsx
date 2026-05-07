import { pnlColor, signalsColor, volumeColor, whalesColor, winRateColor } from "@/lib/colors";
import { TOKENS } from "@/lib/tokens";
import type { HeatmapMetric } from "@/lib/types";

type Stop = { c: string; zero?: boolean };
type Caps = { lo: string; mid: string; hi: string };

/** Per-metric legend descriptor:
 *   - `label`     — the heading (e.g. "PNL", "WIN RATE") that prefixes the bar
 *   - `stops`     — colour samples rendered as a horizontal gradient bar
 *   - `caps`      — three labels (lo / mid / hi) shown INLINE to the right of
 *                   the bar. PNL uses NEG/0/POS to telegraph the diverging
 *                   scale; sequential metrics use LOW/HIGH with no midpoint
 *                   so the absent middle label collapses cleanly.
 */
function configFor(
  metric: HeatmapMetric,
): { label: string; stops: Stop[]; caps: Caps } {
  if (metric === "pnl") {
    return {
      label: "PNL",
      stops: [
        { c: pnlColor(1, false) },
        { c: pnlColor(0.5, false) },
        { c: "rgba(255,255,255,0.04)", zero: true },
        { c: pnlColor(0.5, true) },
        { c: pnlColor(1, true) },
      ],
      caps: { lo: "NEG", mid: "0", hi: "POS" },
    };
  }
  if (metric === "volume") {
    return {
      label: "VOLUME",
      stops: [
        { c: volumeColor(0.05) },
        { c: volumeColor(0.3) },
        { c: volumeColor(0.6) },
        { c: volumeColor(0.85) },
        { c: volumeColor(1) },
      ],
      caps: { lo: "LOW", mid: "", hi: "HIGH" },
    };
  }
  if (metric === "signals") {
    return {
      label: "TRADES",
      stops: [
        { c: signalsColor(0.05) },
        { c: signalsColor(0.3) },
        { c: signalsColor(0.6) },
        { c: signalsColor(0.85) },
        { c: signalsColor(1) },
      ],
      caps: { lo: "LOW", mid: "", hi: "HIGH" },
    };
  }
  if (metric === "whales") {
    return {
      label: "WHALES",
      stops: [
        { c: whalesColor(0.05) },
        { c: whalesColor(0.3) },
        { c: whalesColor(0.6) },
        { c: whalesColor(0.85) },
        { c: whalesColor(1) },
      ],
      caps: { lo: "FEW", mid: "", hi: "MANY" },
    };
  }
  return {
    label: "WIN %",
    stops: [
      { c: winRateColor(0.15) },
      { c: winRateColor(0.35) },
      { c: "rgba(255,255,255,0.04)", zero: true },
      { c: winRateColor(0.7) },
      { c: winRateColor(0.92) },
    ],
    caps: { lo: "15%", mid: "50%", hi: "92%" },
  };
}

/** Compact inline legend.
 *
 *  Layout — single horizontal row:
 *    [LABEL]  [▰▰▱▰▰]  [LO  MID  HI]
 *
 *  Labels sit INLINE on the right of the gradient bar (not stacked
 *  underneath), so the legend takes one line of vertical space and
 *  fits cleanly in a single-row toolbar without the previous
 *  position:absolute LOW/MID/HIGH labels overflowing into the grid
 *  area below. Mirrors the V1a overhead toolbar design.
 */
export function ScaleLegend({ metric }: { metric: HeatmapMetric }) {
  const { stops, label, caps } = configFor(metric);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        fontFamily: TOKENS.font,
      }}
    >
      <span
        style={{
          fontSize: 9,
          color: TOKENS.textMuted,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          fontWeight: 700,
        }}
      >
        {label}
      </span>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
        {stops.map((s, i) => (
          <div
            key={i}
            style={{
              width: 16,
              height: 12,
              background: s.c,
              border: s.zero ? `1px dashed ${TOKENS.borderHi}` : "none",
              borderRadius: 2,
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 9,
          fontFamily: TOKENS.mono,
          color: TOKENS.textMuted,
          letterSpacing: 0.4,
          fontWeight: 600,
        }}
      >
        <span>{caps.lo}</span>
        {caps.mid && <span>{caps.mid}</span>}
        <span>{caps.hi}</span>
      </div>
    </div>
  );
}

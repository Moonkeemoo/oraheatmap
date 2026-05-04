import { pnlColor, signalsColor, volumeColor, whalesColor, winRateColor } from "@/lib/colors";
import { TOKENS } from "@/lib/tokens";
import type { HeatmapMetric } from "@/lib/types";

type Stop = { c: string; label?: string; zero?: boolean };

function stopsFor(metric: HeatmapMetric): { stops: Stop[]; label: string } {
  if (metric === "pnl") {
    return {
      label: "PNL",
      stops: [
        { c: pnlColor(1, false), label: "NEG" },
        { c: pnlColor(0.5, false) },
        { c: "rgba(255,255,255,0.04)", zero: true, label: "0" },
        { c: pnlColor(0.5, true) },
        { c: pnlColor(1, true), label: "POS" },
      ],
    };
  }
  if (metric === "volume") {
    return {
      label: "Volume",
      stops: [
        { c: volumeColor(0.05), label: "LOW" },
        { c: volumeColor(0.3) },
        { c: volumeColor(0.6) },
        { c: volumeColor(0.85) },
        { c: volumeColor(1), label: "HIGH" },
      ],
    };
  }
  if (metric === "signals") {
    return {
      label: "Trades",
      stops: [
        { c: signalsColor(0.05), label: "LOW" },
        { c: signalsColor(0.3) },
        { c: signalsColor(0.6) },
        { c: signalsColor(0.85) },
        { c: signalsColor(1), label: "HIGH" },
      ],
    };
  }
  if (metric === "whales") {
    return {
      // "Convergence" reads more honestly than "Whale count" — the whole
      // point of this lens is "how many independent top-corpus addresses
      // have piled into this slot".
      label: "Convergence",
      stops: [
        { c: whalesColor(0.05), label: "FEW" },
        { c: whalesColor(0.3) },
        { c: whalesColor(0.6) },
        { c: whalesColor(0.85) },
        { c: whalesColor(1), label: "MANY" },
      ],
    };
  }
  return {
    label: "Win rate",
    stops: [
      { c: winRateColor(0.15), label: "15%" },
      { c: winRateColor(0.35) },
      { c: "rgba(255,255,255,0.04)", zero: true, label: "50%" },
      { c: winRateColor(0.7) },
      { c: winRateColor(0.92), label: "92%" },
    ],
  };
}

export function ScaleLegend({ metric }: { metric: HeatmapMetric }) {
  const { stops, label } = stopsFor(metric);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        style={{
          fontSize: 9,
          color: TOKENS.textMuted,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
        {stops.map((s, i) => (
          <div
            key={i}
            style={{
              width: 22,
              height: 14,
              background: s.c,
              border: s.zero ? `1px dashed ${TOKENS.borderHi}` : "none",
              borderRadius: 3,
              position: "relative",
            }}
          >
            {s.label && (
              <span
                style={{
                  position: "absolute",
                  top: 17,
                  left: "50%",
                  transform: "translateX(-50%)",
                  fontSize: 8,
                  color: s.zero ? TOKENS.textSec : TOKENS.textMuted,
                  fontFamily: TOKENS.mono,
                  fontWeight: 600,
                  letterSpacing: 0.4,
                  whiteSpace: "nowrap",
                }}
              >
                {s.label}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

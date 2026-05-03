import { TOKENS } from "@/lib/tokens";
import type { HeatmapMetric, HeatmapRange } from "@/lib/types";
import { LiveDot } from "./LiveDot";
import { ScaleLegend } from "./ScaleLegend";

const RANGES: ReadonlyArray<HeatmapRange> = ["1h", "24h", "12d", "12w"];
const METRICS: ReadonlyArray<{ id: HeatmapMetric; label: string; unit: string }> = [
  { id: "pnl", label: "PNL", unit: "$" },
  { id: "volume", label: "VOLUME", unit: "$" },
  { id: "signals", label: "СИГНАЛИ", unit: "" },
  { id: "winrate", label: "WIN RATE", unit: "%" },
];

function RangePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? TOKENS.accent : "transparent",
        border: `1px solid ${active ? TOKENS.accent : TOKENS.border}`,
        color: active ? "#1a1410" : TOKENS.textSec,
        fontFamily: TOKENS.font,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        padding: "6px 12px",
        borderRadius: 999,
        cursor: "pointer",
        transition: "all .12s",
        minWidth: 44,
      }}
    >
      {children}
    </button>
  );
}

function MetricTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? TOKENS.panel2 : "transparent",
        border: "none",
        color: active ? TOKENS.text : TOKENS.textSec,
        fontFamily: TOKENS.font,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        padding: "7px 14px",
        borderRadius: 6,
        cursor: "pointer",
        transition: "all .12s",
        boxShadow: active ? `inset 0 0 0 1px ${TOKENS.borderHi}` : "none",
      }}
    >
      {children}
    </button>
  );
}

function rangeSubtitle(range: HeatmapRange): string {
  if (range === "1h") return "last 60 min";
  if (range === "24h") return "last 24 hours";
  if (range === "12d") return "last 12 days";
  return "last 12 weeks";
}

export function Header({
  metric,
  setMetric,
  range,
  setRange,
  isLive,
  trackedCount,
}: {
  metric: HeatmapMetric;
  setMetric: (m: HeatmapMetric) => void;
  range: HeatmapRange;
  setRange: (r: HeatmapRange) => void;
  isLive: boolean;
  trackedCount: number;
}) {
  return (
    <div
      style={{
        padding: "16px 24px 12px",
        borderBottom: `1px solid ${TOKENS.border}`,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 12,
        rowGap: 12,
        flexWrap: "wrap",
        flexShrink: 0,
        minWidth: 0,
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "stretch", gap: 16 }}>
        <div style={{ width: 3, background: TOKENS.accent, borderRadius: 2, alignSelf: "stretch" }} />
        <div>
          <div
            style={{
              fontSize: 11,
              color: TOKENS.textSec,
              letterSpacing: 0.7,
              textTransform: "uppercase",
              fontWeight: 600,
              marginBottom: 6,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            {isLive && <LiveDot />}
            <span style={{ color: isLive ? TOKENS.pos : TOKENS.textSec }}>
              {isLive ? "LIVE" : "HISTORICAL"}
            </span>
            <span style={{ color: TOKENS.borderHi }}>·</span>
            <span>{rangeSubtitle(range)}</span>
            <span style={{ color: TOKENS.borderHi }}>·</span>
            <span>{trackedCount.toLocaleString()} whales tracked</span>
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: TOKENS.text,
              lineHeight: 1,
            }}
          >
            Whale Signal Heatmap
          </h1>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          rowGap: 10,
          flexWrap: "wrap",
          justifyContent: "flex-end",
          minWidth: 0,
        }}
      >
        <ScaleLegend metric={metric} />
        <div style={{ width: 1, height: 26, background: TOKENS.border }} />
        <div style={{ display: "flex", gap: 5 }}>
          {RANGES.map((r) => (
            <RangePill key={r} active={range === r} onClick={() => setRange(r)}>
              {r}
            </RangePill>
          ))}
        </div>
        <div style={{ width: 1, height: 26, background: TOKENS.border }} />
        <div
          style={{
            display: "flex",
            gap: 0,
            background: TOKENS.panel,
            padding: 3,
            borderRadius: 8,
            border: `1px solid ${TOKENS.border}`,
          }}
        >
          {METRICS.map((m) => (
            <MetricTab key={m.id} active={metric === m.id} onClick={() => setMetric(m.id)}>
              {m.label}
              {m.unit ? ` (${m.unit})` : ""}
            </MetricTab>
          ))}
        </div>
      </div>
    </div>
  );
}

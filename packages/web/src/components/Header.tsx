import { TOKENS } from "@/lib/tokens";
import type { HeatmapMetric, LiveRange, Mode, PatternKind } from "@/lib/types";
import { LiveDot } from "./LiveDot";
import { ScaleLegend } from "./ScaleLegend";

const LIVE_RANGES: ReadonlyArray<LiveRange> = ["1h", "24h", "12d", "12w"];
const PATTERN_KINDS: ReadonlyArray<{ kind: PatternKind; label: string }> = [
  { kind: "hour-of-day", label: "HOUR" },
  { kind: "day-of-week", label: "DOW" },
];
const METRICS: ReadonlyArray<{ id: HeatmapMetric; label: string; unit: string }> = [
  { id: "pnl", label: "PNL", unit: "$" },
  { id: "volume", label: "VOLUME", unit: "$" },
  { id: "signals", label: "СИГНАЛИ", unit: "" },
  { id: "winrate", label: "WIN RATE", unit: "%" },
];

function Pill({
  active,
  onClick,
  disabled,
  title,
  children,
}: {
  active: boolean;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      style={{
        background: active && !disabled ? TOKENS.accent : "transparent",
        border: `1px solid ${active && !disabled ? TOKENS.accent : TOKENS.border}`,
        color: disabled
          ? TOKENS.textMuted
          : active
            ? "#1a1410"
            : TOKENS.textSec,
        opacity: disabled ? 0.45 : 1,
        fontFamily: TOKENS.font,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        padding: "6px 12px",
        borderRadius: 999,
        cursor: disabled ? "not-allowed" : "pointer",
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

function ModeToggle({
  mode,
  setMode,
  daysOfData,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  daysOfData: number;
}) {
  // PATTERN is always clickable; we surface low-sample warning in the title
  // attribute so a curious user gets the context on hover.
  const patternTitle =
    daysOfData < 7
      ? `Cyclical pattern view (avg over lookback) — heads-up: only ${daysOfData.toFixed(1)} days of data so far, averages will stabilize after ≥7 days`
      : "Cyclical pattern view (avg over lookback)";

  const renderBtn = (m: Mode, label: string, activeColor: string, title?: string) => {
    const active = mode === m;
    return (
      <button
        onClick={() => setMode(m)}
        title={title}
        style={{
          background: active ? activeColor : "transparent",
          border: "none",
          color: active ? "#0d1117" : TOKENS.textSec,
          fontFamily: TOKENS.font,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          padding: "7px 14px",
          borderRadius: 6,
          cursor: "pointer",
          transition: "all .12s",
        }}
      >
        {label}
      </button>
    );
  };
  return (
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
      {renderBtn("live", "LIVE", TOKENS.pos)}
      {renderBtn("pattern", "PATTERN", TOKENS.accent, patternTitle)}
    </div>
  );
}

function liveRangeSubtitle(range: LiveRange): string {
  if (range === "1h") return "last 60 min";
  if (range === "24h") return "last 24 hours";
  if (range === "12d") return "last 12 days";
  return "last 12 weeks";
}

export function Header({
  mode,
  setMode,
  metric,
  setMetric,
  range,
  setRange,
  patternKind,
  setPatternKind,
  isLive,
  trackedCount,
  lookbackDays,
  daysOfData,
  lowSample,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  metric: HeatmapMetric;
  setMetric: (m: HeatmapMetric) => void;
  range: LiveRange;
  setRange: (r: LiveRange) => void;
  patternKind: PatternKind;
  setPatternKind: (k: PatternKind) => void;
  isLive: boolean;
  trackedCount: number;
  lookbackDays: number;
  patternUnlocked?: boolean; // accepted for compat; unused (PATTERN always on)
  daysOfData: number;
  lowSample: boolean;
}) {
  // Keep both subtitles roughly the same length so the right-side controls
  // don't wrap to a new line when the user toggles modes (was: PATTERN
  // subtitle was 4× longer than LIVE → header height jumped).
  const subtitle = isLive
    ? liveRangeSubtitle(range)
    : `last ${lookbackDays} days${lowSample ? " · low sample" : ""}`;

  const tag = isLive ? (range === "1h" ? "LIVE" : "HISTORICAL") : "PATTERN";
  const tagColor = isLive
    ? range === "1h"
      ? TOKENS.pos
      : TOKENS.textSec
    : TOKENS.accent;

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
        // Reserve enough height for the worst case (controls wrap below the
        // title on a narrow viewport). Without this the grid below "jumps"
        // up and down by ~32px when toggling LIVE/PATTERN or resizing.
        minHeight: 92,
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
            {isLive && range === "1h" && <LiveDot />}
            <span style={{ color: tagColor }}>{tag}</span>
            <span style={{ color: TOKENS.borderHi }}>·</span>
            <span>{subtitle}</span>
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

        <ModeToggle mode={mode} setMode={setMode} daysOfData={daysOfData} />
        <div style={{ width: 1, height: 26, background: TOKENS.border }} />

        {isLive ? (
          <div style={{ display: "flex", gap: 5 }}>
            {LIVE_RANGES.map((r) => (
              <Pill key={r} active={range === r} onClick={() => setRange(r)}>
                {r}
              </Pill>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 5 }}>
            {PATTERN_KINDS.map((p) => (
              <Pill key={p.kind} active={patternKind === p.kind} onClick={() => setPatternKind(p.kind)}>
                {p.label}
              </Pill>
            ))}
          </div>
        )}
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

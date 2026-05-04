import { signOut, useSession } from "next-auth/react";
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
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
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
  locked,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  daysOfData: number;
  locked?: boolean;
}) {
  // PATTERN is always clickable; we surface low-sample warning in the title
  // attribute so a curious user gets the context on hover.
  const patternTitle = locked
    ? "Sign in to switch modes"
    : daysOfData < 7
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
        {locked && !active && <span style={{ marginLeft: 4, opacity: 0.6 }}>🔒</span>}
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
  onRequestLogin,
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
  /** Open the login modal — used to gate range/mode/kind toggles. */
  onRequestLogin: () => void;
}) {
  const { data: session, status } = useSession();
  const isAuthed = status === "authenticated";
  // Wrap a control's onClick — when not authed, intercept and open login instead.
  const gate = <T extends unknown[]>(fn: (...args: T) => void): ((...args: T) => void) => {
    return (...args: T) => {
      if (!isAuthed) onRequestLogin();
      else fn(...args);
    };
  };
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
        padding: "14px 24px 10px",
        borderBottom: `1px solid ${TOKENS.border}`,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        flexShrink: 0,
        minWidth: 0,
        boxSizing: "border-box",
      }}
    >
      {/* Row 1: title (left, vertically centered) + sign-in chip (right). */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          minHeight: 44,
        }}
      >
        <div style={{ display: "flex", alignItems: "stretch", gap: 16, minWidth: 0 }}>
          <div style={{ width: 3, background: TOKENS.accent, borderRadius: 2, alignSelf: "stretch" }} />
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
            <div
              style={{
                fontSize: 10,
                color: TOKENS.textSec,
                letterSpacing: 0.7,
                textTransform: "uppercase",
                fontWeight: 600,
                marginBottom: 4,
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
                fontSize: 20,
                fontWeight: 800,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: TOKENS.text,
                lineHeight: 1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              <span style={{ color: TOKENS.accent }}>OraLab</span>
              <span style={{ color: TOKENS.textSec }}>: </span>
              Whale Signal Heatmap
            </h1>
          </div>
        </div>
        <UserChip
          name={(session?.user?.name as string) || null}
          authed={isAuthed}
          onLogin={onRequestLogin}
          onLogout={() => signOut()}
        />
      </div>

      {/* Row 2: scale legend + mode/range/metric controls, right-aligned. */}
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

        <ModeToggle
          mode={mode}
          setMode={gate(setMode)}
          daysOfData={daysOfData}
          locked={!isAuthed}
        />
        <div style={{ width: 1, height: 26, background: TOKENS.border }} />

        {isLive ? (
          <div style={{ display: "flex", gap: 5 }}>
            {LIVE_RANGES.map((r) => (
              <Pill
                key={r}
                active={range === r}
                onClick={() => (isAuthed ? setRange(r) : onRequestLogin())}
                title={isAuthed ? undefined : "Sign in to switch ranges"}
              >
                {r}
                {!isAuthed && range !== r && <span style={{ marginLeft: 4, opacity: 0.6 }}>🔒</span>}
              </Pill>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 5 }}>
            {PATTERN_KINDS.map((p) => (
              <Pill
                key={p.kind}
                active={patternKind === p.kind}
                onClick={() => (isAuthed ? setPatternKind(p.kind) : onRequestLogin())}
                title={isAuthed ? undefined : "Sign in to switch pattern"}
              >
                {p.label}
                {!isAuthed && patternKind !== p.kind && <span style={{ marginLeft: 4, opacity: 0.6 }}>🔒</span>}
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
          {METRICS.map((m) => {
            const isActive = metric === m.id;
            const locked = !isAuthed && !isActive;
            return (
              <MetricTab
                key={m.id}
                active={isActive}
                onClick={() => (isAuthed ? setMetric(m.id) : onRequestLogin())}
                title={isAuthed ? undefined : "Sign in to switch metric"}
              >
                {m.label}
                {m.unit ? ` (${m.unit})` : ""}
                {locked && <span style={{ marginLeft: 4, opacity: 0.6 }}>🔒</span>}
              </MetricTab>
            );
          })}
        </div>

      </div>
    </div>
  );
}

export function UserChip({
  name,
  authed,
  onLogin,
  onLogout,
}: {
  name: string | null;
  authed: boolean;
  onLogin: () => void;
  onLogout: () => void;
}) {
  if (!authed) {
    return (
      <button
        onClick={onLogin}
        style={{
          background: TOKENS.accent,
          border: "none",
          color: "#1a1410",
          fontFamily: TOKENS.font,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          padding: "7px 14px",
          borderRadius: 6,
          cursor: "pointer",
          transition: "filter .12s",
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.15)")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.filter = "none")}
      >
        Sign in
      </button>
    );
  }
  // Authed: show short label + click → log out (one click — KISS for now;
  // will become a full menu when we add profile pages).
  const display = name && name.startsWith("0x") ? `${name.slice(0, 6)}…${name.slice(-4)}` : (name ?? "user");
  return (
    <button
      onClick={onLogout}
      title={`Signed in as ${name ?? "user"} — click to sign out`}
      style={{
        background: TOKENS.panel,
        border: `1px solid ${TOKENS.borderHi}`,
        color: TOKENS.text,
        fontFamily: TOKENS.font,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.4,
        padding: "6px 12px",
        borderRadius: 6,
        cursor: "pointer",
        transition: "filter .12s",
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.2)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.filter = "none")}
    >
      {display} ✕
    </button>
  );
}

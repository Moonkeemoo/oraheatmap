import { signOut, useSession } from "next-auth/react";
import { TOKENS } from "@/lib/tokens";
import type { HeatmapMetric, LiveRange, Mode, PatternKind } from "@/lib/types";
import { BrandLogo } from "./BrandLogo";
import { ScaleLegend } from "./ScaleLegend";

const LIVE_RANGES: ReadonlyArray<LiveRange> = ["1h", "24h", "12d", "12w"];
const PATTERN_KINDS: ReadonlyArray<{ kind: PatternKind; label: string }> = [
  { kind: "hour-of-day", label: "HOUR" },
  { kind: "day-of-week", label: "DOW" },
];
const METRICS: ReadonlyArray<{ id: HeatmapMetric; label: string; unit: string }> = [
  { id: "pnl", label: "PNL", unit: "$" },
  { id: "volume", label: "VOLUME", unit: "$" },
  { id: "signals", label: "TRADES", unit: "" },
  // "WHALES" = unique whale addresses per cell — the convergence indicator.
  // Higher = more independent top-corpus whales agree on this slot.
  { id: "whales", label: "WHALES", unit: "" },
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
  daysOfData,
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
  // The following props are accepted for backwards compat with the
  // existing call site but no longer rendered — meta strip
  // (HISTORICAL/range/whales-tracked) was redundant with the controls
  // and the StatsBar at the bottom.
  trackedCount?: number;
  lookbackDays?: number;
  patternUnlocked?: boolean;
  daysOfData: number;
  lowSample?: boolean;
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

  return (
    <div
      style={{
        // Tight padding so the header height is driven by the brand logo
        // (60px) and the controls row, not by stale defaults from when
        // the meta strip lived above the controls.
        padding: "8px 24px 8px",
        borderBottom: `1px solid ${TOKENS.border}`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        flexShrink: 0,
        minWidth: 0,
        boxSizing: "border-box",
      }}
    >
      {/* Row 1: sign-in chip (left) + brand logo (right). Both vertical-
          centered so the chip doesn't "float" above the logo. No minHeight
          — let the logo's natural 60px set the row height. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <UserChip
          name={(session?.user?.name as string) || null}
          email={(session?.user?.email as string) || null}
          authed={isAuthed}
          onLogin={onRequestLogin}
          onLogout={() => signOut()}
        />
        {/* Hero brand mark — currentColor inherits color, so on dark bg
            ORALAB reads white and the descriptor (opacity 0.5) the muted
            shade automatically. The redundant HISTORICAL/range/whales-
            tracked strip is gone — same info already lives in the range
            pills (LIVE/24H/etc.) and the StatsBar at the bottom. */}
        <div style={{ color: TOKENS.text }}>
          <BrandLogo size="hero" />
        </div>
      </div>

      {/* Row 2: filter controls, left-aligned. Order: mode → mode-block
          (range OR patternKind) → metric → scale. Reads left-to-right as a
          progressive choice: pick mode, narrow the timing within it, pick
          what to measure, then see the colour legend for that metric. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          rowGap: 10,
          flexWrap: "wrap",
          justifyContent: "flex-start",
          minWidth: 0,
        }}
      >
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
        <div style={{ width: 1, height: 26, background: TOKENS.border }} />

        <ScaleLegend metric={metric} />
      </div>
    </div>
  );
}

export function UserChip({
  name,
  email,
  authed,
  onLogin,
  onLogout,
}: {
  name: string | null;
  email: string | null;
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
  // Authed: prefer the display name; fall back to email; final fallback "guest".
  // Wallet addresses get short-form (0xabcd…1234). Adds a green "live session"
  // dot so the chip clearly reads as "you ARE signed in" instead of looking
  // like another generic button.
  const raw = name || email || "guest";
  const display = raw.startsWith("0x") && raw.length >= 12
    ? `${raw.slice(0, 6)}…${raw.slice(-4)}`
    : raw;
  return (
    <button
      onClick={onLogout}
      title={`Signed in${email ? ` as ${email}` : name ? ` as ${name}` : ""} — click to sign out`}
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
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        maxWidth: 240,
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.2)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.filter = "none")}
    >
      <span
        // Live-session indicator — the green dot reads as "you're online /
        // signed in" at a glance, much clearer than the bare label that
        // looked like another button.
        style={{
          width: 7,
          height: 7,
          borderRadius: 7,
          background: TOKENS.pos,
          boxShadow: `0 0 6px ${TOKENS.pos}`,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontFamily: raw.startsWith("0x") ? TOKENS.mono : TOKENS.font,
        }}
      >
        {display}
      </span>
      <span style={{ color: TOKENS.textMuted, fontSize: 10, flexShrink: 0 }} aria-label="sign out">
        ✕
      </span>
    </button>
  );
}

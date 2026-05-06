import { useSession } from "next-auth/react";
import { TOKENS } from "@/lib/tokens";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { HeatmapMetric, LiveRange, MacroKind, Mode, PatternKind } from "@/lib/types";
import { BrandLogo } from "./BrandLogo";
import { BurgerMenu } from "./BurgerMenu";
import { LiveStatus } from "./LiveStatus";
import { ScaleLegend } from "./ScaleLegend";

const LIVE_RANGES: ReadonlyArray<LiveRange> = ["1h", "24h", "12d", "12w"];
/** Horizontal-scroll row used for control-pill strips on mobile.
 *  Hides the native scrollbar but still scrolls — mobile users pan with
 *  touch and don't expect a visible bar. Inline styles can't reach
 *  ::-webkit-scrollbar so we add a className suppressed in globals.css. */
const mobileScrollRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  overflowX: "auto",
  overflowY: "visible",
  WebkitOverflowScrolling: "touch",
  scrollbarWidth: "none",
  paddingBottom: 2,
};

const MACRO_KINDS: ReadonlyArray<{ kind: MacroKind; label: string; title: string }> = [
  { kind: "hour-week", label: "1H × WEEK", title: "Hourly granularity over the last 7 days (168 cells)" },
  { kind: "day-12w", label: "1D × 12W", title: "Daily granularity over the last 12 weeks (84 cells)" },
];
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
  compact,
}: {
  active: boolean;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
  /** Mobile size — tighter padding + smaller font + no minWidth so the
   *  pills don't dominate a 360px viewport. */
  compact?: boolean;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      style={{
        // Compact (mobile) active state uses a tinted background +
        // colored border + colored text instead of the desktop's
        // full-saturation accent fill. Reads as "selected" without
        // dominating the row visually — matches the tab-strip pattern
        // in MetricTab. Desktop look unchanged.
        background: active && !disabled
          ? compact ? `${TOKENS.accent}1f` : TOKENS.accent
          : "transparent",
        border: `1px solid ${active && !disabled ? TOKENS.accent : TOKENS.border}`,
        color: disabled
          ? TOKENS.textMuted
          : active
            ? compact ? TOKENS.accent : "#1a1410"
            : TOKENS.textSec,
        opacity: disabled ? 0.45 : 1,
        fontFamily: TOKENS.font,
        fontSize: compact ? 10 : 11,
        fontWeight: 700,
        letterSpacing: compact ? 0.3 : 0.5,
        textTransform: "uppercase",
        padding: compact ? "4px 9px" : "6px 12px",
        borderRadius: 999,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all .12s",
        minWidth: compact ? 0 : 44,
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
  compact,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
  compact?: boolean;
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
        fontSize: compact ? 10 : 11,
        fontWeight: 700,
        letterSpacing: compact ? 0.3 : 0.5,
        textTransform: "uppercase",
        padding: compact ? "5px 10px" : "7px 14px",
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
      {renderBtn(
        "macro",
        "MACRO",
        TOKENS.link,
        locked
          ? "Sign in to switch modes"
          : "Density view — last 7 days at hourly granularity, no labels, image carries the signal",
      )}
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
  macroKind,
  setMacroKind,
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
  macroKind: MacroKind;
  setMacroKind: (k: MacroKind) => void;
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
  const { status } = useSession();
  const isAuthed = status === "authenticated";
  const isMobile = useIsMobile();
  // Wrap a control's onClick — when not authed, intercept and open login instead.
  const gate = <T extends unknown[]>(fn: (...args: T) => void): ((...args: T) => void) => {
    return (...args: T) => {
      if (!isAuthed) onRequestLogin();
      else fn(...args);
    };
  };

  // ── Mobile layout ─────────────────────────────────────────────────────
  // Three stacked rows: brand row (burger + logo), mode + sub-toggle pills,
  // metric pills with horizontal-scroll overflow. ScaleLegend hidden —
  // it doesn't fit and is the lowest-utility piece of chrome on mobile.
  if (isMobile) {
    // Render a compact ModeToggle inline so each button's padding/font
    // can shrink without affecting the desktop ModeToggle component.
    const renderModeBtn = (m: Mode, label: string, activeColor: string): React.ReactNode => {
      const active = mode === m;
      const locked = !isAuthed && !active;
      return (
        <button
          key={m}
          onClick={() => (isAuthed ? setMode(m) : onRequestLogin())}
          style={{
            // Tinted-bg + colored-text active state (matches Pill compact
            // and MetricTab compact). Uses an 8-bit hex alpha suffix
            // (e.g. `${color}26` ≈ 15% opacity) so the tint stays
            // legible against the dark panel without going neon.
            background: active ? `${activeColor}26` : "transparent",
            border: "none",
            color: active ? activeColor : TOKENS.textSec,
            fontFamily: TOKENS.font,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 0.3,
            textTransform: "uppercase",
            padding: "5px 10px",
            borderRadius: 5,
            cursor: "pointer",
            boxShadow: active ? `inset 0 0 0 1px ${activeColor}66` : "none",
          }}
        >
          {label}
          {locked && <span style={{ marginLeft: 3, opacity: 0.6 }}>🔒</span>}
        </button>
      );
    };

    return (
      <div
        style={{
          // Notch / status-bar safe inset on iOS Safari, Android Chrome.
          // Falls back to 8px on browsers without env(safe-area-inset-*).
          paddingTop: "max(env(safe-area-inset-top, 8px), 8px)",
          paddingLeft: "max(env(safe-area-inset-left, 10px), 10px)",
          paddingRight: "max(env(safe-area-inset-right, 10px), 10px)",
          paddingBottom: 6,
          borderBottom: `1px solid ${TOKENS.border}`,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          flexShrink: 0,
          minWidth: 0,
          boxSizing: "border-box",
          background: TOKENS.bg,
          // Pin to the top of the viewport on mobile so the brand row +
          // controls stay reachable while the heatmap pane scrolls
          // vertically underneath. Required because iOS Safari's address
          // bar resizes the visual viewport, which can otherwise scroll
          // the whole document and push our header out of view.
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        {/* Row 1 — burger + LiveStatus + brand mark on the right. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <BurgerMenu onRequestLogin={onRequestLogin} />
            <LiveStatus />
          </div>
          <BrandLogo size="compact" />
        </div>

        {/* Row 2 — compact ModeToggle (LIVE/PATTERN/MACRO) + sub-pills
            (range / pattern-kind / macro-kind), all on one row that
            horizontally pans if a mode's sub-pills overflow. */}
        <div style={mobileScrollRowStyle}>
          <div
            style={{
              display: "flex",
              gap: 0,
              background: TOKENS.panel,
              padding: 2,
              borderRadius: 6,
              border: `1px solid ${TOKENS.border}`,
            }}
          >
            {renderModeBtn("live", "LIVE", TOKENS.pos)}
            {renderModeBtn("pattern", "PATTERN", TOKENS.accent)}
            {renderModeBtn("macro", "MACRO", TOKENS.link)}
          </div>
          {mode === "live" && (
            <div style={{ display: "flex", gap: 4 }}>
              {LIVE_RANGES.map((r) => (
                <Pill
                  key={r}
                  compact
                  active={range === r}
                  onClick={() => (isAuthed ? setRange(r) : onRequestLogin())}
                >
                  {r}
                  {!isAuthed && range !== r && (
                    <span style={{ marginLeft: 3, opacity: 0.6 }}>🔒</span>
                  )}
                </Pill>
              ))}
            </div>
          )}
          {mode === "pattern" && (
            <div style={{ display: "flex", gap: 4 }}>
              {PATTERN_KINDS.map((p) => (
                <Pill
                  key={p.kind}
                  compact
                  active={patternKind === p.kind}
                  onClick={() => (isAuthed ? setPatternKind(p.kind) : onRequestLogin())}
                >
                  {p.label}
                  {!isAuthed && patternKind !== p.kind && (
                    <span style={{ marginLeft: 3, opacity: 0.6 }}>🔒</span>
                  )}
                </Pill>
              ))}
            </div>
          )}
          {mode === "macro" && (
            <div style={{ display: "flex", gap: 4 }}>
              {MACRO_KINDS.map((m) => (
                <Pill
                  key={m.kind}
                  compact
                  active={macroKind === m.kind}
                  onClick={() => (isAuthed ? setMacroKind(m.kind) : onRequestLogin())}
                >
                  {m.label}
                  {!isAuthed && macroKind !== m.kind && (
                    <span style={{ marginLeft: 3, opacity: 0.6 }}>🔒</span>
                  )}
                </Pill>
              ))}
            </div>
          )}
        </div>

        {/* Row 3 — metric pills. */}
        <div style={mobileScrollRowStyle}>
          <div
            style={{
              display: "flex",
              gap: 0,
              background: TOKENS.panel,
              padding: 2,
              borderRadius: 6,
              border: `1px solid ${TOKENS.border}`,
            }}
          >
            {METRICS.map((m) => {
              const isActive = metric === m.id;
              const locked = !isAuthed && !isActive;
              return (
                <MetricTab
                  key={m.id}
                  compact
                  active={isActive}
                  onClick={() => (isAuthed ? setMetric(m.id) : onRequestLogin())}
                >
                  {m.label}
                  {locked && <span style={{ marginLeft: 2, opacity: 0.6 }}>🔒</span>}
                </MetricTab>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Desktop layout (unchanged) ─────────────────────────────────────────
  return (
    <div
      style={{
        // Two-column layout: chip+controls stacked on the left, brand logo
        // on the right occupying the full column height (align-self stretch).
        // No row-of-rows + per-row padding stuff — the chip's vertical
        // padding is just the header padding.
        padding: "8px 24px",
        borderBottom: `1px solid ${TOKENS.border}`,
        display: "flex",
        alignItems: "stretch",
        gap: 16,
        flexShrink: 0,
        minWidth: 0,
        boxSizing: "border-box",
      }}
    >
      {/* Left column — chip pinned to the top of the header, controls
          pinned to the bottom. justify-content:space-between gives both
          rows their natural height without an artificial gap pushing the
          chip down (was the "floating" feeling). */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          // Without this, default align-items:stretch makes flex-column
          // children fill the full cross-axis width — both the chip and
          // the controls-row visually stretched into "horse-sized" pills.
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        {/* Burger leads (top-left). Identity card lives INSIDE its dropdown
            now — replaces the standalone UserChip. LiveStatus stays
            outside because it changes every second and the user wants it
            visible without opening anything. */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <BurgerMenu onRequestLogin={onRequestLogin} />
          <LiveStatus />
        </div>
        {/* Filter controls row — read left-to-right: mode → mode-block
            (range OR patternKind) → metric → scale. */}
        <div
          style={{
            // Take full column width so flex-wrap actually has a boundary
            // to break at on narrow viewports. Without this, align-items:
            // flex-start on the parent column would shrink this row to its
            // content width and the row would never wrap.
            width: "100%",
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
        {mode === "live" && (
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
        )}
        {mode === "pattern" && (
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
        {mode === "macro" && (
          <div style={{ display: "flex", gap: 5 }}>
            {MACRO_KINDS.map((m) => (
              <Pill
                key={m.kind}
                active={macroKind === m.kind}
                onClick={() => (isAuthed ? setMacroKind(m.kind) : onRequestLogin())}
                title={isAuthed ? m.title : "Sign in to switch macro frame"}
              >
                {m.label}
                {!isAuthed && macroKind !== m.kind && <span style={{ marginLeft: 4, opacity: 0.6 }}>🔒</span>}
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

      {/* Right column — brand mark at fixed hero size (icon 64, ORALAB 32,
          descriptor 11). align-self:center vertically centers the logo in
          the column whose height is driven by chip + controls. Doesn't
          stretch on tall left-column wraps, so the logo never balloons. */}
      <div
        style={{
          color: TOKENS.text,
          display: "flex",
          alignItems: "center",
          alignSelf: "center",
          flexShrink: 0,
        }}
      >
        <BrandLogo size="hero" />
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

import { useState } from "react";
import { useSession } from "next-auth/react";
import { TOKENS } from "@/lib/tokens";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { HeatmapMetric, LiveRange, MacroKind, Mode, PatternKind, Subject } from "@/lib/types";
import { BrandLogo, GridIcon } from "./BrandLogo";
import { BurgerMenu } from "./BurgerMenu";
import { LiveStatus } from "./LiveStatus";
import { MobileFiltersChip, MobileFiltersSheet } from "./MobileFilters";
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

/** Uppercase 9px section label (WHO / HOW / WHEN / WHAT) sitting above
 *  each control group in the desktop header. Matches the design where
 *  every slice of chrome carries a small grey title so the user can
 *  scan the toolbar by category instead of memorising icon meaning. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9,
        fontFamily: TOKENS.font,
        fontWeight: 700,
        letterSpacing: 1.2,
        color: TOKENS.textMuted,
        textTransform: "uppercase",
        marginBottom: 5,
        // 1ch left padding so the label sits visually centred over a
        // pill-style toggle's first item rather than flush against the
        // rounded corner. Keeps the section grid feeling looser.
        paddingLeft: 2,
      }}
    >
      {children}
    </div>
  );
}

/** Wrap a control group with a SectionLabel header. */
function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
      }}
    >
      <SectionLabel>{label}</SectionLabel>
      {children}
    </div>
  );
}

function SubjectToggle({
  subject,
  setSubject,
  locked,
}: {
  subject: Subject;
  setSubject: (s: Subject) => void;
  locked?: boolean;
}) {
  const renderBtn = (s: Subject, label: string, activeColor: string): React.ReactNode => {
    const active = subject === s;
    return (
      <button
        onClick={() => setSubject(s)}
        title={
          s === "whales" && locked
            ? "Sign in to track whales as rows"
            : s === "trades"
              ? "Categories × time (default)"
              : "Top whales × time — surface each whale's schedule directly"
        }
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
        {s === "whales" && locked && !active && (
          <span style={{ marginLeft: 4, opacity: 0.6 }}>🔒</span>
        )}
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
      {renderBtn("trades", "TRADES", TOKENS.text)}
      {renderBtn("whales", "WHALES", TOKENS.neg)}
    </div>
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
  subject,
  setSubject,
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
  subject: Subject;
  setSubject: (s: Subject) => void;
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
  // Two-row chrome: brand row (burger + LiveStatus + logo) and a single
  // chip summarising the current mode/range/metric selection. Tapping
  // the chip opens MobileFiltersSheet — a bottom-sheet picker with
  // accordion rows for each control. Replaces the older 3-row layout
  // (mode toggle / sub-pills / metric pills strip) which crowded out
  // the heatmap on small viewports.
  if (isMobile) {
    // Setters pass through raw — the sheet does its own per-value
    // auth gate (LIVE/1h/volume free, everything else locked) so we
    // don't want the global `gate()` wrapper here, which forces
    // login on every set including the free defaults.
    return (
      <MobileHeader
        subject={subject}
        setSubject={setSubject}
        mode={mode}
        setMode={setMode}
        range={range}
        setRange={setRange}
        patternKind={patternKind}
        setPatternKind={setPatternKind}
        macroKind={macroKind}
        setMacroKind={setMacroKind}
        metric={metric}
        setMetric={setMetric}
        isAuthed={isAuthed}
        onRequestLogin={onRequestLogin}
      />
    );
  }

  // ── Desktop layout — single horizontal toolbar ────────────────────
  // Sections (WHO / HOW / WHEN / WHAT) sit side by side, each carrying
  // a 9px uppercase label above its control group. Mirrors the
  // labelled-toolbar pattern in the design — user scans by category
  // ("am I picking who? when? what metric?") instead of memorising
  // pill-strip positions. Brand mark + scale legend pinned far right.
  return (
    <div
      style={{
        padding: "10px 20px",
        borderBottom: `1px solid ${TOKENS.border}`,
        display: "flex",
        // Bottom-align everything so the burger + LiveStatus sit on the
        // SAME baseline as the toggle pills inside each Section. With
        // alignItems:center the burger floated mid-row while the pills
        // sat lower (under their WHO/HOW labels) — visually unaligned.
        alignItems: "flex-end",
        gap: 18,
        flexShrink: 0,
        minWidth: 0,
        boxSizing: "border-box",
      }}
    >
      {/* Burger + LiveStatus — leftmost, no section header (these are
          chrome / status, not a filter dimension). Bottom-aligned so it
          lines up with the toggle pills, not their WHO/HOW labels. */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <BurgerMenu onRequestLogin={onRequestLogin} />
        <LiveStatus />
      </div>

      {/* Centre group — flex:1 so it absorbs slack and pushes the brand
          logo to the far right edge. The scale legend belongs to the
          filter cluster (it explains the WHAT metric's colour scale),
          so it sits as the last child of this group rather than next
          to the logo. rowGap covers wrap-to-second-line spacing. */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "flex-end",
          gap: 18,
          rowGap: 12,
          flexWrap: "wrap",
        }}
      >
        <Section label="WHO">
          <SubjectToggle
            subject={subject}
            setSubject={(s) => (isAuthed || s === "trades" ? setSubject(s) : onRequestLogin())}
            locked={!isAuthed}
          />
        </Section>

        <Section label="HOW">
          <ModeToggle
            mode={mode}
            setMode={gate(setMode)}
            daysOfData={daysOfData}
            locked={!isAuthed}
          />
        </Section>

        <Section label="WHEN">
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
        </Section>

        <Section label="WHAT">
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
            {METRICS.filter(
              // WHALES metric collapses to 1 per cell when each row IS a
              // whale. Drop it from the desktop tab strip in the same
              // way mobile filter sheet does.
              (mt) => !(subject === "whales" && mt.id === "whales"),
            ).map((m) => {
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
                  {locked && <span style={{ marginLeft: 4, opacity: 0.6 }}>🔒</span>}
                </MetricTab>
              );
            })}
          </div>
        </Section>

        {/* Scale legend — sits directly after WHAT because it's the
            colour key for whichever metric is selected. alignSelf
            centres it against the (label + pill) section block above
            instead of bottom-aligning to the pill row, so the legend
            visually balances with the WHO/HOW/WHEN/WHAT columns
            rather than dangling below them. */}
        <div style={{ alignSelf: "center" }}>
          <ScaleLegend metric={metric} />
        </div>
      </div>

      {/* Brand mark — icon only (no wordmark / descriptor). The full
          BrandLogo with "oralab POLYMARKET HEATMAP" text was visually
          overwhelming inside the single-row toolbar; the V1a overhead
          design uses just the 9-square mark, mirrored here.
          alignSelf:center balances against the section columns same
          as the legend. */}
      <div
        style={{
          color: TOKENS.text,
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          alignSelf: "center",
        }}
      >
        <GridIcon size={32} />
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


// ── MobileHeader ──────────────────────────────────────────────────────
// Renders the two-row mobile chrome: brand row + filter chip. Owns the
// sheet open/closed state so the surrounding Header stays a thin
// dispatcher between desktop and mobile layouts.
function MobileHeader({
  subject,
  setSubject,
  mode,
  setMode,
  range,
  setRange,
  patternKind,
  setPatternKind,
  macroKind,
  setMacroKind,
  metric,
  setMetric,
  isAuthed,
  onRequestLogin,
}: {
  subject: Subject;
  setSubject: (s: Subject) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  range: LiveRange;
  setRange: (r: LiveRange) => void;
  patternKind: PatternKind;
  setPatternKind: (k: PatternKind) => void;
  macroKind: MacroKind;
  setMacroKind: (k: MacroKind) => void;
  metric: HeatmapMetric;
  setMetric: (m: HeatmapMetric) => void;
  isAuthed: boolean;
  onRequestLogin: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <>
      <div
        style={{
          // --tg-safe-* are written by the /tg Mini App client (system
          // + TG chrome inset summed) so the brand row clears the
          // Close / down-arrow / ⋯ controls TG renders on top in
          // fullscreen mode. Fallback covers regular mobile Safari /
          // Chrome via env() safe-area-inset-*.
          paddingTop: "max(var(--tg-safe-top, env(safe-area-inset-top, 8px)), 8px)",
          paddingLeft: "max(var(--tg-safe-left, env(safe-area-inset-left, 12px)), 12px)",
          paddingRight: "max(var(--tg-safe-right, env(safe-area-inset-right, 12px)), 12px)",
          paddingBottom: 8,
          borderBottom: `1px solid ${TOKENS.border}`,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flexShrink: 0,
          minWidth: 0,
          boxSizing: "border-box",
          background: TOKENS.bg,
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

        {/* Row 2 — filter chip. Tap → opens MobileFiltersSheet. */}
        <MobileFiltersChip
          subject={subject}
          mode={mode}
          range={range}
          patternKind={patternKind}
          macroKind={macroKind}
          metric={metric}
          onOpen={() => setSheetOpen(true)}
        />
      </div>

      <MobileFiltersSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        subject={subject}
        setSubject={setSubject}
        mode={mode}
        setMode={setMode}
        range={range}
        setRange={setRange}
        patternKind={patternKind}
        setPatternKind={setPatternKind}
        macroKind={macroKind}
        setMacroKind={setMacroKind}
        metric={metric}
        setMetric={setMetric}
        isAuthed={isAuthed}
        onRequestLogin={onRequestLogin}
      />
    </>
  );
}

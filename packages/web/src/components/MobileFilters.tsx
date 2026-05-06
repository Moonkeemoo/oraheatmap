"use client";

/**
 * Mobile-only filters UX. Replaces the desktop's three-row Header
 * (mode toggle / sub-pills / metric pills) with a compact chip header
 * that summarises the current selection, plus a bottom-sheet picker
 * the user opens by tapping the chip.
 *
 *   chip:   [ MACRO · 1H × WEEK · TRADES ]  [ FILTERS ⇅ ]
 *   sheet:  Filters                                 Close
 *           ┌─────────────────────────────────────────┐
 *           │ MODE                          MACRO ›   │
 *           │   [ LIVE ] [ PATTERN ] [ MACRO ]        │  ← expanded
 *           ├─────────────────────────────────────────┤
 *           │ RANGE                       1H × WEEK › │
 *           ├─────────────────────────────────────────┤
 *           │ METRIC                          TRADES › │
 *           └─────────────────────────────────────────┘
 *           [ RESET ]            [ APPLY ]
 *
 * Pills inside the sheet commit changes immediately (state lifted via
 * setters from the parent Heatmap). RESET reverts the trio to defaults
 * (LIVE / 1h / volume). APPLY just closes the sheet — there is no
 * pending/committed split, the heatmap reflects each tap as it happens.
 */

import { useEffect, useState } from "react";
import { TOKENS } from "@/lib/tokens";
import type {
  HeatmapMetric,
  LiveRange,
  MacroKind,
  Mode,
  PatternKind,
} from "@/lib/types";

type ModeMeta = { id: Mode; label: string; color: string };

const MODES: ReadonlyArray<ModeMeta> = [
  { id: "live", label: "LIVE", color: TOKENS.pos },
  { id: "pattern", label: "PATTERN", color: TOKENS.accent },
  { id: "macro", label: "MACRO", color: TOKENS.link },
];

const LIVE_RANGES: ReadonlyArray<LiveRange> = ["1h", "24h", "12d", "12w"];

const PATTERN_KINDS: ReadonlyArray<{ id: PatternKind; label: string }> = [
  { id: "hour-of-day", label: "HOUR" },
  { id: "day-of-week", label: "DOW" },
];

const MACRO_KINDS: ReadonlyArray<{ id: MacroKind; label: string }> = [
  { id: "hour-week", label: "1H × WEEK" },
  { id: "day-12w", label: "1D × 12W" },
];

const METRICS: ReadonlyArray<{ id: HeatmapMetric; label: string }> = [
  { id: "pnl", label: "PNL" },
  { id: "volume", label: "VOLUME" },
  { id: "signals", label: "TRADES" },
  { id: "whales", label: "WHALES" },
  { id: "winrate", label: "WIN RATE" },
];

function modeMeta(id: Mode): ModeMeta {
  return MODES.find((m) => m.id === id) ?? MODES[0]!;
}

function rangeText(
  mode: Mode,
  range: LiveRange,
  patternKind: PatternKind,
  macroKind: MacroKind,
): string {
  if (mode === "live") return range.toUpperCase();
  if (mode === "pattern") {
    return PATTERN_KINDS.find((p) => p.id === patternKind)?.label ?? "HOUR";
  }
  return MACRO_KINDS.find((m) => m.id === macroKind)?.label ?? "1H × WEEK";
}

function metricText(metric: HeatmapMetric): string {
  return METRICS.find((m) => m.id === metric)?.label ?? metric;
}

// ── Chip header ────────────────────────────────────────────────────────

export function MobileFiltersChip({
  mode,
  range,
  patternKind,
  macroKind,
  metric,
  onOpen,
}: {
  mode: Mode;
  range: LiveRange;
  patternKind: PatternKind;
  macroKind: MacroKind;
  metric: HeatmapMetric;
  onOpen: () => void;
}) {
  const m = modeMeta(mode);
  return (
    <button
      onClick={onOpen}
      style={{
        background: TOKENS.panel,
        border: `1px solid ${TOKENS.border}`,
        borderRadius: 12,
        padding: "11px 14px",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        cursor: "pointer",
        fontFamily: TOKENS.font,
        color: TOKENS.text,
        boxSizing: "border-box",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0.4,
          minWidth: 0,
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ color: m.color }}>{m.label}</span>
        <Dot />
        <span>{rangeText(mode, range, patternKind, macroKind)}</span>
        <Dot />
        <span>{metricText(metric)}</span>
      </span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          color: TOKENS.textSec,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.5,
          flexShrink: 0,
        }}
      >
        FILTERS
        <span aria-hidden style={{ fontSize: 12, lineHeight: 1 }}>⇅</span>
      </span>
    </button>
  );
}

function Dot() {
  return (
    <span
      aria-hidden
      style={{
        color: TOKENS.textMuted,
        fontSize: 14,
        lineHeight: 1,
        opacity: 0.6,
      }}
    >
      ·
    </span>
  );
}

// ── Sheet ──────────────────────────────────────────────────────────────

type ExpandedRow = "mode" | "range" | "metric" | null;

export function MobileFiltersSheet({
  open,
  onClose,
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
  open: boolean;
  onClose: () => void;
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
  // Default to MODE expanded — the picker is most actionable to the
  // user when they first open the sheet, and the row can quickly
  // collapse if they want to see all three at once.
  const [expanded, setExpanded] = useState<ExpandedRow>("mode");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const reset = (): void => {
    setMode("live");
    setRange("1h");
    setMetric("volume");
    // Keep patternKind/macroKind — they only matter inside their
    // respective modes which we just left.
  };

  const m = modeMeta(mode);
  const rngColor =
    mode === "live"
      ? TOKENS.pos
      : mode === "pattern"
        ? TOKENS.accent
        : TOKENS.link;

  // Unauth users get LIVE/1h/volume free; everything else opens login.
  // Same gating logic as the desktop Header — keep it explicit so the
  // sheet doesn't silently let unauth users into Pro features.
  const lockedMode = (id: Mode): boolean => !isAuthed && id !== "live";
  const lockedRange = (r: LiveRange): boolean => !isAuthed && r !== "1h";
  const lockedMetric = (id: HeatmapMetric): boolean => !isAuthed && id !== "volume";

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          zIndex: 100,
          animation: "tipIn .18s ease-out",
        }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          width: "100vw",
          maxHeight: "85vh",
          background: TOKENS.panel,
          borderTop: `1px solid ${TOKENS.borderHi}`,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          boxShadow: "0 -20px 60px rgba(0,0,0,0.6)",
          zIndex: 101,
          padding: "10px 14px",
          paddingBottom: "max(env(safe-area-inset-bottom, 14px), 14px)",
          display: "flex",
          flexDirection: "column",
          fontFamily: TOKENS.font,
          color: TOKENS.text,
          animation: "drawerInBottom .22s ease-out",
          overflowY: "auto",
          boxSizing: "border-box",
        }}
      >
        {/* Drag-handle bar — pure visual cue that this is a bottom sheet. */}
        <div
          aria-hidden
          style={{
            alignSelf: "center",
            width: 40,
            height: 4,
            borderRadius: 4,
            background: TOKENS.border,
            marginBottom: 10,
          }}
        />

        {/* Title row. */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            padding: "0 4px",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.3 }}>
            Filters
          </span>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: TOKENS.textSec,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              padding: "4px 6px",
            }}
          >
            Close
          </button>
        </div>

        {/* Mode row. */}
        <Row
          label="Mode"
          valueText={m.label}
          valueColor={m.color}
          isExpanded={expanded === "mode"}
          onToggle={() => setExpanded(expanded === "mode" ? null : "mode")}
        >
          <PillRow>
            {MODES.map((meta) => (
              <Pill
                key={meta.id}
                active={mode === meta.id}
                color={meta.color}
                locked={lockedMode(meta.id)}
                onClick={() =>
                  lockedMode(meta.id) ? onRequestLogin() : setMode(meta.id)
                }
              >
                {meta.label}
              </Pill>
            ))}
          </PillRow>
        </Row>

        {/* Range row — pills are mode-aware. */}
        <Row
          label="Range"
          valueText={rangeText(mode, range, patternKind, macroKind)}
          valueColor={rngColor}
          isExpanded={expanded === "range"}
          onToggle={() => setExpanded(expanded === "range" ? null : "range")}
        >
          <PillRow>
            {mode === "live" &&
              LIVE_RANGES.map((r) => (
                <Pill
                  key={r}
                  active={range === r}
                  color={rngColor}
                  locked={lockedRange(r)}
                  onClick={() =>
                    lockedRange(r) ? onRequestLogin() : setRange(r)
                  }
                >
                  {r.toUpperCase()}
                </Pill>
              ))}
            {mode === "pattern" &&
              PATTERN_KINDS.map((p) => (
                <Pill
                  key={p.id}
                  active={patternKind === p.id}
                  color={rngColor}
                  locked={!isAuthed}
                  onClick={() =>
                    !isAuthed ? onRequestLogin() : setPatternKind(p.id)
                  }
                >
                  {p.label}
                </Pill>
              ))}
            {mode === "macro" &&
              MACRO_KINDS.map((mk) => (
                <Pill
                  key={mk.id}
                  active={macroKind === mk.id}
                  color={rngColor}
                  locked={!isAuthed}
                  onClick={() =>
                    !isAuthed ? onRequestLogin() : setMacroKind(mk.id)
                  }
                >
                  {mk.label}
                </Pill>
              ))}
          </PillRow>
        </Row>

        {/* Metric row. */}
        <Row
          label="Metric"
          valueText={metricText(metric)}
          valueColor={TOKENS.text}
          isExpanded={expanded === "metric"}
          onToggle={() => setExpanded(expanded === "metric" ? null : "metric")}
        >
          <PillRow>
            {METRICS.map((mt) => (
              <Pill
                key={mt.id}
                active={metric === mt.id}
                color={TOKENS.accent}
                locked={lockedMetric(mt.id)}
                onClick={() =>
                  lockedMetric(mt.id) ? onRequestLogin() : setMetric(mt.id)
                }
              >
                {mt.label}
              </Pill>
            ))}
          </PillRow>
        </Row>

        {/* Reset / Apply. */}
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button
            onClick={reset}
            style={{
              flex: 1,
              padding: "13px 12px",
              background: "rgba(255,255,255,0.06)",
              border: "none",
              color: TOKENS.text,
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 10,
              cursor: "pointer",
              letterSpacing: 0.4,
            }}
          >
            RESET
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 2,
              padding: "13px 12px",
              background: "#fff",
              border: "none",
              color: "#0d1117",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 10,
              cursor: "pointer",
              letterSpacing: 0.4,
            }}
          >
            APPLY
          </button>
        </div>
      </div>
    </>
  );
}

// ── Internal sub-components ────────────────────────────────────────────

function Row({
  label,
  valueText,
  valueColor,
  isExpanded,
  onToggle,
  children,
}: {
  label: string;
  valueText: string;
  valueColor: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        borderRadius: 12,
        marginBottom: 8,
        overflow: "hidden",
      }}
    >
      <button
        onClick={onToggle}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          padding: "13px 16px",
          background: "transparent",
          border: "none",
          color: TOKENS.text,
          fontFamily: "inherit",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.6,
            color: TOKENS.textSec,
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: valueColor,
              letterSpacing: 0.3,
            }}
          >
            {valueText}
          </span>
          <span
            aria-hidden
            style={{
              color: TOKENS.textMuted,
              fontSize: 14,
              lineHeight: 1,
              transition: "transform .15s",
              transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
            }}
          >
            ›
          </span>
        </span>
      </button>
      {isExpanded && (
        <div style={{ padding: "0 14px 14px" }}>{children}</div>
      )}
    </div>
  );
}

function PillRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{children}</div>
  );
}

function Pill({
  active,
  color,
  locked,
  onClick,
  children,
}: {
  active: boolean;
  color: string;
  locked?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? `${color}1f` : "transparent",
        border: `1px solid ${active ? color : TOKENS.border}`,
        color: active ? color : TOKENS.textSec,
        opacity: locked && !active ? 0.55 : 1,
        fontFamily: "inherit",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.3,
        textTransform: "uppercase",
        padding: "7px 12px",
        borderRadius: 999,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
        transition: "all .12s",
      }}
    >
      {active && (
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: 6,
            background: color,
            display: "inline-block",
          }}
        />
      )}
      {children}
      {locked && !active && (
        <span aria-hidden style={{ marginLeft: 2, opacity: 0.6 }}>🔒</span>
      )}
    </button>
  );
}

"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState } from "react";
import { categoryMeta } from "@/lib/categories";
import { makeIntensityFn } from "@/lib/colors";
import { useIsMobile } from "@/hooks/useIsMobile";
import { applyOrder } from "@/lib/row-order";
import { marketUrl } from "@/lib/polymarket-url";
import { TOKENS } from "@/lib/tokens";
import type { Category, HeatmapBucket, HeatmapCell, HeatmapMetric, HeatmapResponse } from "@/lib/types";
import { Cell } from "./Cell";
import type { FlashByCell, HeatByCell } from "./Heatmap";
import type { TooltipAnchor } from "./Tooltip";

/** Lighten a hex color by mixing it with white. amount=0 → original, 1 → white. */
function tint(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const hex2 = (c: number) => c.toString(16).padStart(2, "0");
  return `#${hex2(mix(r))}${hex2(mix(g))}${hex2(mix(b))}`;
}

// 130 (was 100) — the trailing › chevron + drag-handle column ate into the
// text area enough to clip "POLITICS" → "POLI…". 30 extra px restores room
// for the 8-char L1 labels without making the heatmap noticeably narrower.
const LABEL_W = 130;
const LABEL_W_L3 = 170;
const TIME_ROW_H = 26;
const MIN_ROW_H = 38;
const MIN_ROW_H_L3 = 44;
/** Fixed-width drag handle column inside the label cell, only rendered when
 *  reorder is enabled (auth'd). Kept narrow so it doesn't squeeze the label. */
const DRAG_HANDLE_W = 14;

function formatSlotLabel(
  bucket: HeatmapBucket,
  mode: HeatmapResponse["mode"],
  patternKind: HeatmapResponse["patternKind"],
  slotPosition: number,
  range?: HeatmapResponse["range"],
): string {
  if (mode === "pattern") {
    if (patternKind === "hour-of-day") {
      const h = (slotPosition * 2) % 24;
      return `${String(h).padStart(2, "0")}:00`;
    }
    return bucket.label ?? String(bucket.index);
  }
  if (!bucket.ts) return bucket.label ?? "";
  const d = new Date(bucket.ts);
  if (range === "1h" || range === "24h") {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mo}`;
}

type RowMeta = {
  cat: string;
  rowColor: string;
  rowLabel: string;
  rawLabel: string;
  isResolved: boolean;
  isL3: boolean;
  isDrillRow: boolean;
  l3Url: string | null;
};

function makeRowMeta(
  cat: string,
  data: HeatmapResponse,
): RowMeta {
  // Whales mode — row keys are whale addresses, not category slugs.
  // Render a neutral grey pill (colour-as-identity is meaningless when
  // every row is a whale). LVL was previously appended inline to the
  // alias but ate label-column width and made every name truncate;
  // dropped — the score still lives in WhaleDrawer's header badge for
  // anyone who taps the row.
  if (data.subject === "whales") {
    const meta = data.whaleMeta?.[cat];
    const alias = meta?.alias ?? shortenAddress(cat);
    return {
      cat,
      // Per-address deterministic colour (whaleColor on the API). Drives
      // the marker bar in the bare-pill row label so each whale stays
      // visually distinguishable across the list, mirroring the way
      // category rows pick up their hue. Falls back to the neutral
      // panel grey only if the meta is missing.
      rowColor: meta?.color ?? "#252b33",
      rowLabel: alias,
      rawLabel: alias,
      isResolved: false,
      isL3: false,
      isDrillRow: false,
      l3Url: null,
    };
  }
  const isDrillRow = data.drillCategory !== null;
  const isL3 = data.drillSubcategory !== null;
  const isResolved = isL3 && data.resolvedRows.includes(cat);
  const baseColor = isDrillRow
    ? categoryMeta(data.drillCategory as Category).color
    : categoryMeta(cat as Category).color;
  const rowColor = isDrillRow ? tint(baseColor, isResolved ? 0.4 : 0.05) : baseColor;
  const rawLabel = isDrillRow
    ? data.subcategoryLabels?.[cat] ?? (isL3 ? "(unknown)" : cat.toUpperCase())
    : categoryMeta(cat as Category).label;
  const l3Url = isL3 ? marketUrl(data.marketSlugs?.[cat] ?? null) : null;
  return {
    cat,
    rowColor,
    rowLabel: rawLabel,
    rawLabel,
    isResolved,
    isL3,
    isDrillRow,
    l3Url,
  };
}

function shortenAddress(addr: string): string {
  if (!addr.startsWith("0x") || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** A grip-icon. Only renders an interactive handle when reorderEnabled.
 *  Disabled state shows a lock + tooltip, prompting login. */
function DragHandle({
  reorderEnabled,
  onRequestLogin,
  listeners,
  attributes,
}: {
  reorderEnabled: boolean;
  onRequestLogin?: () => void;
  // dnd-kit's listeners/attributes are loosely typed; pass-through.
  listeners?: Record<string, (event: unknown) => void>;
  attributes?: Record<string, unknown>;
}) {
  const common: React.CSSProperties = {
    width: DRAG_HANDLE_W,
    height: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: TOKENS.textSec,
    flexShrink: 0,
    background: "transparent",
    border: "none",
    padding: 0,
  };
  if (!reorderEnabled) {
    return (
      <button
        type="button"
        title="Sign in to customize row order"
        onClick={(e) => {
          e.stopPropagation();
          onRequestLogin?.();
        }}
        style={{ ...common, cursor: "pointer", opacity: 0.45 }}
        aria-label="Sign in to reorder rows"
      >
        <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
          <rect x="2" y="5" width="6" height="6" rx="1" fill="currentColor" />
          <path
            d="M3 5V3.5a2 2 0 1 1 4 0V5"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
          />
        </svg>
      </button>
    );
  }
  return (
    <button
      type="button"
      title="Drag to reorder"
      style={{ ...common, cursor: "grab", touchAction: "none" }}
      aria-label="Drag to reorder row"
      {...(attributes as object)}
      {...(listeners as object)}
    >
      <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true">
        <circle cx="3" cy="3" r="1.1" fill="currentColor" />
        <circle cx="7" cy="3" r="1.1" fill="currentColor" />
        <circle cx="3" cy="7" r="1.1" fill="currentColor" />
        <circle cx="7" cy="7" r="1.1" fill="currentColor" />
        <circle cx="3" cy="11" r="1.1" fill="currentColor" />
        <circle cx="7" cy="11" r="1.1" fill="currentColor" />
      </svg>
    </button>
  );
}

/** Corner-pinned indicator that signals "this badge is clickable":
 *    L1/L2 (drill into deeper level)  → ›  (chevron-right)
 *    L3 with polymarket link          → ↗  (external link arrow)
 *  Absolutely positioned in the top-right corner of the badge so it stays
 *  put regardless of text length / wrap — multi-line L3 markets no longer
 *  have a floating arrow that lands wherever the last word ended. */
function ClickAffordance({ kind }: { kind: "drill" | "external" }) {
  return (
    <span
      data-affordance
      style={{
        position: "absolute",
        top: 4,
        right: 6,
        // Hidden by default — appears only on row hover via the badge's
        // onMouseEnter handler bumping data-affordance opacity to 1.
        // Matches the Lists L3 chrome where the chevron / external arrow
        // is a hover-only affordance, not a permanent visual.
        opacity: 0,
        fontSize: kind === "external" ? 10 : 13,
        lineHeight: 1,
        transition: "transform .15s, opacity .15s",
        color: "rgba(255,255,255,0.85)",
        // Click goes through to the parent button/anchor — this span is
        // decoration-only.
        pointerEvents: "none",
      }}
      aria-hidden="true"
    >
      {kind === "drill" ? "›" : "↗"}
    </span>
  );
}

/** Render the label badge for a row — pure UI, used by both the live row
 *  and the DragOverlay clone. */
function RowLabelBadge({
  meta,
  clickableRow,
  onRowClick,
  isMobile,
  hideAffordance,
  isLive,
  dragListeners,
  dragAttributes,
}: {
  meta: RowMeta;
  clickableRow: boolean;
  onRowClick?: (rowKey: string) => void;
  isMobile?: boolean;
  /** Suppress the › drill / ↗ external-link chevron in the corner.
   *  Used in whales-subject rows where the click target IS the row
   *  itself (opens the whale drawer) but there's no nested level for
   *  a drill arrow to point at. */
  hideAffordance?: boolean;
  /** When true, render a green tick on the right of the pill — the
   *  row had at least one signal in the most recent bucket, i.e.
   *  "this whale is firing right now". Only meaningful on whales-
   *  subject LIVE rows; trades-subject rows ignore it. */
  isLive?: boolean;
  /** dnd-kit useSortable listeners — when present, the badge acts as
   *  the drag source. Mobile only: long-press on the badge starts a
   *  reorder drag (TouchSensor 250ms delay activation). Desktop drags
   *  through a separate grip column instead. */
  dragListeners?: Record<string, (event: unknown) => void>;
  dragAttributes?: Record<string, unknown>;
}) {
  const { isL3, isResolved, rowColor, rowLabel, rawLabel, l3Url } = meta;
  const isInteractive = clickableRow || l3Url !== null;
  const titleText = isL3
    ? `${rawLabel}${isResolved ? " · resolved" : ""}${l3Url ? " — open on Polymarket" : ""}`
    : clickableRow
      ? `Drill into ${meta.isDrillRow ? "markets" : "subcategories"}`
      : undefined;
  // ── Lists L3 design ────────────────────────────────────────────────
  // Bare-pill chrome: transparent background, faint hairline border,
  // text in pure white, with a vertical bar marker on the LEFT in the
  // category/whale colour. Replaces the older fully-coloured badge —
  // saturated category backgrounds were dominating the eye when sat
  // next to heat-coloured cells, and hue parity between marker bar
  // and category cells is enough to read "this is the SPORTS row".
  // Same chrome applies on desktop AND mobile; the marker bar shrinks
  // for mobile / dense L3 so it doesn't tower over short row heights.
  const markerW = 3;
  const markerH = isMobile ? 12 : isL3 ? 12 : 16;
  const padRight = !hideAffordance && isInteractive
    ? (isMobile ? 10 : 14)
    : (isMobile ? 4 : 8);
  const padLeft = isMobile ? 6 : 8;
  const restingBorder = "1px solid rgba(255,255,255,0.07)";
  const restingBg = "transparent";
  const hoverBorder = "1px solid rgba(255,255,255,0.16)";
  const hoverBg = "rgba(255,255,255,0.04)";
  const badgeStyle: React.CSSProperties = {
    background: restingBg,
    color: "#fff",
    border: restingBorder,
    fontFamily: "inherit",
    fontSize: isMobile && !isL3 ? 11 : 10,
    fontWeight: isL3 ? 600 : 700,
    letterSpacing: isL3 ? 0.2 : isMobile ? 0.4 : 0.6,
    padding: `5px ${padRight}px 5px ${padLeft}px`,
    borderRadius: 6,
    textTransform: isL3 ? "none" : "uppercase",
    // Bar marker sits on the left of the text, so left-align label
    // content. L3 already wanted left alignment for multi-line market
    // questions; L1/L2 switch from centre to left to match.
    textAlign: "left",
    width: "100%",
    cursor: isInteractive ? "pointer" : "default",
    transition: "background-color .12s, border-color .12s",
    opacity: isResolved ? 0.55 : 1,
    textDecoration: isResolved ? "line-through" : "none",
    boxSizing: "border-box",
    position: "relative",
    whiteSpace: isL3 ? "normal" : "nowrap",
    overflow: "hidden",
    lineHeight: isL3 ? "1.25" : undefined,
    wordBreak: isL3 ? ("break-word" as const) : undefined,
    display: "inline-flex",
    alignItems: "center",
    gap: isMobile ? 6 : 8,
  };
  const onEnter = (e: React.MouseEvent<HTMLElement>): void => {
    if (!isInteractive) return;
    const el = e.currentTarget;
    el.style.background = hoverBg;
    el.style.borderColor = "rgba(255,255,255,0.16)";
    el.style.border = hoverBorder;
    const aff = el.querySelector<HTMLSpanElement>("[data-affordance]");
    if (aff) {
      aff.style.opacity = "1";
      aff.style.transform = "translateX(2px)";
    }
  };
  const onLeave = (e: React.MouseEvent<HTMLElement>): void => {
    if (!isInteractive) return;
    const el = e.currentTarget;
    el.style.background = restingBg;
    el.style.border = restingBorder;
    const aff = el.querySelector<HTMLSpanElement>("[data-affordance]");
    if (aff) {
      aff.style.opacity = "0";
      aff.style.transform = "translateX(0)";
    }
  };
  const affordanceKind: "drill" | "external" | null = hideAffordance
    ? null
    : l3Url
      ? "external"
      : clickableRow
        ? "drill"
        : null;
  const draggableStyle: React.CSSProperties = dragListeners
    ? { ...badgeStyle, touchAction: "none", userSelect: "none" }
    : badgeStyle;
  // Marker bar — a thin vertical strip in the category/whale colour
  // sitting at the leftmost edge of the pill. Uses meta.rowColor so
  // category rows stay hue-coded and whale rows pick up their per-
  // address deterministic colour.
  const marker = (
    <span
      aria-hidden="true"
      style={{
        flex: "0 0 auto",
        width: markerW,
        height: markerH,
        borderRadius: 2,
        background: rowColor,
      }}
    />
  );
  // Body text — wrapped so flex row can pin marker at left + chevron
  // at right, with the label growing to fill the middle. L3 multi-
  // line clamp moves to this inner span so the marker bar stays a
  // single fixed-height element next to the (potentially) two-line
  // label.
  const labelEl = (
    <span
      style={{
        flex: 1,
        minWidth: 0,
        overflow: "hidden",
        textOverflow: isL3 ? undefined : "ellipsis",
        ...(isL3
          ? {
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical" as const,
            }
          : null),
      }}
    >
      {rowLabel}
    </span>
  );
  // Live tick — small green dot with halo on the right of the pill,
  // signalling "this whale fired a trade in the most recent bucket".
  // Only rendered when isLive is true. The halo (box-shadow glow) is
  // what separates a "live now" indicator from a static colour swatch
  // — the soft green bloom reads as "active heartbeat" at a glance.
  const liveTick = isLive ? (
    <span
      aria-hidden="true"
      title="Active right now"
      style={{
        flex: "0 0 auto",
        width: 6,
        height: 6,
        borderRadius: 6,
        background: "#22c55e",
        boxShadow: "0 0 6px rgba(34,197,94,0.65)",
      }}
    />
  ) : null;
  if (l3Url) {
    return (
      <a
        href={l3Url}
        target="_blank"
        rel="noopener noreferrer"
        title={titleText}
        style={draggableStyle}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        {...(dragAttributes ?? {})}
        {...(dragListeners ?? {})}
      >
        {marker}
        {labelEl}
        {liveTick}
        {affordanceKind && <ClickAffordance kind={affordanceKind} />}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={clickableRow ? () => onRowClick?.(meta.cat) : undefined}
      disabled={!clickableRow}
      title={titleText}
      style={draggableStyle}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      {...(dragAttributes ?? {})}
      {...(dragListeners ?? {})}
    >
      {marker}
      {labelEl}
      {liveTick}
      {affordanceKind && <ClickAffordance kind={affordanceKind} />}
    </button>
  );
}

/** A single sortable row. Wrapped in a subgrid container so it spans all
 *  columns of the outer grid and shares the column template. The whole row
 *  receives the sortable transform — both label badge and data cells slide
 *  together as a unit, matching the user's mental model of "category =
 *  the entire horizontal stripe of values that belongs to it". */
function SortableRow({
  rowKey,
  reorderEnabled,
  isHovered,
  hoverEnabled,
  onHoverChange,
  children,
}: {
  rowKey: string;
  reorderEnabled: boolean;
  /** Hovered row gets an explicit highlight (outline + faint backdrop)
   *  WITHOUT dimming siblings — dimming was rejected because lowering
   *  opacity on the colour-coded cells in other rows shifts their
   *  apparent intensity tone, making the heatmap look misleading at
   *  a glance. Highlighting only the hovered row keeps the data read
   *  truthful. */
  isHovered: boolean;
  /** When false, skip the mouseEnter/Leave wiring + the highlight
   *  styles entirely. Touch devices don't have a hover concept and
   *  the previous behaviour painted a stale outline on the last
   *  tapped row, which was confusing — the user wasn't pointing at
   *  it. */
  hoverEnabled: boolean;
  onHoverChange: (rowKey: string | null) => void;
  children: (
    listeners: Record<string, (event: unknown) => void> | undefined,
    attributes: Record<string, unknown>,
    isDragging: boolean,
  ) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: rowKey,
    disabled: !reorderEnabled,
  });
  const style: React.CSSProperties = {
    gridColumn: "1 / -1",
    display: "grid",
    gridTemplateColumns: "subgrid",
    gap: 4,
    transform: CSS.Transform.toString(transform),
    transition: [transition, "box-shadow 140ms ease, background-color 140ms ease"]
      .filter(Boolean)
      .join(", "),
    opacity: isDragging ? 0 : 1,
    zIndex: isDragging ? 2 : isHovered ? 1 : "auto",
    position: "relative",
    // Hovered row picks up a soft amber outline + faint accent
    // backdrop (~50% / ~4% alpha so it reads as "selected" without
    // competing with the heat-coloured cells for attention).
    boxShadow: isHovered && hoverEnabled
      ? `0 0 0 1px ${TOKENS.accent}66`
      : "none",
    backgroundColor: isHovered && hoverEnabled ? `${TOKENS.accent}0a` : "transparent",
    borderRadius: isHovered && hoverEnabled ? 6 : 0,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      data-row-key={rowKey}
      onMouseEnter={hoverEnabled ? () => onHoverChange(rowKey) : undefined}
      onMouseLeave={hoverEnabled ? () => onHoverChange(null) : undefined}
    >
      {children(
        listeners as unknown as Record<string, (e: unknown) => void> | undefined,
        attributes as unknown as Record<string, unknown>,
        isDragging,
      )}
    </div>
  );
}

/** Macro-mode top row: groups buckets into chips that line up with the
 *  cells below. For hour-week (1h × 7d) groups by day → 7 chips. For
 *  day-12w (1d × 12w) groups by month → 3-4 chips with month names. */
function MacroDayHeader({
  buckets,
  gap,
  macroKind,
}: {
  buckets: ReadonlyArray<HeatmapBucket>;
  gap: number;
  macroKind: "hour-week" | "day-12w";
}) {
  // Walk the buckets and group adjacent ones with the same calendar
  // bucket — day for hour-week, month for day-12w. The matching unit
  // is the "natural" boundary at that timescale.
  const groups: Array<{ start: number; count: number; date: Date }> = [];
  const groupKey = (d: Date): string =>
    macroKind === "hour-week"
      ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      : `${d.getFullYear()}-${d.getMonth()}`;
  for (let i = 0; i < buckets.length; i++) {
    const ts = buckets[i]?.ts;
    if (!ts) continue;
    const d = new Date(ts);
    const last = groups[groups.length - 1];
    if (last && groupKey(last.date) === groupKey(d)) {
      last.count++;
    } else {
      groups.push({ start: i, count: 1, date: d });
    }
  }
  const today = new Date();
  const todayKey =
    macroKind === "hour-week"
      ? `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`
      : `${today.getFullYear()}-${today.getMonth()}`;
  const isCurrent = (d: Date): boolean => groupKey(d) === todayKey;
  return (
    <div
      style={{
        gridColumn: "1 / -1",
        display: "grid",
        gridTemplateColumns: "subgrid",
        gap,
      }}
    >
      <div />
      {groups.map((g, gi) => {
        const isToday = isCurrent(g.date);
        const isFirst = gi === 0;
        return (
          <div
            key={gi}
            style={{
              gridColumn: `span ${g.count}`,
              minWidth: 0,
              fontSize: 10,
              fontFamily: TOKENS.mono,
              color: isToday ? TOKENS.pos : TOKENS.textSec,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              padding: "3px 8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              // Crisp left edge to mark the day boundary — accent for
              // TODAY, borderHi for prior days. No edge on the very
              // first chip (start of window, not a between-days line).
              borderLeft: isFirst
                ? "none"
                : isToday
                  ? `2px solid ${TOKENS.pos}`
                  : `2px solid ${TOKENS.borderHi}`,
              // Faint zebra striping so adjacent days are read as
              // discrete chunks at a glance, not one long strip.
              background: gi % 2 === 0 ? "transparent" : "rgba(255,255,255,0.025)",
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}
            title={
              macroKind === "hour-week"
                ? g.date.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })
                : `${g.date.toLocaleDateString(undefined, {
                    month: "long",
                    year: "numeric",
                  })} · ${g.count} day${g.count === 1 ? "" : "s"}`
            }
          >
            {isToday && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 6,
                  background: TOKENS.pos,
                  boxShadow: `0 0 6px ${TOKENS.pos}`,
                  marginRight: 6,
                  flexShrink: 0,
                }}
              />
            )}
            {macroKind === "hour-week"
              ? fmtMacroDay(g.date, isToday)
              : fmtMacroMonth(g.date, g.count, isToday)}
          </div>
        );
      })}
    </div>
  );
}

function lastDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const WEEKDAY_SHORT: ReadonlyArray<string> = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtMacroDay(d: Date, isToday: boolean): string {
  const wd = WEEKDAY_SHORT[d.getDay()];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  // Leading "TODAY" beats the date for the most recent day so the
  // user's eye locks onto the now-edge instantly.
  if (isToday) return `TODAY · ${dd}/${mm}`;
  return `${wd} · ${dd}/${mm}`;
}

const MONTH_SHORT: ReadonlyArray<string> = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

function fmtMacroMonth(d: Date, count: number, isCurrent: boolean): string {
  const mo = MONTH_SHORT[d.getMonth()];
  if (isCurrent) return `THIS MONTH · ${count}d`;
  return `${mo} · ${count}d`;
}

export function Grid({
  data,
  metric,
  onHover,
  onClick,
  onRowClick,
  lockedCellId,
  flashByCell,
  heatByCell,
  gridKey,
  savedOrder,
  onReorder,
  reorderEnabled,
  onRequestLogin,
}: {
  data: HeatmapResponse;
  metric: HeatmapMetric;
  onHover: (h: { cell: HeatmapCell; anchor: TooltipAnchor; category: string; slotLabel: string; cellId: string; originalSlotIdx: number } | null) => void;
  onClick: (h: { cell: HeatmapCell; anchor: TooltipAnchor; category: string; slotLabel: string; cellId: string; originalSlotIdx: number }) => void;
  onRowClick?: (rowKey: string) => void;
  lockedCellId: string | null;
  flashByCell: FlashByCell;
  /** Per-cell live "heat" — bumps by 1 per signal, decays exponentially
   *  on a Heatmap-side timer. Drives the cell's glow aura + scale, so
   *  busy cells stay visibly hot during a burst instead of just blinking
   *  once per signal. Same key shape as flashByCell. */
  heatByCell: HeatByCell;
  gridKey: string;
  /** User's saved order for this scope. undefined when no preference saved
   *  yet — Grid falls back to data.categories' natural order. */
  savedOrder: string[] | undefined;
  /** Persist a new order. Called once per drag-end. */
  onReorder: (next: string[]) => void;
  /** When false, drag handles render as locked icons that prompt login. */
  reorderEnabled: boolean;
  onRequestLogin?: () => void;
}) {
  const num = data.buckets.length;
  const isPattern = data.mode === "pattern";
  const isMacro = data.mode === "macro";
  const isMobile = useIsMobile();

  const localShiftIdx = useMemo<number>(() => {
    if (data.mode !== "pattern") return 0;
    if (data.patternKind === "hour-of-day") {
      const tzOffset = -new Date().getTimezoneOffset() / 60;
      return ((Math.round(-tzOffset / 2) % 12) + 12) % 12;
    }
    return 0;
  }, [data]);

  const buckets = useMemo(() => {
    if (localShiftIdx === 0) return data.buckets;
    return data.buckets.slice(localShiftIdx).concat(data.buckets.slice(0, localShiftIdx));
  }, [data.buckets, localShiftIdx]);

  // Display order = saved order applied to natural order; new keys go to
  // their natural position (next to their default-rank neighbour).
  const displayCategories = useMemo(
    () => applyOrder(data.categories, savedOrder),
    [data.categories, savedOrder],
  );

  const cellsByCat = useMemo(() => {
    const out: Record<string, ReadonlyArray<HeatmapCell>> = {};
    for (const cat of data.categories) {
      const row = data.cells[cat] ?? [];
      out[cat] = localShiftIdx === 0
        ? row
        : row.slice(localShiftIdx).concat(row.slice(0, localShiftIdx));
    }
    return out;
  }, [data, localShiftIdx]);

  const intensityFn = useMemo(() => {
    if (metric === "winrate") {
      return (c: HeatmapCell) => c.winRate ?? 0;
    }
    const key =
      metric === "pnl"
        ? "pnl"
        : metric === "volume"
          ? "volume"
          : metric === "whales"
            ? "uniqueWhales"
            : "count";
    const flat: HeatmapCell[] = [];
    for (const cat of data.categories) flat.push(...(cellsByCat[cat] ?? []));
    return makeIntensityFn(flat, key);
  }, [data.categories, cellsByCat, metric]);

  const nowSlotIndex = useMemo<number | null>(() => {
    if (data.mode === "live") return num - 1;
    if (data.patternKind === "hour-of-day") return Math.floor(new Date().getHours() / 2);
    if (data.patternKind === "day-of-week") {
      const dow = new Date().getDay();
      const monFirst = [1, 2, 3, 4, 5, 6, 0];
      return monFirst.indexOf(dow);
    }
    return null;
  }, [data, num]);

  const isL3Grid = data.drillSubcategory !== null;

  // Split mouse + touch so each input modality can have its own
  // activation rule:
  //  - Mouse: 4px movement starts a drag (existing behaviour, precise).
  //  - Touch: 250ms hold + 5px tolerance — long-press to drag, quick
  //    tap still fires the badge's onClick (drill into category).
  // Mobile uses the colored badge itself as the drag source (the tiny
  // 6-dot grip column was unhittable on touch). Long-press is the
  // iOS-native pattern for "I want to rearrange these".
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const [activeKey, setActiveKey] = useState<string | null>(null);
  /** Currently hovered row key — drives the dim-sibling row highlight.
   *  `null` = nothing hovered, all rows render at full opacity. Mouse
   *  leaving a row clears it; entering a different row replaces it.
   *  Suppressed during drag so the dragged row doesn't simultaneously
   *  read as "hovered" and "moving". */
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const handleDragStart = (e: DragStartEvent): void => {
    setActiveKey(String(e.active.id));
    setHoveredRow(null);
  };

  const handleDragEnd = (e: DragEndEvent): void => {
    setActiveKey(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = displayCategories.indexOf(String(active.id));
    const newIndex = displayCategories.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(displayCategories, oldIndex, newIndex);
    onReorder(next);
  };

  // Build a renderer for a row's INNER content (label cell + N data cells).
  // Reused by both live rows and the DragOverlay clone, so the overlay's
  // appearance matches what's underneath.
  const renderRowInner = (
    cat: string,
    options: {
      reorderEnabled: boolean;
      listeners: Record<string, (event: unknown) => void> | undefined;
      attributes: Record<string, unknown> | undefined;
      isDragOverlay: boolean;
    },
  ): React.ReactNode => {
    const meta = makeRowMeta(cat, data);
    const clickableRow = !meta.isL3 && onRowClick !== undefined && !options.isDragOverlay;
    // Whales subject — row clicks open the whale drawer (handler set
    // by the parent via onRowClick). The drill chevron is suppressed
    // because there's no L2/L3 hierarchy to drill into; the click
    // affordance is the row label itself, not a chevron pointing into
    // a deeper level.
    const hideAffordance = data.subject === "whales";
    // "Active right now" indicator — only meaningful on whales-subject
    // LIVE rows. Walk the last 2 buckets (so a whale that fired one
    // trade ~5min ago still reads as live, smoothing out the "nothing
    // in the very last 5min" gap that's noise more than signal). PATTERN
    // and MACRO modes have no real-time semantics; trades-subject rows
    // are categories, where "live" doesn't apply.
    const cellsForRow = cellsByCat[cat] ?? [];
    const isLive =
      data.subject === "whales" &&
      data.mode === "live" &&
      cellsForRow.length > 0 &&
      [cellsForRow.at(-1), cellsForRow.at(-2)].some(
        (c) => c !== undefined && c.count > 0,
      );
    // Hide the explicit drag-handle column on mobile — the 6-dot grip
    // is too small to tap reliably on touch. Mobile drags via long-
    // press on the colored badge itself (TouchSensor's 250ms delay
    // activation in the parent DndContext). Desktop keeps the precise
    // grip column for mouse users.
    const showHandle = options.reorderEnabled && !isMobile;
    // On mobile the badge IS the drag source — pass listeners/attrs
    // through. Desktop keeps them on the grip column above.
    const badgeDragListeners =
      isMobile && options.reorderEnabled ? options.listeners : undefined;
    const badgeDragAttributes =
      isMobile && options.reorderEnabled ? options.attributes : undefined;
    return (
      <>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: showHandle ? 4 : 0,
            paddingRight: isMobile ? 6 : 10,
          }}
        >
          {showHandle && (
            <DragHandle
              reorderEnabled={options.reorderEnabled}
              onRequestLogin={onRequestLogin}
              listeners={options.listeners}
              attributes={options.attributes}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <RowLabelBadge
              isMobile={isMobile}
              meta={meta}
              clickableRow={clickableRow}
              onRowClick={onRowClick}
              hideAffordance={hideAffordance}
              isLive={isLive}
              dragListeners={badgeDragListeners}
              dragAttributes={badgeDragAttributes}
            />
          </div>
        </div>
        {(cellsByCat[cat] ?? []).map((cell, slot) => {
          const isNowCol = slot === nowSlotIndex;
          const originalIdx = (slot + localShiftIdx) % num;
          const flashSeq = flashByCell[`${cat}:${originalIdx}`] ?? 0;
          const heat = heatByCell[`${cat}:${originalIdx}`] ?? 0;
          const cellId = `${cat}:${slot}`;
          const slotLabel = formatSlotLabel(
            buckets[slot]!,
            data.mode,
            data.patternKind,
            slot,
            data.range,
          );
          return (
            <Cell
              key={`${cat}-${slot}-${gridKey}`}
              cell={cell}
              metric={metric}
              intensityFn={intensityFn}
              isNowCol={isNowCol}
              flashSeq={flashSeq}
              heat={heat}
              showDelta={isPattern}
              compact={isMacro || isMobile}
              isLocked={lockedCellId === cellId}
              onHover={
                options.isDragOverlay
                  ? () => {}
                  : (h) =>
                      onHover(
                        h
                          ? { ...h, category: cat, slotLabel, cellId, originalSlotIdx: originalIdx }
                          : null,
                      )
              }
              onClick={
                options.isDragOverlay
                  ? () => {}
                  : (h) =>
                      onClick({ ...h, category: cat, slotLabel, cellId, originalSlotIdx: originalIdx })
              }
            />
          );
        })}
      </>
    );
  };

  // Mobile sizing — label column wide enough to show full L1 names
  // ("POLITICS"), cells get a small min-width floor that lets 12 LIVE
  // buckets fit inside iPhone-SE-class viewports without horizontal
  // scroll. MACRO 168 cells will still overflow the viewport and the
  // heatmap container's overflow-x: auto picks them up.
  // Compact mode (heat-only, no value text) is forced for every mode
  // on mobile — values don't fit legibly below ~28px wide cells.
  // Time row (header) gets MORE height on mobile so labels can rotate
  // 90° and read top-to-bottom — horizontally they'd collide.
  // Whales subject squeezes ~50 rows into the same viewport as 9
  // categories — drop the row floor by ~30% so more whales fit
  // before the grid starts scrolling internally. Same shrink applies
  // on mobile where vertical real estate is tightest.
  const isWhales = data.subject === "whales";
  // Whales mode pushes the label column wider on mobile — long
  // aliases like LABRADFORDSMITH / DIMSUMCONNECT were truncating to
  // 7-8 chars in the 108px slot. Bump to ~140px for whales, taking
  // some room from the cell grid (which now has 50 narrow rows
  // anyway, so per-cell width matters less).
  const labelColW = isMobile
    ? isWhales
      ? 140
      : isL3Grid
        ? 120
        : 108
    : isWhales
      ? 150
      : isL3Grid
        ? LABEL_W_L3
        : LABEL_W;
  // Equalise row height between trades and whales subjects so the
  // rhythm reads identical across modes (mobile-trades vs mobile-
  // whales had a 22 vs 28 split that made the gap-to-row ratio look
  // different per subject — user flagged it as inconsistent). Keep
  // the L3 carve-out: market questions wrap over 2 lines so they
  // need taller rows.
  const minRowH = isMobile
    ? isL3Grid ? 36 : 26
    : isL3Grid ? MIN_ROW_H_L3 : MIN_ROW_H;
  const cellMinW = isMobile ? 14 : 0;
  const timeRowH = isMobile ? 44 : TIME_ROW_H;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveKey(null)}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
    >
      <div
        data-hm-grid-wrap
        style={{
          display: "grid",
          gridTemplateColumns: `${labelColW}px repeat(${num}, minmax(${cellMinW}px, 1fr))`,
          // Macro keeps a top row too, but uses it for day-range labels
          // grouped across each day's 24 hourly cells (instead of the
          // per-bucket time labels in LIVE / PATTERN). Slightly shorter
          // header row since it carries less text.
          gridTemplateRows: isMacro
            ? `${(isMobile ? timeRowH : TIME_ROW_H) - 4}px repeat(${displayCategories.length}, minmax(36px, 1fr))`
            : `${timeRowH}px repeat(${displayCategories.length}, minmax(${minRowH}px, 1fr))`,
          // Column gap stays at 4 (2 macro) — anything bigger breaks
          // the "this row is a continuous strip of values" read. Row
          // gap is bigger because tightly-stacked badge borders read
          // as a wall of bars ("наляпано"). Mobile gets the most
          // breathing room because the smaller text + denser badges
          // read as squashed unless there's clear air around each
          // row; desktop can get away with less. Macro keeps tight
          // 2px in both directions because dense matrices want to
          // read as a continuous canvas, not a list.
          rowGap: isMacro ? 2 : isMobile ? 10 : 6,
          columnGap: isMacro ? 2 : 4,
          width: "100%",
          height: "100%",
          position: "relative",
          fontSize: 12,
          boxSizing: "border-box",
        }}
      >
        {!isMacro && (
          <div
            style={{
              gridColumn: "1 / -1",
              display: "grid",
              gridTemplateColumns: "subgrid",
              gap: 4,
            }}
          >
            <div />
            {buckets.map((b, i) => {
              const lbl = formatSlotLabel(b, data.mode, data.patternKind, i, data.range);
              const isNow = i === nowSlotIndex;
              return (
                <div
                  key={i}
                  style={{
                    fontSize: isMobile ? 9 : 10,
                    fontFamily: TOKENS.mono,
                    color: isNow ? TOKENS.pos : TOKENS.textSec,
                    fontWeight: isNow ? 700 : 500,
                    letterSpacing: 0.5,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    // Mobile rotates labels 90° (writingMode) so "08:00",
                    // "Mon", "Wk 06" etc. fit in 14-22px wide cells without
                    // wrapping or truncating. Reads bottom-to-top so the
                    // anchor (where text starts) lines up with the cell.
                    ...(isMobile
                      ? {
                          writingMode: "vertical-rl",
                          transform: "rotate(180deg)",
                          whiteSpace: "nowrap",
                          lineHeight: 1,
                        }
                      : null),
                  }}
                >
                  {isNow ? (
                    isMobile ? (
                      // Mobile: dot was visually orphaned next to the
                      // rotated label. Drop it — the green-bold colour
                      // already telegraphs "this is now". Cleaner read.
                      lbl
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 6,
                            background: TOKENS.pos,
                            boxShadow: `0 0 6px ${TOKENS.pos}`,
                          }}
                        />
                        {lbl}
                      </span>
                    )
                  ) : (
                    lbl
                  )}
                </div>
              );
            })}
          </div>
        )}

        {isMacro && (
          <MacroDayHeader
            buckets={buckets}
            gap={2}
            macroKind={data.macroKind ?? "hour-week"}
          />
        )}

        <SortableContext items={displayCategories} strategy={verticalListSortingStrategy}>
          {displayCategories.map((cat) => (
            <SortableRow
              key={cat}
              rowKey={cat}
              reorderEnabled={reorderEnabled}
              isHovered={hoveredRow === cat && activeKey === null}
              hoverEnabled={!isMobile}
              onHoverChange={setHoveredRow}
            >
              {(listeners, attributes) =>
                renderRowInner(cat, {
                  reorderEnabled,
                  listeners,
                  attributes,
                  isDragOverlay: false,
                })
              }
            </SortableRow>
          ))}
        </SortableContext>
      </div>

      {/* Drag overlay — renders the actively dragged row as a fused card.
          Sits in a portal-like absolute layer so it can move freely outside
          the grid. We replicate the column template so cells line up. */}
      <DragOverlay dropAnimation={null}>
        {activeKey ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `${labelColW}px repeat(${num}, minmax(${cellMinW}px, 1fr))`,
              gap: 4,
              width: "100%",
              fontSize: 12,
              boxSizing: "border-box",
              padding: 4,
              borderRadius: 6,
              background: "rgba(22, 27, 34, 0.96)",
              boxShadow: "0 12px 28px rgba(0,0,0,0.55), 0 0 0 1px rgba(240,180,41,0.45)",
              backdropFilter: "blur(2px)",
              cursor: "grabbing",
              opacity: 0.95,
            }}
          >
            {renderRowInner(activeKey, {
              reorderEnabled: true,
              listeners: undefined,
              attributes: undefined,
              isDragOverlay: true,
            })}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

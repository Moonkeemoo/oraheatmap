"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
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
        opacity: 0.75,
        fontSize: kind === "external" ? 10 : 13,
        lineHeight: 1,
        transition: "transform .15s, opacity .15s",
        color: "rgba(255,255,255,0.95)",
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
}: {
  meta: RowMeta;
  clickableRow: boolean;
  onRowClick?: (rowKey: string) => void;
}) {
  const { isL3, isResolved, rowColor, rowLabel, rawLabel, l3Url } = meta;
  const isInteractive = clickableRow || l3Url !== null;
  const titleText = isL3
    ? `${rawLabel}${isResolved ? " · resolved" : ""}${l3Url ? " — open on Polymarket" : ""}`
    : clickableRow
      ? `Drill into ${meta.isDrillRow ? "markets" : "subcategories"}`
      : undefined;
  // Subtle "raised" feel for clickable rows — a 1px inner highlight on the
  // top edge + a 1px outer border on the bottom edge reads as a button.
  // Combined with the corner-pinned ›/↗ icon it's hard to mistake for
  // static text.
  const interactiveBoxShadow = isInteractive
    ? "inset 0 1px 0 rgba(255,255,255,0.18), 0 1px 0 rgba(0,0,0,0.18)"
    : "none";
  // Reserve room on the right for the corner-pinned affordance icon so the
  // text never visually overlaps it. 18px is enough for both › and ↗ at
  // their current sizes; non-interactive rows skip the reserve.
  const padRight = isInteractive ? 18 : 8;
  const badgeStyle: React.CSSProperties = {
    background: rowColor,
    color: "#fff",
    border: "none",
    fontFamily: "inherit",
    fontSize: 10,
    fontWeight: isL3 ? 600 : 700,
    letterSpacing: isL3 ? 0.2 : 0.6,
    padding: `5px ${padRight}px 5px 8px`,
    borderRadius: 4,
    textTransform: isL3 ? "none" : "uppercase",
    textAlign: isL3 ? ("left" as const) : ("center" as const),
    width: "100%",
    cursor: isInteractive ? "pointer" : "default",
    transition: "filter .15s, transform .15s, box-shadow .15s",
    opacity: isResolved ? 0.55 : 1,
    textDecoration: isResolved ? "line-through" : "none",
    boxSizing: "border-box",
    // Always relative so the corner-pinned affordance has a positioned
    // ancestor regardless of L1/L2/L3.
    position: "relative",
    whiteSpace: isL3 ? "normal" : "nowrap",
    // L3 multi-line: clamp at 2 lines with ellipsis so long tennis names
    // ("Internazionali BNL d'Italia, Qualification: P1 vs P2") don't bleed
    // past the badge box. L1/L2 single-line: nowrap + ellipsis as before.
    overflow: "hidden",
    textOverflow: isL3 ? undefined : ("ellipsis" as const),
    lineHeight: isL3 ? "1.25" : undefined,
    wordBreak: isL3 ? ("break-word" as const) : undefined,
    boxShadow: interactiveBoxShadow,
    ...(isL3
      ? {
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as const,
        }
      : { display: "block" }),
  };
  const onEnter = (e: React.MouseEvent<HTMLElement>): void => {
    if (!isInteractive) return;
    const el = e.currentTarget;
    el.style.filter = "brightness(1.18)";
    el.style.boxShadow =
      "inset 0 1px 0 rgba(255,255,255,0.28), 0 2px 0 rgba(0,0,0,0.22), 0 0 0 1px rgba(255,255,255,0.22)";
    const aff = el.querySelector<HTMLSpanElement>("[data-affordance]");
    if (aff) {
      aff.style.opacity = "1";
      aff.style.transform = "translateX(2px)";
    }
  };
  const onLeave = (e: React.MouseEvent<HTMLElement>): void => {
    if (!isInteractive) return;
    const el = e.currentTarget;
    el.style.filter = "none";
    el.style.boxShadow = interactiveBoxShadow;
    const aff = el.querySelector<HTMLSpanElement>("[data-affordance]");
    if (aff) {
      aff.style.opacity = "0.75";
      aff.style.transform = "translateX(0)";
    }
  };
  // Pick which affordance kind to show. L3-with-link wins over drill (a
  // market row is never simultaneously a drill target).
  const affordanceKind: "drill" | "external" | null = l3Url
    ? "external"
    : clickableRow
      ? "drill"
      : null;
  if (l3Url) {
    return (
      <a
        href={l3Url}
        target="_blank"
        rel="noopener noreferrer"
        title={titleText}
        style={badgeStyle}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      >
        {rowLabel}
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
      style={badgeStyle}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {rowLabel}
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
  children,
}: {
  rowKey: string;
  reorderEnabled: boolean;
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
    transition,
    // Hide the live row while dragging — DragOverlay paints the moving copy.
    opacity: isDragging ? 0 : 1,
    // Lift dragged item above peers (defensive — DragOverlay handles z-index).
    zIndex: isDragging ? 2 : "auto",
    position: "relative",
  };
  return (
    <div ref={setNodeRef} style={style} data-row-key={rowKey}>
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

  // Pointer sensor with an activation distance so a short click on the
  // handle still registers as a click (no accidental drag start).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const [activeKey, setActiveKey] = useState<string | null>(null);

  const handleDragStart = (e: DragStartEvent): void => {
    setActiveKey(String(e.active.id));
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
    return (
      <>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: 4,
            paddingRight: 10,
          }}
        >
          <DragHandle
            reorderEnabled={options.reorderEnabled}
            onRequestLogin={onRequestLogin}
            listeners={options.listeners}
            attributes={options.attributes}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <RowLabelBadge
              meta={meta}
              clickableRow={clickableRow}
              onRowClick={onRowClick}
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
              compact={isMacro}
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

  const labelColW = isL3Grid ? LABEL_W_L3 : LABEL_W;
  const minRowH = isL3Grid ? MIN_ROW_H_L3 : MIN_ROW_H;

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
          gridTemplateColumns: `${labelColW}px repeat(${num}, minmax(0, 1fr))`,
          // Macro keeps a top row too, but uses it for day-range labels
          // grouped across each day's 24 hourly cells (instead of the
          // per-bucket time labels in LIVE / PATTERN). Slightly shorter
          // header row since it carries less text.
          gridTemplateRows: isMacro
            ? `${TIME_ROW_H - 4}px repeat(${displayCategories.length}, minmax(36px, 1fr))`
            : `${TIME_ROW_H}px repeat(${displayCategories.length}, minmax(${minRowH}px, 1fr))`,
          gap: isMacro ? 2 : 4,
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
                    fontSize: 10,
                    fontFamily: TOKENS.mono,
                    color: isNow ? TOKENS.pos : TOKENS.textSec,
                    fontWeight: isNow ? 700 : 500,
                    letterSpacing: 0.5,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {isNow ? (
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
            <SortableRow key={cat} rowKey={cat} reorderEnabled={reorderEnabled}>
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
              gridTemplateColumns: `${labelColW}px repeat(${num}, minmax(0, 1fr))`,
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

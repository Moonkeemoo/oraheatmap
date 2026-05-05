import { useLayoutEffect, useRef, useState } from "react";
import { categoryMeta } from "@/lib/categories";
import { fmtMoney, fmtMoneyShort } from "@/lib/format";
import { useCellCycles } from "@/hooks/useCellCycles";
import { useMarketHistory } from "@/hooks/useMarketHistory";
import { marketUrl } from "@/lib/polymarket-url";
import { TOKENS } from "@/lib/tokens";
import { ProbabilityChart } from "./ProbabilityChart";
import { CellFeed } from "./tooltip/CellFeed";
import { RowHighlights } from "./tooltip/RowHighlights";
import { CycleHistogram, rowIndexToServerSlot } from "./tooltip/CycleHistogram";
import { MarketIcon } from "./tooltip/MarketIcon";
import {
  fmtDeltaInline,
  fmtMetric,
  fmtWhaleMetric,
  metricColor,
  metricMax,
  metricMin,
  sortMarkets,
  sortWhales,
  whaleMetricColor,
} from "./tooltip/metric-format";
import { RowSparkline } from "./tooltip/RowSparkline";
import { Stat } from "./tooltip/Stat";
import { WhaleAvatar } from "./WhaleAvatar";
import type {
  Category,
  HeatmapCell,
  HeatmapMetric,
  LiveRange,
  MarketSummary,
  Mode,
  PatternKind,
  WhaleCellSummary,
} from "@/lib/types";

export type TooltipAnchor = {
  x: number;
  y: number;
  w: number;
  h: number;
  parentW: number;
  parentH: number;
};

/** Rect in the same parent-relative coordinate space as `TooltipAnchor`.
 *  Hover tooltip avoids any side that would overlap this — used to push the
 *  hover panel away from the locked panel during side-by-side comparison. */
export type TooltipRect = { left: number; top: number; right: number; bottom: number };

function rectsOverlap(a: TooltipRect, b: TooltipRect | null): boolean {
  if (!b) return false;
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

// Drawer has vertical room for the longer leaderboard; float hovers
// stay short so the tooltip doesn't dominate the screen.
const TOP_N_DRAWER = 10;
const TOP_N_FLOAT = 5;

function rangeUnit(r: LiveRange | undefined, mode: Mode, kind: PatternKind | undefined): string {
  if (mode === "pattern") return kind === "hour-of-day" ? "hour" : "day";
  if (r === "1h") return "5m";
  if (r === "24h") return "2h";
  if (r === "12d") return "1d";
  return "1w";
}

export function Tooltip({
  cell,
  rowCells,
  anchor,
  category,
  slotLabel,
  mode,
  range,
  patternKind,
  metric,
  lookbackDays,
  locked,
  avoidRect,
  isAuthed,
  onRequestLogin,
  onPlaced,
  onWhaleClick,
  drillSubcategory,
  onUnlock,
  headerIcon,
  headerTitle,
  headerCrumb,
  parentCategory,
  feed,
  highlights,
  displayLabel,
  slotIndex,
  renderAs = "float",
  onClose,
}: {
  cell: HeatmapCell;
  /** All cells of the same row (category) in display order. Used to draw
   *  the row sparkline showing how this category evolved across the chosen
   *  timeframe. Pass an empty array to skip the sparkline. */
  rowCells: ReadonlyArray<HeatmapCell>;
  anchor: TooltipAnchor;
  category: Category;
  slotLabel: string;
  mode: Mode;
  range: LiveRange;
  patternKind: PatternKind;
  metric: HeatmapMetric;
  lookbackDays: number;
  /** When true, this tooltip is the click-locked one — show a different hint
   *  and a subtle "pinned" border. */
  locked: boolean;
  /** Rect to dodge when picking placement (typically the locked tooltip). */
  avoidRect?: TooltipRect | null;
  /** Reports the final placement rect after layout. Used by the parent to
   *  feed the locked tooltip's rect back as `avoidRect` for the hover one. */
  onPlaced?: (rect: TooltipRect) => void;
  /** Whether the viewer is signed in. When false, the per-market list is
   *  hidden behind a "Sign in to unlock" teaser. Cell metric numbers, win
   *  rate, the pattern delta etc. stay visible regardless. */
  isAuthed: boolean;
  /** Open the login modal — used for the "Sign in to view markets" CTA in
   *  the locked tooltip. */
  onRequestLogin: () => void;
  /** Open the whale drawer for the clicked address. Only fires from the
   *  locked tooltip — the hover tooltip is pointer-transparent. */
  onWhaleClick: (addr: string) => void;
  /** Drill subcategory at L2 in PATTERN — when set, the cycle histogram
   *  filters by subcategory column instead of category. NULL at L1. */
  drillSubcategory?: string | null;
  /** Real category (Sports / Crypto / …) when the row key in `category`
   *  is actually a subcategory slug or a condition_id. At L1 this equals
   *  `category`; at L2/L3 it's the parent category so the meta lookup
   *  doesn't fall back to "Other". */
  parentCategory?: Category | null;
  /** Live cell-feed payload from Heatmap's useCellFeed hook. Only used in
   *  drawer mode — Tooltip renders a chronological list at the bottom of
   *  the body when this is provided. Heatmap owns the hook so a single
   *  useSse subscription can pipe signals into the active feed. */
  feed?: { entries: ReadonlyArray<import("@/hooks/useCellFeed").FeedEntry>; loading: boolean } | null;
  /** Row-scope standout-events list — drawer-only. Surfaced right under
   *  the 4-stat header so the user sees "what's notable in this row over
   *  the chosen window" before scrolling into per-cell aggregates. NULL
   *  = section hidden (PATTERN mode, WIN RATE metric, hover tooltip). */
  highlights?: {
    data: import("@/hooks/useRowHighlights").HighlightsResponse | null;
    loading: boolean;
    range: LiveRange;
  } | null;
  /** Override for the small badge text. At L1 omit (badge = category
   *  name from meta.label). At L2 pass the subcategory display label
   *  ("NBA", "Bitcoin") so the badge reflects the row, not the parent
   *  category — the parent already shows in the breadcrumb on L3 and
   *  is implied by the active drill on L2. */
  displayLabel?: string | null;
  /** Display slot index for the sparkline highlight. Pass when known —
   *  cell-reference identity goes stale across SSE updates and the
   *  fallback findIndex returns -1, which silently hides the sparkline. */
  slotIndex?: number | null;
  /** Polymarket icon URL for the L3 header. NULL at L1/L2. */
  headerIcon?: string | null;
  /** Full (un-shortened) market question for the L3 header. NULL at L1/L2. */
  headerTitle?: string | null;
  /** Breadcrumb shown above the title at L3 — e.g. "Sports · NBA". */
  headerCrumb?: string | null;
  /** Called when the user clicks anywhere on the locked tooltip's empty
   *  area (not on an interactive child). Lets users dismiss the lock
   *  without having to find the cell underneath the tooltip. */
  onUnlock?: () => void;
  /** Outer chrome variant. "float" (default) keeps the existing
   *  cell-anchored positioning logic; "drawer" pins to the right edge
   *  like WhaleDrawer (backdrop overlay, slide-in, top-right X button).
   *  Drawer is what Cell click triggers; float is what hover triggers. */
  renderAs?: "float" | "drawer";
  /** Drawer-only — fired by ESC, overlay click, or the X button. */
  onClose?: () => void;
}) {
  const isDrawer = renderAs === "drawer";
  // At L2/L3 the `category` prop is actually a subcategory slug ("nba")
  // or a condition_id (0x...) — those don't exist in the Category enum
  // so categoryMeta() falls back to "Other". The parent category passed
  // through from Heatmap is what we want for the badge / colour.
  const meta = categoryMeta(parentCategory ?? category);
  const isPattern = mode === "pattern";
  // At L3, the `category` prop holds the condition_id (rowKey) — the heatmap
  // already drilled past category/subcategory, so each row IS a market.
  const isL3 = !isPattern && drillSubcategory != null;
  const conditionId = isL3 ? category : null;
  const marketHistory = useMarketHistory(conditionId, "max", isL3 && locked);
  const topN = isDrawer ? TOP_N_DRAWER : TOP_N_FLOAT;
  const sortedMarkets = isPattern ? [] : sortMarkets(cell.markets, metric).slice(0, topN);
  // Per-cell historical cycles for PATTERN locked tooltip — fires only when
  // we lock so we don't spam the API on every mouse move.
  const cyclesEnabled = isPattern && locked;
  const cyclesArgs = cyclesEnabled
    ? {
        kind: patternKind,
        category,
        subcategory: drillSubcategory ?? null,
        slot: rowIndexToServerSlot(patternKind, Math.max(0, rowCells.findIndex((c) => c === cell))),
      }
    : null;
  const cycles = useCellCycles(cyclesArgs, cyclesEnabled);
  // Top whales in this cell — re-sorted by the active metric so the rows
  // match what the heatmap is showing. Hidden in PATTERN mode (no per-cell
  // whale aggregation in the pattern query).
  const cellWhales: ReadonlyArray<WhaleCellSummary> =
    isPattern ? [] : sortWhales(cell.topWhales ?? [], metric).slice(0, topN);
  // Slot index inside the active row — derived from cellId pattern "{cat}:{slot}"
  // upstream. We get rowCells in display order, so the active slot is the
  // last index for LIVE (NOW) ... actually we don't have direct access to
  // slot here. The parent guarantees rowCells matches the display order; we
  // find the slot by reference identity against `cell`.
  // Stable preferred — passed in by Heatmap from cellId. Fallback uses
  // object identity which goes stale when SSE replaces cell objects.
  const fallbackSlot = rowCells.findIndex((c) => c === cell);
  const activeSlot = slotIndex !== null && slotIndex !== undefined ? slotIndex : fallbackSlot;
  // Sparkline only for LIVE — for PATTERN, the per-cycle bar chart will be
  // a separate (planned) widget; row-across-hours sparkline is duplicative
  // of the heatmap row itself.
  const showSparkline = !isPattern && rowCells.length > 1 && activeSlot >= 0;

  const ref = useRef<HTMLDivElement | null>(null);
  const margin = 10;
  const initialW = 340;
  // Pattern locked tooltip gets +60px for the cycle histogram. L3 locked
  // tooltip gets +200px for the probability chart + legend.
  const patternBase = 230 + (locked ? 60 : 0);
  const probabilityChartHeight = isL3 && locked ? 200 : 0;
  const initialH = isPattern
    ? patternBase
    : sortedMarkets.length > 0
      ? 240 + sortedMarkets.length * 26 + (showSparkline ? 50 : 0) + (cellWhales.length > 0 ? 30 + cellWhales.length * 24 : 0) + probabilityChartHeight
      : 140 + (showSparkline ? 50 : 0) + (cellWhales.length > 0 ? 30 + cellWhales.length * 24 : 0) + probabilityChartHeight;

  const initialPos = {
    left: clamp(anchor.x + anchor.w / 2 - initialW / 2, 8, anchor.parentW - initialW - 8),
    top: anchor.y - initialH - margin >= 8 ? anchor.y - initialH - margin : anchor.y + anchor.h + margin,
  };
  const [pos, setPos] = useState(initialPos);

  useLayoutEffect(() => {
    // Drawer mode is fixed to the right edge — no anchor-based dodging.
    if (isDrawer) return;
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const parent = ref.current.offsetParent as HTMLElement | null;
    const pr = parent?.getBoundingClientRect();
    const pw = pr?.width ?? window.innerWidth;
    const ph = pr?.height ?? window.innerHeight;
    const W = r.width;
    const H = r.height;

    // Candidate placements. Beyond the four cardinal positions we also try
    // four "corner" variants (above-left/-right, below-left/-right) where the
    // tooltip is aligned with one edge of the cell instead of centered. This
    // gives the dodge logic more options when the locked tooltip occupies a
    // big chunk of the viewport and centered placements all collide.
    type Cand = { left: number; top: number };
    const centerLeft = clamp(anchor.x + anchor.w / 2 - W / 2, 8, pw - W - 8);
    const centerTop = clamp(anchor.y + anchor.h / 2 - H / 2, 8, ph - H - 8);
    const aboveTop = anchor.y - H - margin;
    const belowTop = anchor.y + anchor.h + margin;
    const rightLeft = anchor.x + anchor.w + margin;
    const leftLeft = anchor.x - W - margin;
    // Edge-aligned horizontal positions for corner placements.
    const flushLeft = clamp(anchor.x, 8, pw - W - 8);
    const flushRight = clamp(anchor.x + anchor.w - W, 8, pw - W - 8);

    const cands: ReadonlyArray<{ name: string; c: Cand }> = [
      { name: "above",       c: { left: centerLeft, top: aboveTop } },
      { name: "below",       c: { left: centerLeft, top: belowTop } },
      { name: "right",       c: { left: rightLeft,  top: centerTop } },
      { name: "left",        c: { left: leftLeft,   top: centerTop } },
      { name: "above-right", c: { left: flushLeft,  top: aboveTop } },
      { name: "above-left",  c: { left: flushRight, top: aboveTop } },
      { name: "below-right", c: { left: flushLeft,  top: belowTop } },
      { name: "below-left",  c: { left: flushRight, top: belowTop } },
    ];

    const fits = (c: Cand): boolean =>
      c.left >= 8 &&
      c.top >= 8 &&
      c.left + W <= pw - 8 &&
      c.top + H <= ph - 8;

    // Inflate avoidRect by a "breathing room" margin so the hover panel
    // doesn't sit edge-to-edge with the locked panel — at zero gap the two
    // read as one solid block in the user's eye, even if technically distinct.
    const AVOID_PAD = 24;
    const inflatedAvoid: TooltipRect | null = avoidRect
      ? {
          left: avoidRect.left - AVOID_PAD,
          top: avoidRect.top - AVOID_PAD,
          right: avoidRect.right + AVOID_PAD,
          bottom: avoidRect.bottom + AVOID_PAD,
        }
      : null;
    const cleared = (c: Cand): boolean => {
      if (!inflatedAvoid) return true;
      const cr: TooltipRect = { left: c.left, top: c.top, right: c.left + W, bottom: c.top + H };
      return !rectsOverlap(cr, inflatedAvoid);
    };

    // Score: distance from candidate center to avoidRect center. Higher is
    // better — picks the placement that's furthest away from the locked
    // tooltip among those that fit + are cleared.
    function score(c: Cand): number {
      if (!avoidRect) return 0;
      const cx = c.left + W / 2;
      const cy = c.top + H / 2;
      const ax = (avoidRect.left + avoidRect.right) / 2;
      const ay = (avoidRect.top + avoidRect.bottom) / 2;
      const dx = cx - ax;
      const dy = cy - ay;
      return Math.sqrt(dx * dx + dy * dy);
    }

    const fittingCleared = cands.filter(({ c }) => fits(c) && cleared(c));
    const picked =
      fittingCleared.length > 0
        ? fittingCleared.sort((a, b) => score(b.c) - score(a.c))[0]!.c
        : cands.find(({ c }) => fits(c))?.c ?? { left: centerLeft, top: centerTop };

    setPos(picked);
    onPlaced?.({
      left: picked.left,
      top: picked.top,
      right: picked.left + W,
      bottom: picked.top + H,
    });
  }, [anchor, sortedMarkets.length, isPattern, avoidRect, onPlaced, isDrawer]);

  // ESC closes the drawer. Bound only when drawer mode is active so float
  // hovers don't accidentally swallow ESC.
  useLayoutEffect(() => {
    if (!isDrawer || !onClose) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose!();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDrawer, onClose]);

  // ── Body — same JSX both modes; outer chrome differs. ──────────────────
  const body = (
    <>
      {isL3 && headerTitle ? (
        // L3 header — Polymarket-style: icon + breadcrumb + full title.
        // Replaces the small "OTHER" category badge with the actual market.
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
          <MarketIcon url={headerIcon ?? null} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {headerCrumb && (
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: 0.5,
                  color: TOKENS.textMuted,
                  textTransform: "uppercase",
                  fontWeight: 600,
                  marginBottom: 3,
                }}
              >
                {headerCrumb}
              </div>
            )}
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: TOKENS.text,
                lineHeight: 1.25,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
              title={headerTitle}
            >
              {headerTitle}
            </div>
            <div
              style={{
                fontSize: 10,
                color: TOKENS.textSec,
                fontFamily: TOKENS.mono,
                marginTop: 3,
              }}
            >
              {slotLabel} · {rangeUnit(range, mode, patternKind)}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span
            style={{
              background: meta.color,
              color: "#fff",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 0.4,
              padding: "3px 6px",
              borderRadius: 3,
              textTransform: "uppercase",
            }}
          >
            {displayLabel ?? meta.label}
          </span>
          <span style={{ color: TOKENS.textSec, fontSize: 11, fontFamily: TOKENS.mono }}>
            {slotLabel} · {rangeUnit(range, mode, patternKind)}
            {isPattern && (
              <span style={{ marginLeft: 6, color: TOKENS.textMuted }}>
                · avg over {lookbackDays}d
              </span>
            )}
          </span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
        <Stat label={isPattern ? "AVG TRADES" : "TRADES"} value={Math.round(cell.count)} />
        <Stat
          label={isPattern ? "AVG PNL" : "PNL"}
          value={fmtMoney(cell.pnl)}
          color={cell.pnl > 0 ? TOKENS.pos : cell.pnl < 0 ? TOKENS.neg : TOKENS.textSec}
        />
        <Stat label={isPattern ? "AVG VOLUME" : "VOLUME"} value={cell.volume ? fmtMoneyShort(cell.volume) : "—"} />
        <Stat
          label="WIN"
          value={cell.winRate === null ? "—" : Math.round(cell.winRate * 100) + "%"}
          color={cell.winRate === null ? TOKENS.textSec : cell.winRate >= 0.5 ? TOKENS.pos : TOKENS.neg}
        />
      </div>

      {isL3 && locked && (
        <div style={{ borderTop: `1px solid ${TOKENS.border}`, paddingTop: 8, marginBottom: 8 }}>
          <div
            style={{
              fontSize: 9,
              letterSpacing: 0.5,
              color: TOKENS.textMuted,
              textTransform: "uppercase",
              marginBottom: 6,
              fontWeight: 600,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>Market probability</span>
            <span style={{ color: TOKENS.textSec }}>ALL</span>
          </div>
          {marketHistory.loading && (
            <div style={{ fontSize: 11, color: TOKENS.textSec, padding: "8px 0" }}>
              loading…
            </div>
          )}
          {marketHistory.error && (
            <div style={{ fontSize: 11, color: TOKENS.neg, padding: "8px 0" }}>
              {marketHistory.error}
            </div>
          )}
          {marketHistory.data && (
            <ProbabilityChart outcomes={marketHistory.data.outcomes} />
          )}
        </div>
      )}

      {showSparkline && (
        <div style={{ borderTop: `1px solid ${TOKENS.border}`, paddingTop: 8, marginBottom: 8 }}>
          <div
            style={{
              fontSize: 9,
              letterSpacing: 0.5,
              color: TOKENS.textMuted,
              textTransform: "uppercase",
              marginBottom: 6,
              fontWeight: 600,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>Row trend · {meta.label}</span>
            <span style={{ color: TOKENS.textSec }}>{metric === "signals" ? "trades" : metric}</span>
          </div>
          <RowSparkline rowCells={rowCells} metric={metric} activeSlot={activeSlot} />
        </div>
      )}

      {/* Top highlights — drawer-only, range-scoped (not cell-bucket).
          Sits below the row sparkline so the user reads the trend shape
          first, then the standout events that drove it. */}
      {isDrawer && highlights && !isPattern && (
        <div style={{ borderTop: `1px solid ${TOKENS.border}`, paddingTop: 8, marginBottom: 8 }}>
          <div
            style={{
              fontSize: 9,
              letterSpacing: 0.5,
              color: TOKENS.textMuted,
              textTransform: "uppercase",
              marginBottom: 6,
              fontWeight: 600,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>Top highlights</span>
            <span style={{ color: TOKENS.textSec }}>
              {highlights.range} · by {highlightsLabel(metric)}
            </span>
          </div>
          <RowHighlights data={highlights.data} loading={highlights.loading} />
        </div>
      )}

      {isPattern && cell.delta && (
        <div
          style={{
            borderTop: `1px solid ${TOKENS.border}`,
            paddingTop: 8,
            marginBottom: sortedMarkets.length > 0 ? 8 : 0,
          }}
        >
          <div
            style={{
              fontSize: 9,
              letterSpacing: 0.5,
              color: TOKENS.textMuted,
              textTransform: "uppercase",
              marginBottom: 6,
              fontWeight: 600,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>Trend (recent vs older half)</span>
            {cell.sampleCount !== undefined && (
              <span style={{ color: TOKENS.textSec }}>n={cell.sampleCount}</span>
            )}
          </div>
          {(() => {
            const d = fmtDeltaInline(metric, cell.delta);
            return (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 11, color: TOKENS.textSec }}>
                  Δ {metric === "signals" ? "trades" : metric}
                </span>
                <span style={{ fontSize: 14, color: d.color, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {d.text}
                </span>
              </div>
            );
          })()}
          {(metric === "signals" || metric === "volume" || metric === "pnl") && cell.min && cell.max && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10,
                color: TOKENS.textMuted,
                marginTop: 4,
                fontFamily: TOKENS.mono,
              }}
            >
              <span>min {fmtCellShort(metric, metricMin(metric, cell))}</span>
              <span>max {fmtCellShort(metric, metricMax(metric, cell))}</span>
            </div>
          )}
        </div>
      )}

      {isPattern && locked && (
        <div style={{ borderTop: `1px solid ${TOKENS.border}`, paddingTop: 8, marginBottom: 8 }}>
          <div
            style={{
              fontSize: 9,
              letterSpacing: 0.5,
              color: TOKENS.textMuted,
              textTransform: "uppercase",
              marginBottom: 6,
              fontWeight: 600,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>Past cycles · {patternKind === "hour-of-day" ? "30 days" : "12 weeks"}</span>
            <span style={{ color: TOKENS.textSec }}>{metric === "signals" ? "trades" : metric}</span>
          </div>
          {cycles.loading && (
            <div style={{ fontSize: 11, color: TOKENS.textSec, padding: "8px 0" }}>loading…</div>
          )}
          {cycles.error && (
            <div style={{ fontSize: 11, color: TOKENS.neg, padding: "8px 0" }}>
              {cycles.error}
            </div>
          )}
          {cycles.samples && cycles.samples.length > 0 && (
            <CycleHistogram samples={cycles.samples} metric={metric} />
          )}
          {cycles.samples && cycles.samples.length === 0 && !cycles.loading && (
            <div style={{ fontSize: 11, color: TOKENS.textMuted, padding: "8px 0" }}>
              No history for this slot.
            </div>
          )}
        </div>
      )}

      {/* 12d/12w at L1 — server skips per-cell top markets/whales because
          GROUP BY condition_id over millions of rows would blow latency.
          Tell the user instead of showing nothing where they expect lists. */}
      {!isPattern &&
        parentCategory == null &&
        (range === "12d" || range === "12w") &&
        cellWhales.length === 0 &&
        sortedMarkets.length === 0 && (
          <div
            style={{
              borderTop: `1px solid ${TOKENS.border}`,
              paddingTop: 8,
              marginBottom: 8,
              fontSize: 11,
              color: TOKENS.textMuted,
              lineHeight: 1.5,
            }}
          >
            Top markets & whales hidden on {range} — drill into a category to see them.
          </div>
        )}

      {!isPattern && cellWhales.length > 0 && isAuthed && (
        <div style={{ borderTop: `1px solid ${TOKENS.border}`, paddingTop: 8, marginBottom: 8 }}>
          <div
            style={{
              fontSize: 9,
              letterSpacing: 0.5,
              color: TOKENS.textMuted,
              textTransform: "uppercase",
              marginBottom: 6,
              fontWeight: 600,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>Top whales</span>
            <span style={{ color: TOKENS.textSec }}>by {metric === "signals" ? "trades" : metric}</span>
          </div>
          {cellWhales.map((w) => (
            <button
              key={w.addr}
              type="button"
              onClick={() => onWhaleClick(w.addr)}
              style={{
                display: "grid",
                gridTemplateColumns: "18px 1fr auto auto",
                alignItems: "center",
                gap: 8,
                width: "100%",
                background: "transparent",
                border: "none",
                color: TOKENS.text,
                fontFamily: "inherit",
                fontSize: 11,
                lineHeight: 1.3,
                padding: "4px 0",
                cursor: "pointer",
                textAlign: "left",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = TOKENS.panel2;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
              title={`${w.alias} — open whale profile`}
            >
              <WhaleAvatar profileImage={w.profileImage} color={w.color} size={18} />
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: TOKENS.text,
                  fontWeight: 600,
                }}
              >
                {w.alias}
              </span>
              {/* Secondary stat — context for the primary:
                  - signals (TRADES) → volume as secondary
                  - winrate           → decided exits count "5× ex" so the
                    user reads the sample size behind the percent
                  - everything else  → total trade count "155× tr"
                  Stops "155× tr 100%" from suggesting all 155 were wins
                  when only the few exits were decided. */}
              <span
                style={{
                  color: TOKENS.textSec,
                  fontFamily: TOKENS.mono,
                  fontSize: 10,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                {metric === "signals"
                  ? w.volume > 0 ? fmtMoneyShort(w.volume) : "—"
                  : metric === "winrate"
                    ? `${(w.wins ?? 0) + (w.losses ?? 0)}× ex`
                    : `${w.signals}× tr`}
              </span>
              <span
                style={{
                  color: whaleMetricColor(metric, w),
                  fontFamily: TOKENS.mono,
                  fontSize: 11,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                {fmtWhaleMetric(metric, w)}
              </span>
            </button>
          ))}
        </div>
      )}

      {!isPattern && cellWhales.length > 0 && !isAuthed && (
        <div style={{ borderTop: `1px solid ${TOKENS.border}`, paddingTop: 8, marginBottom: 8 }}>
          <div
            style={{
              fontSize: 9,
              letterSpacing: 0.5,
              color: TOKENS.textMuted,
              textTransform: "uppercase",
              marginBottom: 6,
              fontWeight: 600,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>Top whales</span>
            <span style={{ color: TOKENS.textSec }}>🔒 sign in</span>
          </div>
          {locked && (
            <button
              onClick={onRequestLogin}
              style={{
                background: TOKENS.panel2,
                border: `1px solid ${TOKENS.borderHi}`,
                color: TOKENS.text,
                fontFamily: "inherit",
                fontSize: 11,
                fontWeight: 600,
                padding: "8px 10px",
                borderRadius: 6,
                width: "100%",
                cursor: "pointer",
              }}
            >
              Sign in to see {cellWhales.length} top whale{cellWhales.length === 1 ? "" : "s"} →
            </button>
          )}
        </div>
      )}

      {!isPattern && sortedMarkets.length > 0 && !isAuthed && (
        <div style={{ borderTop: `1px solid ${TOKENS.border}`, paddingTop: 8 }}>
          <div
            style={{
              fontSize: 9,
              letterSpacing: 0.5,
              color: TOKENS.textMuted,
              textTransform: "uppercase",
              marginBottom: 6,
              fontWeight: 600,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>Top markets</span>
            <span style={{ color: TOKENS.textSec }}>🔒 sign in</span>
          </div>
          {locked ? (
            <button
              onClick={onRequestLogin}
              style={{
                background: TOKENS.panel2,
                border: `1px solid ${TOKENS.borderHi}`,
                color: TOKENS.text,
                fontFamily: "inherit",
                fontSize: 11,
                fontWeight: 600,
                padding: "8px 10px",
                borderRadius: 6,
                width: "100%",
                cursor: "pointer",
                transition: "filter .12s",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.2)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.filter = "none")}
            >
              Sign in to see {sortedMarkets.length} top market{sortedMarkets.length === 1 ? "" : "s"} →
            </button>
          ) : (
            <div style={{ fontSize: 11, color: TOKENS.textSec, lineHeight: 1.4 }}>
              {sortedMarkets.length} market{sortedMarkets.length === 1 ? "" : "s"} hidden — click cell to lock, then sign in
            </div>
          )}
        </div>
      )}

      {!isPattern && sortedMarkets.length > 0 && isAuthed && (
        <div style={{ borderTop: `1px solid ${TOKENS.border}`, paddingTop: 8 }}>
          <div
            style={{
              fontSize: 9,
              letterSpacing: 0.5,
              color: TOKENS.textMuted,
              textTransform: "uppercase",
              marginBottom: 6,
              fontWeight: 600,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>Top markets</span>
            <span style={{ color: TOKENS.textSec }}>by {metric === "signals" ? "trades" : metric}</span>
          </div>
          {sortedMarkets.map((m, i) => (
            <div
              key={m.conditionId}
              style={{
                display: "grid",
                gridTemplateColumns: "14px 22px 1fr auto",
                alignItems: "center",
                gap: 8,
                fontSize: 11,
                marginBottom: 6,
                lineHeight: 1.3,
              }}
            >
              <span style={{ color: TOKENS.textMuted, fontFamily: TOKENS.mono, fontSize: 10, fontWeight: 700 }}>
                {i + 1}.
              </span>
              <MarketIcon url={m.marketIcon} size={22} />
              {(() => {
                const label = m.marketQuestion ?? "(unknown market)";
                const url = marketUrl(m.marketSlug);
                const baseStyle: React.CSSProperties = {
                  color: TOKENS.text,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  textDecoration: "none",
                };
                // Locked tooltip is interactive (pointerEvents: auto on root)
                // so anchors actually receive clicks. The hover (transient)
                // tooltip stays pointer-transparent so the user can compare
                // adjacent cells without the floating panel hijacking the
                // mouse — links still render but aren't clickable until lock.
                if (!url) {
                  return (
                    <span style={baseStyle} title={label}>
                      {label}
                    </span>
                  );
                }
                return (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...baseStyle, color: TOKENS.link, cursor: "pointer" }}
                    title={`${label} — open on Polymarket`}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.textDecoration = "underline";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.textDecoration = "none";
                    }}
                  >
                    {label}
                  </a>
                );
              })()}
              <span
                style={{
                  color: metricColor(metric, m),
                  fontFamily: TOKENS.mono,
                  fontSize: 11,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                {fmtMetric(metric, m)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Live feed — drawer-only. Renders below the top markets / probability
          chart blocks so the heavy aggregations stay above the fold. */}
      {isDrawer && feed && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${TOKENS.border}`, paddingTop: 12 }}>
          <div
            style={{
              fontSize: 9,
              letterSpacing: 0.5,
              color: TOKENS.textMuted,
              textTransform: "uppercase",
              marginBottom: 6,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>Live feed</span>
            <span style={{ color: TOKENS.textSec, fontFamily: TOKENS.mono }}>
              latest {feed.entries.length} · streaming
            </span>
          </div>
          <CellFeed entries={feed.entries} loading={feed.loading} />
        </div>
      )}

      {!isDrawer && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 6,
            borderTop: `1px dashed ${TOKENS.border}`,
            fontSize: 9,
            fontFamily: TOKENS.mono,
            color: TOKENS.textMuted,
            letterSpacing: 0.4,
            textAlign: "center",
          }}
        >
          {locked ? "клікни ще раз щоб закрити" : "клікни щоб відкрити панель"}
        </div>
      )}
    </>
  );

  // ── Drawer chrome — right-side slide-in (mirrors WhaleDrawer). ─────────
  if (isDrawer) {
    return (
      <>
        {/* Click-outside overlay — full viewport, dim, dismisses on click. */}
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 50,
            animation: "tipIn .18s ease-out",
          }}
        />
        <aside
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            width: "min(440px, 92vw)",
            height: "100vh",
            background: TOKENS.panel,
            borderLeft: `1px solid ${TOKENS.borderHi}`,
            boxShadow: "-20px 0 60px rgba(0,0,0,0.6)",
            zIndex: 51,
            display: "flex",
            flexDirection: "column",
            fontFamily: TOKENS.font,
            color: TOKENS.text,
            animation: "drawerIn .18s ease-out",
            overflowY: "auto",
          }}
        >
          {/* Top bar — close button + slot label so the user knows which
              cell is loaded. Stays sticky so it's reachable while scrolling
              long bodies (top whales / probability chart inflate L3 height). */}
          <div
            style={{
              position: "sticky",
              top: 0,
              background: TOKENS.panel,
              borderBottom: `1px solid ${TOKENS.border}`,
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              zIndex: 1,
            }}
          >
            <button
              onClick={onClose}
              aria-label="Close cell panel"
              style={{
                background: "transparent",
                border: `1px solid ${TOKENS.border}`,
                color: TOKENS.textSec,
                fontSize: 14,
                fontWeight: 700,
                padding: "3px 9px",
                borderRadius: 6,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              ←
            </button>
            <span
              style={{
                fontSize: 10,
                color: TOKENS.textMuted,
                fontFamily: TOKENS.mono,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              {slotLabel}
            </span>
            <button
              onClick={onClose}
              aria-label="Close cell panel"
              style={{
                background: "transparent",
                border: `1px solid ${TOKENS.border}`,
                color: TOKENS.textSec,
                fontSize: 14,
                fontWeight: 700,
                padding: "3px 9px",
                borderRadius: 6,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ padding: "14px 16px 24px", flex: 1 }}>{body}</div>
          <style>{`
            @keyframes drawerIn {
              0% { transform: translateX(20px); opacity: 0; }
              100% { transform: translateX(0); opacity: 1; }
            }
          `}</style>
        </aside>
      </>
    );
  }

  // ── Float chrome — anchored to the cell, hover behaviour. ──────────────
  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        left: pos.left,
        top: pos.top,
        width: initialW,
        background: TOKENS.panel,
        border: `1px solid ${locked ? TOKENS.accent : TOKENS.borderHi}`,
        borderRadius: 8,
        padding: "12px 14px",
        fontFamily: TOKENS.font,
        color: TOKENS.text,
        boxShadow: locked
          ? `0 10px 30px rgba(0,0,0,0.55), 0 0 0 1px ${TOKENS.accent}55`
          : "0 10px 30px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.4)",
        pointerEvents: locked ? "auto" : "none",
        cursor: locked ? "pointer" : "default",
        zIndex: locked ? 31 : 30,
        animation: "tipIn .12s ease-out",
        boxSizing: "border-box",
      }}
      onClick={
        locked && onUnlock
          ? (e) => {
              const target = e.target as HTMLElement | null;
              if (target?.closest("button, a, input, textarea, select")) return;
              onUnlock();
            }
          : undefined
      }
    >
      {body}
    </div>
  );
}

function fmtCellShort(metric: HeatmapMetric, v: number): string {
  if (metric === "signals") return String(Math.round(v));
  if (Math.abs(v) >= 1e3) return "$" + (v / 1e3).toFixed(1) + "k";
  return "$" + Math.round(v);
}

function highlightsLabel(metric: HeatmapMetric): string {
  if (metric === "volume") return "USD volume";
  if (metric === "pnl") return "biggest PnL";
  if (metric === "signals") return "trade count";
  if (metric === "whales") return "unique whales";
  return "—";
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

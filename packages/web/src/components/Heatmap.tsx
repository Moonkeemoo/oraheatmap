"use client";

import { useEffect, useMemo, useState } from "react";
import { useHeatmap } from "@/hooks/useHeatmap";
import { useSse } from "@/hooks/useSse";
import { applySignal } from "@/lib/heatmap-apply";
import { TOKENS } from "@/lib/tokens";
import type {
  Category,
  HeatmapCell,
  HeatmapMetric,
  LiveRange,
  Mode,
  PatternKind,
  SignalEvent,
} from "@/lib/types";
import { Breadcrumb } from "./Breadcrumb";
import { Grid } from "./Grid";
import { Header } from "./Header";
import { StatsBar } from "./StatsBar";
import { Tooltip, type TooltipAnchor, type TooltipRect } from "./Tooltip";

type HoverState = {
  cell: HeatmapCell;
  anchor: TooltipAnchor;
  category: string;
  slotLabel: string;
  cellId: string;
};

/** Per-(category × slot index) flash counter. Keyed by `${cat}:${slot}` so that
 *  in PATTERN mode the cell matching the signal's hour-of-day or day-of-week
 *  flashes (not always the rightmost), and in LIVE mode only the NOW slot
 *  flashes. */
export type FlashByCell = Record<string, number>;

const DOW_DISPLAY_ORDER: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun, Sun last

/** Map a signal timestamp to the bucket index AS IT APPEARS IN SERVER RESPONSE.
 *  Grid handles local-TZ rotation separately for display. LIVE: last index (NOW).
 *  PATTERN-hour: UTC hour / 2 → 0..11 (12 two-hour slots, matches backend).
 *  PATTERN-dow: 0..6 in Mon..Sun display order. */
function flashSlotIndex(
  mode: Mode,
  kind: PatternKind | undefined,
  ts: string,
  bucketCount: number,
): number {
  if (mode === "live") return bucketCount - 1;
  const d = new Date(ts);
  if (kind === "hour-of-day") return Math.floor(d.getUTCHours() / 2);
  if (kind === "day-of-week") return DOW_DISPLAY_ORDER.indexOf(d.getUTCDay());
  return -1;
}

export function Heatmap() {
  const [mode, setMode] = useState<Mode>("live");
  const [range, setRange] = useState<LiveRange>("1h");
  const [patternKind, setPatternKind] = useState<PatternKind>("hour-of-day");
  const [metric, setMetric] = useState<HeatmapMetric>("signals");
  const [drillCategory, setDrillCategory] = useState<Category | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [locked, setLocked] = useState<HoverState | null>(null);
  const [lockedRect, setLockedRect] = useState<TooltipRect | null>(null);
  const [flashByCell, setFlashByCell] = useState<FlashByCell>({});
  const [pendingSignals, setPendingSignals] = useState<SignalEvent[]>([]);

  const { data: fetchedData, loading, error } = useHeatmap({
    mode,
    range: mode === "live" ? range : undefined,
    kind: mode === "pattern" ? patternKind : undefined,
    lookbackDays: mode === "pattern" ? 30 : undefined,
    drillCategory,
  });

  // Whenever a fresh fetch arrives, drop the optimistic queue.
  useEffect(() => {
    setPendingSignals([]);
  }, [fetchedData?.generatedAt]);

  // Optimistic merge — only meaningful in LIVE mode (PATTERN values are
  // averages, not running sums; bumping by 1 doesn't make sense).
  const displayData = useMemo(() => {
    if (!fetchedData) return null;
    if (fetchedData.mode === "pattern") return fetchedData;
    let acc = fetchedData;
    for (const s of pendingSignals) acc = applySignal(acc, s);
    return acc;
  }, [fetchedData, pendingSignals]);

  useSse((s) => {
    if (!fetchedData) return;
    if (!metricAffectedBy(metric, s)) return;

    // Determine the row key the signal belongs to in the current view:
    //   top-level → s.category (must match one of fetchedData.categories)
    //   drill     → s.subcategory (must be in this category's sublist)
    let rowKey: string;
    if (fetchedData.drillCategory) {
      if (s.category !== fetchedData.drillCategory || !s.subcategory) return;
      if (!fetchedData.categories.includes(s.subcategory)) return;
      rowKey = s.subcategory;
    } else {
      if (!fetchedData.categories.includes(s.category)) return;
      rowKey = s.category;
    }

    const slotIdx = flashSlotIndex(
      fetchedData.mode,
      fetchedData.patternKind,
      s.ts,
      fetchedData.buckets.length,
    );
    if (slotIdx < 0 || slotIdx >= fetchedData.buckets.length) return;

    if (fetchedData.mode === "live") {
      setPendingSignals((prev) => [...prev, s]);
    }
    const key = `${rowKey}:${slotIdx}`;
    setFlashByCell((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
  });

  // Reset hover + lock on mode/range/kind/drill switches (anchors + cell IDs
  // are stale across grid shape changes).
  useEffect(() => {
    setHover(null);
    setLocked(null);
    setLockedRect(null);
  }, [mode, range, patternKind, drillCategory]);


  const isLive = mode === "live";
  const daysOfData = displayData?.dataSpan.daysOfData ?? 0;
  // PATTERN is always clickable. Sample size shows up in the subtitle
  // ("low sample" badge under 7d) so the user can interpret accordingly,
  // rather than the tab being silently locked.
  const patternUnlocked = true;
  const lowSample = daysOfData < 7;

  return (
    <div
      style={{
        width: "100vw",
        maxWidth: "100vw",
        // minHeight (not height) lets the page grow when content overflows
        // the viewport — drill-down can have up to 15 rows which doesn't
        // fit on a short laptop at readable cell size; body scroll catches it.
        minHeight: "100vh",
        background: TOKENS.bg,
        color: TOKENS.text,
        fontFamily: TOKENS.font,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflowX: "hidden",
        boxSizing: "border-box",
      }}
    >
      <Header
        mode={mode}
        setMode={setMode}
        metric={metric}
        setMetric={setMetric}
        range={range}
        setRange={setRange}
        patternKind={patternKind}
        setPatternKind={setPatternKind}
        isLive={isLive}
        trackedCount={displayData?.trackedWhales ?? 0}
        lookbackDays={displayData?.lookbackDays ?? 30}
        patternUnlocked={patternUnlocked}
        daysOfData={daysOfData}
        lowSample={lowSample}
      />

      <div
        style={{
          flex: 1,
          padding: "14px 24px 10px",
          position: "relative",
          // Drop overflow:hidden so the grid can extend past the viewport
          // when row count × min-row-height exceeds available space; the
          // page scrolls (body overflow-y: auto). minHeight removed for the
          // same reason — flex:1 still claims free space when there is any.
          boxSizing: "border-box",
        }}
      >
        {error && (
          <div style={{ color: TOKENS.neg, fontFamily: TOKENS.mono, fontSize: 12 }}>
            api error: {error}
          </div>
        )}
        {loading && !displayData && (
          <div style={{ color: TOKENS.textSec, fontSize: 13 }}>loading…</div>
        )}
        {displayData && (
          <>
            {displayData.drillCategory && (
              <Breadcrumb
                drillCategory={displayData.drillCategory}
                onBack={() => setDrillCategory(null)}
              />
            )}
            <Grid
              data={displayData}
              metric={metric}
              onHover={(h) => setHover(h)}
              onClick={(h) => {
                // Toggle: same cell unlocks, any other cell takes the lock.
                setLocked((prev) => {
                  if (prev?.cellId === h.cellId) {
                    setLockedRect(null);
                    return null;
                  }
                  // Force re-place on lock change so the locked tooltip's rect
                  // re-reports for the hover dodge logic.
                  setLockedRect(null);
                  return h;
                });
              }}
              onRowClick={
                // Top-level (any mode): clicking a category row drills in.
                !displayData.drillCategory
                  ? (cat) => setDrillCategory(cat)
                  : undefined
              }
              lockedCellId={locked?.cellId ?? null}
              flashByCell={flashByCell}
              gridKey={`${mode}-${range}-${patternKind}-${drillCategory ?? "top"}`}
            />
            {locked && (
              <Tooltip
                key={`locked-${locked.cellId}`}
                cell={locked.cell}
                anchor={locked.anchor}
                category={locked.category as Category}
                slotLabel={locked.slotLabel}
                mode={displayData.mode}
                range={range}
                patternKind={patternKind}
                metric={metric}
                lookbackDays={displayData.lookbackDays ?? 30}
                locked
                onPlaced={setLockedRect}
              />
            )}
            {hover && hover.cellId !== locked?.cellId && (
              <Tooltip
                key={`hover-${hover.cellId}`}
                cell={hover.cell}
                anchor={hover.anchor}
                category={hover.category as Category}
                slotLabel={hover.slotLabel}
                mode={displayData.mode}
                range={range}
                patternKind={patternKind}
                metric={metric}
                lookbackDays={displayData.lookbackDays ?? 30}
                locked={false}
                avoidRect={lockedRect}
              />
            )}
          </>
        )}
      </div>

      {displayData && (
        <StatsBar data={displayData} trackedCount={displayData.trackedWhales} />
      )}
    </div>
  );
}

function metricAffectedBy(metric: HeatmapMetric, s: SignalEvent): boolean {
  switch (metric) {
    case "signals":
      return true;
    case "volume":
      return s.side === "BUY";
    case "pnl":
    case "winrate":
      return s.realizedPnl !== null && s.realizedPnl !== 0;
  }
}

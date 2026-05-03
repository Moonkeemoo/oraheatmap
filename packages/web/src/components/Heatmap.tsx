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
import { Grid } from "./Grid";
import { Header } from "./Header";
import { StatsBar } from "./StatsBar";
import { Tooltip, type TooltipAnchor } from "./Tooltip";

type HoverState = { cell: HeatmapCell; anchor: TooltipAnchor; category: string; slotLabel: string };

/** Per-(category × slot index) flash counter. Keyed by `${cat}:${slot}` so that
 *  in PATTERN mode the cell matching the signal's hour-of-day or day-of-week
 *  flashes (not always the rightmost), and in LIVE mode only the NOW slot
 *  flashes. */
export type FlashByCell = Record<string, number>;

const DOW_DISPLAY_ORDER: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun, Sun last

/** Map a signal timestamp to the bucket index AS IT APPEARS IN SERVER RESPONSE.
 *  Grid handles local-TZ rotation separately for display. LIVE: last index (NOW).
 *  PATTERN-hour: UTC hour 0..23 (matches backend EXTRACT(hour FROM bucket AT TIME ZONE 'UTC')).
 *  PATTERN-dow: 0..6 in Mon..Sun display order. */
function flashSlotIndex(
  mode: Mode,
  kind: PatternKind | undefined,
  ts: string,
  bucketCount: number,
): number {
  if (mode === "live") return bucketCount - 1;
  const d = new Date(ts);
  if (kind === "hour-of-day") return d.getUTCHours();
  if (kind === "day-of-week") return DOW_DISPLAY_ORDER.indexOf(d.getUTCDay());
  return -1;
}

export function Heatmap() {
  const [mode, setMode] = useState<Mode>("live");
  const [range, setRange] = useState<LiveRange>("1h");
  const [patternKind, setPatternKind] = useState<PatternKind>("hour-of-day");
  const [metric, setMetric] = useState<HeatmapMetric>("signals");
  const [hover, setHover] = useState<HoverState | null>(null);
  const [flashByCell, setFlashByCell] = useState<FlashByCell>({});
  const [pendingSignals, setPendingSignals] = useState<SignalEvent[]>([]);

  const { data: fetchedData, loading, error } = useHeatmap({
    mode,
    range: mode === "live" ? range : undefined,
    kind: mode === "pattern" ? patternKind : undefined,
    lookbackDays: mode === "pattern" ? 30 : undefined,
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
    const cat = s.category as Category;
    if (!fetchedData.categories.includes(cat)) return;
    if (!metricAffectedBy(metric, s)) return;

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
    const key = `${cat}:${slotIdx}`;
    setFlashByCell((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
  });

  // Reset hover on mode/range/kind switches (data shape changes).
  useEffect(() => {
    setHover(null);
  }, [mode, range, patternKind]);

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
        height: "100vh",
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
          minHeight: 0,
          boxSizing: "border-box",
          overflow: "hidden",
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
            <Grid
              data={displayData}
              metric={metric}
              onHover={(h) => setHover(h)}
              flashByCell={flashByCell}
              gridKey={`${mode}-${range}-${patternKind}`}
            />
            {hover && (
              <Tooltip
                cell={hover.cell}
                anchor={hover.anchor}
                category={hover.category as Category}
                slotLabel={hover.slotLabel}
                mode={displayData.mode}
                range={range}
                patternKind={patternKind}
                metric={metric}
                lookbackDays={displayData.lookbackDays ?? 30}
              />
            )}
          </>
        )}
      </div>

      {displayData?.totals && (
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

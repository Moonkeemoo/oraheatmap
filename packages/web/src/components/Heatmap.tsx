"use client";

import { useEffect, useMemo, useState } from "react";
import { useHeatmap } from "@/hooks/useHeatmap";
import { useSse } from "@/hooks/useSse";
import { applySignal } from "@/lib/heatmap-apply";
import { TOKENS } from "@/lib/tokens";
import type { Category, HeatmapCell, HeatmapMetric, HeatmapRange, SignalEvent } from "@/lib/types";
import { Grid } from "./Grid";
import { Header } from "./Header";
import { StatsBar } from "./StatsBar";
import { Tooltip, type TooltipAnchor } from "./Tooltip";

const TRACKED_COUNT = 1504;

type HoverState = { cell: HeatmapCell; anchor: TooltipAnchor; category: string; slotLabel: string };

/** Per-category flash counter. Bumped each time an SSE signal arrives for that
 *  category; the NOW cell of that category re-keys its flash overlay and
 *  re-runs the flashRing animation. Cells of other categories don't flicker. */
export type FlashByCategory = Partial<Record<Category, number>>;

export function Heatmap() {
  const [metric, setMetric] = useState<HeatmapMetric>("signals");
  const [range, setRange] = useState<HeatmapRange>("1h");
  const [hover, setHover] = useState<HoverState | null>(null);
  const [flashByCategory, setFlashByCategory] = useState<FlashByCategory>({});
  // Optimistic queue of SSE signals received since the last /api/heatmap fetch.
  // Folded into displayData via reduce; cleared whenever a fresh fetch arrives.
  const [pendingSignals, setPendingSignals] = useState<SignalEvent[]>([]);

  const isLive = range === "1h";

  const { data: fetchedData, loading, error } = useHeatmap(range);

  // Authoritative server response replaces all optimistic state — drop the queue.
  useEffect(() => {
    setPendingSignals([]);
  }, [fetchedData?.generatedAt]);

  // Apply pending signals on top of the latest fetched data so cell values
  // and the flash animation tick at the same moment.
  const displayData = useMemo(() => {
    if (!fetchedData) return null;
    let acc = fetchedData;
    for (const s of pendingSignals) acc = applySignal(acc, s);
    return acc;
  }, [fetchedData, pendingSignals]);

  useSse((s) => {
    if (!isLive) return; // only the LIVE 1h view flashes
    const cat = s.category as Category;
    if (!fetchedData?.categories.includes(cat)) return;
    // Bump cell value + flash counter together — they re-render in the same
    // React batch so the user sees the number tick AND the ring flash on the
    // same frame.
    setPendingSignals((prev) => [...prev, s]);
    setFlashByCategory((prev) => ({ ...prev, [cat]: (prev[cat] ?? 0) + 1 }));
  });

  // Reset hover when range flips
  useEffect(() => {
    setHover(null);
  }, [range]);

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
        metric={metric}
        setMetric={setMetric}
        range={range}
        setRange={setRange}
        isLive={isLive}
        trackedCount={TRACKED_COUNT}
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
              flashByCategory={flashByCategory}
              gridKey={range}
            />
            {hover && (
              <Tooltip
                cell={hover.cell}
                anchor={hover.anchor}
                category={hover.category as Category}
                slotLabel={hover.slotLabel}
                range={range}
              />
            )}
          </>
        )}
      </div>

      {displayData && <StatsBar data={displayData} trackedCount={TRACKED_COUNT} />}
    </div>
  );
}

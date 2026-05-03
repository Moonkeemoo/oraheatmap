"use client";

import { useEffect, useState } from "react";
import { useHeatmap } from "@/hooks/useHeatmap";
import { useSse } from "@/hooks/useSse";
import { TOKENS } from "@/lib/tokens";
import type { Category, HeatmapCell, HeatmapMetric, HeatmapRange } from "@/lib/types";
import { Grid } from "./Grid";
import { Header } from "./Header";
import { StatsBar } from "./StatsBar";
import { Tooltip, type TooltipAnchor } from "./Tooltip";

const TRACKED_COUNT = 1504;

type HoverState = { cell: HeatmapCell; anchor: TooltipAnchor; category: string; slotLabel: string };

export function Heatmap() {
  const [metric, setMetric] = useState<HeatmapMetric>("signals");
  const [range, setRange] = useState<HeatmapRange>("1h");
  const [hover, setHover] = useState<HoverState | null>(null);
  const [justArrivedTick, setJustArrivedTick] = useState(false);

  const isLive = range === "1h";

  const { data, loading, error } = useHeatmap(range);

  // Live cell flash: when SSE pushes a new whale signal whose category exists
  // in the current grid, briefly toggle the "justArrived" flag so the NOW
  // column flashes via cellLand+flashRing.
  useSse((s) => {
    if (!data) return;
    if (!isLive) return; // only flash on the live 1h view
    if (!data.categories.includes(s.category as Category)) return;
    setJustArrivedTick(true);
    setTimeout(() => setJustArrivedTick(false), 900);
  });

  // Reset hover when range/data flips
  useEffect(() => {
    setHover(null);
  }, [range, data?.generatedAt]);

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
        {loading && !data && (
          <div style={{ color: TOKENS.textSec, fontSize: 13 }}>loading…</div>
        )}
        {data && (
          <>
            <Grid
              data={data}
              metric={metric}
              onHover={(h) => setHover(h)}
              justArrivedTick={justArrivedTick}
              gridKey={`${range}-${data.generatedAt}`}
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

      {data && <StatsBar data={data} trackedCount={TRACKED_COUNT} />}
    </div>
  );
}

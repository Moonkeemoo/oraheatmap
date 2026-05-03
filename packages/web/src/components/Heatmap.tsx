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

/** Per-category flash counter. Bumped each time an SSE signal arrives for that
 *  category; the NOW cell of that category re-keys its flash overlay and
 *  re-runs the flashRing animation. Cells of other categories don't flicker. */
export type FlashByCategory = Partial<Record<Category, number>>;

export function Heatmap() {
  const [metric, setMetric] = useState<HeatmapMetric>("signals");
  const [range, setRange] = useState<HeatmapRange>("1h");
  const [hover, setHover] = useState<HoverState | null>(null);
  const [flashByCategory, setFlashByCategory] = useState<FlashByCategory>({});

  const isLive = range === "1h";

  const { data, loading, error } = useHeatmap(range);

  useSse((s) => {
    if (!isLive) return; // only the LIVE 1h view flashes
    const cat = s.category as Category;
    if (!data?.categories.includes(cat)) return;
    setFlashByCategory((prev) => ({ ...prev, [cat]: (prev[cat] ?? 0) + 1 }));
  });

  // Reset hover when range flips (data refresh keeps hover alive — bucket
  // contents update but the user is still pointing at the same slot)
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
        {loading && !data && (
          <div style={{ color: TOKENS.textSec, fontSize: 13 }}>loading…</div>
        )}
        {data && (
          <>
            <Grid
              data={data}
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

      {data && <StatsBar data={data} trackedCount={TRACKED_COUNT} />}
    </div>
  );
}

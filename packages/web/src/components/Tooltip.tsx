import { useLayoutEffect, useRef, useState } from "react";
import { categoryMeta } from "@/lib/categories";
import { fmtMoney, fmtMoneyShort } from "@/lib/format";
import { TOKENS } from "@/lib/tokens";
import type { Category, HeatmapCell, HeatmapMetric, HeatmapRange, MarketSummary } from "@/lib/types";

export type TooltipAnchor = {
  /** anchor's left/top relative to the tooltip's positioning parent */
  x: number;
  y: number;
  w: number;
  h: number;
  parentW: number;
  parentH: number;
};

const TOP_N = 5;

function rangeUnit(r: HeatmapRange): string {
  if (r === "1h") return "5m";
  if (r === "24h") return "2h";
  if (r === "12d") return "1d";
  return "1w";
}

/** Compare for descending sort. nulls / undefined sort last. */
function cmpDesc(a: number | null, b: number | null): number {
  const av = a ?? -Infinity;
  const bv = b ?? -Infinity;
  return bv - av;
}

function sortMarkets(markets: ReadonlyArray<MarketSummary>, metric: HeatmapMetric): MarketSummary[] {
  // Don't mutate the caller's array.
  const copy = markets.slice();
  switch (metric) {
    case "signals":
      copy.sort((a, b) => cmpDesc(a.count, b.count));
      break;
    case "volume":
      copy.sort((a, b) => cmpDesc(a.volume, b.volume));
      break;
    case "pnl":
      // Sort by absolute PnL so big losers also surface (they're informative).
      copy.sort((a, b) => cmpDesc(Math.abs(a.pnl), Math.abs(b.pnl)));
      break;
    case "winrate":
      // Top by win rate is fragile on small samples. Tiebreak by count to
      // promote markets with more decided exits.
      copy.sort((a, b) => {
        const c = cmpDesc(a.winRate, b.winRate);
        return c !== 0 ? c : cmpDesc(a.count, b.count);
      });
      break;
  }
  return copy;
}

/** Format the metric value as it appears in the tooltip's secondary column. */
function fmtMetric(metric: HeatmapMetric, m: MarketSummary): string {
  if (metric === "signals") return String(m.count);
  if (metric === "volume") return fmtMoneyShort(m.volume);
  if (metric === "pnl") return fmtMoney(m.pnl);
  return m.winRate === null ? "—" : Math.round(m.winRate * 100) + "%";
}

function metricColor(metric: HeatmapMetric, m: MarketSummary): string {
  if (metric === "pnl") return m.pnl >= 0 ? TOKENS.pos : TOKENS.neg;
  if (metric === "winrate") {
    if (m.winRate === null) return TOKENS.textSec;
    return m.winRate >= 0.5 ? TOKENS.pos : TOKENS.neg;
  }
  return TOKENS.text;
}

function Stat({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          color: TOKENS.textMuted,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          fontWeight: 600,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          color: color ?? TOKENS.text,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function Tooltip({
  cell,
  anchor,
  category,
  slotLabel,
  range,
  metric,
}: {
  cell: HeatmapCell;
  anchor: TooltipAnchor;
  category: Category;
  slotLabel: string;
  range: HeatmapRange;
  metric: HeatmapMetric;
}) {
  const meta = categoryMeta(category);
  const sortedMarkets = sortMarkets(cell.markets, metric).slice(0, TOP_N);

  const ref = useRef<HTMLDivElement | null>(null);
  // Initial position (computed in render): try above the anchor; if no room
  // there, fall back below; clamp horizontally to the parent. Once mounted
  // we measure actual rendered size and re-clamp to the viewport via
  // useLayoutEffect — handles edge cases where the tooltip would clip the
  // bottom or right of the screen.
  const margin = 10;
  const initialW = 340;
  const initialH = sortedMarkets.length > 0 ? 240 + sortedMarkets.length * 26 : 140;

  const initialPos = {
    left: clamp(anchor.x + anchor.w / 2 - initialW / 2, 8, anchor.parentW - initialW - 8),
    top: anchor.y - initialH - margin >= 8 ? anchor.y - initialH - margin : anchor.y + anchor.h + margin,
  };

  const [pos, setPos] = useState(initialPos);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const parent = ref.current.offsetParent as HTMLElement | null;
    const pr = parent?.getBoundingClientRect();
    const pw = pr?.width ?? window.innerWidth;
    const ph = pr?.height ?? window.innerHeight;
    const W = r.width;
    const H = r.height;

    // Where can it fit? Try in this order: above, below, right, left, then
    // wherever there's most room (clamped).
    const fitsAbove = anchor.y - H - margin >= 8;
    const fitsBelow = anchor.y + anchor.h + H + margin <= ph - 8;
    const fitsRight = anchor.x + anchor.w + W + margin <= pw - 8;
    const fitsLeft = anchor.x - W - margin >= 8;

    let left: number;
    let top: number;

    if (fitsAbove) {
      top = anchor.y - H - margin;
      left = clamp(anchor.x + anchor.w / 2 - W / 2, 8, pw - W - 8);
    } else if (fitsBelow) {
      top = anchor.y + anchor.h + margin;
      left = clamp(anchor.x + anchor.w / 2 - W / 2, 8, pw - W - 8);
    } else if (fitsRight) {
      left = anchor.x + anchor.w + margin;
      top = clamp(anchor.y + anchor.h / 2 - H / 2, 8, ph - H - 8);
    } else if (fitsLeft) {
      left = anchor.x - W - margin;
      top = clamp(anchor.y + anchor.h / 2 - H / 2, 8, ph - H - 8);
    } else {
      // Nothing fits — pin to the largest available area, clamped.
      left = clamp(anchor.x + anchor.w / 2 - W / 2, 8, pw - W - 8);
      top = clamp(anchor.y + anchor.h / 2 - H / 2, 8, ph - H - 8);
    }

    setPos({ left, top });
  }, [anchor, sortedMarkets.length]);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        left: pos.left,
        top: pos.top,
        width: initialW,
        background: TOKENS.panel,
        border: `1px solid ${TOKENS.borderHi}`,
        borderRadius: 8,
        padding: "12px 14px",
        fontFamily: TOKENS.font,
        color: TOKENS.text,
        boxShadow: "0 10px 30px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.4)",
        pointerEvents: "none",
        zIndex: 30,
        animation: "tipIn .12s ease-out",
        boxSizing: "border-box",
      }}
    >
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
          {meta.label}
        </span>
        <span style={{ color: TOKENS.textSec, fontSize: 11, fontFamily: TOKENS.mono }}>
          {slotLabel} · {rangeUnit(range)}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
        <Stat label="SIGNALS" value={cell.count} />
        <Stat
          label="PNL"
          value={fmtMoney(cell.pnl)}
          color={cell.pnl > 0 ? TOKENS.pos : cell.pnl < 0 ? TOKENS.neg : TOKENS.textSec}
        />
        <Stat label="VOLUME" value={cell.volume ? fmtMoneyShort(cell.volume) : "—"} />
        <Stat
          label="WIN"
          value={cell.winRate === null ? "—" : Math.round(cell.winRate * 100) + "%"}
          color={cell.winRate === null ? TOKENS.textSec : cell.winRate >= 0.5 ? TOKENS.pos : TOKENS.neg}
        />
      </div>

      {sortedMarkets.length > 0 && (
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
            <span style={{ color: TOKENS.textSec }}>by {metric}</span>
          </div>
          {sortedMarkets.map((m, i) => (
            <div
              key={m.conditionId}
              style={{
                display: "grid",
                gridTemplateColumns: "16px 1fr auto",
                alignItems: "baseline",
                gap: 8,
                fontSize: 11,
                marginBottom: 6,
                lineHeight: 1.3,
              }}
            >
              <span
                style={{
                  color: TOKENS.textMuted,
                  fontFamily: TOKENS.mono,
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {i + 1}.
              </span>
              <span
                style={{
                  color: TOKENS.text,
                  // Wrap long market questions so they're fully readable.
                  // Cap at ~3 lines via -webkit-line-clamp; longer titles get an ellipsis.
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
                title={m.marketQuestion ?? "(unknown market)"}
              >
                {m.marketQuestion ?? "(unknown market)"}
              </span>
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
    </div>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

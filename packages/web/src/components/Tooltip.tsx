import { useLayoutEffect, useRef, useState } from "react";
import { categoryMeta } from "@/lib/categories";
import { fmtMoney, fmtMoneyShort } from "@/lib/format";
import { TOKENS } from "@/lib/tokens";
import type {
  Category,
  HeatmapCell,
  HeatmapMetric,
  LiveRange,
  MarketSummary,
  Mode,
  PatternKind,
} from "@/lib/types";

export type TooltipAnchor = {
  x: number;
  y: number;
  w: number;
  h: number;
  parentW: number;
  parentH: number;
};

const TOP_N = 5;

function rangeUnit(r: LiveRange | undefined, mode: Mode, kind: PatternKind | undefined): string {
  if (mode === "pattern") return kind === "hour-of-day" ? "hour" : "day";
  if (r === "1h") return "5m";
  if (r === "24h") return "2h";
  if (r === "12d") return "1d";
  return "1w";
}

function cmpDesc(a: number | null, b: number | null): number {
  const av = a ?? -Infinity;
  const bv = b ?? -Infinity;
  return bv - av;
}

function sortMarkets(markets: ReadonlyArray<MarketSummary>, metric: HeatmapMetric): MarketSummary[] {
  const copy = markets.slice();
  switch (metric) {
    case "signals":
      copy.sort((a, b) => cmpDesc(a.count, b.count));
      break;
    case "volume":
      copy.sort((a, b) => cmpDesc(a.volume, b.volume));
      break;
    case "pnl":
      copy.sort((a, b) => cmpDesc(Math.abs(a.pnl), Math.abs(b.pnl)));
      break;
    case "winrate":
      copy.sort((a, b) => {
        const c = cmpDesc(a.winRate, b.winRate);
        return c !== 0 ? c : cmpDesc(a.count, b.count);
      });
      break;
  }
  return copy;
}

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

function fmtDeltaInline(metric: HeatmapMetric, d: HeatmapCell["delta"]): { text: string; color: string } {
  if (!d) return { text: "—", color: TOKENS.textSec };
  const v =
    metric === "signals" ? d.count
    : metric === "volume" ? d.volume
    : metric === "pnl" ? d.pnl
    : d.winRate;
  if (v === null) return { text: "—", color: TOKENS.textSec };
  const sign = v > 0 ? "+" : "";
  const display =
    metric === "winrate" ? sign + Math.round(v * 100) + "%"
    : metric === "signals" ? sign + Math.round(v)
    : sign + (Math.abs(v) >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "k" : "$" + Math.round(v));
  const color = v > 0 ? TOKENS.pos : v < 0 ? TOKENS.neg : TOKENS.textSec;
  return { text: display, color };
}

function metricMin(metric: HeatmapMetric, cell: HeatmapCell): number {
  if (!cell.min) return 0;
  if (metric === "volume") return cell.min.volume;
  if (metric === "pnl") return cell.min.pnl;
  return cell.min.count;
}

function metricMax(metric: HeatmapMetric, cell: HeatmapCell): number {
  if (!cell.max) return 0;
  if (metric === "volume") return cell.max.volume;
  if (metric === "pnl") return cell.max.pnl;
  return cell.max.count;
}

export function Tooltip({
  cell,
  anchor,
  category,
  slotLabel,
  mode,
  range,
  patternKind,
  metric,
  lookbackDays,
}: {
  cell: HeatmapCell;
  anchor: TooltipAnchor;
  category: Category;
  slotLabel: string;
  mode: Mode;
  range: LiveRange;
  patternKind: PatternKind;
  metric: HeatmapMetric;
  lookbackDays: number;
}) {
  const meta = categoryMeta(category);
  const isPattern = mode === "pattern";
  const sortedMarkets = isPattern ? [] : sortMarkets(cell.markets, metric).slice(0, TOP_N);

  const ref = useRef<HTMLDivElement | null>(null);
  const margin = 10;
  const initialW = 340;
  const initialH = isPattern
    ? 230
    : sortedMarkets.length > 0
      ? 240 + sortedMarkets.length * 26
      : 140;

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
      left = clamp(anchor.x + anchor.w / 2 - W / 2, 8, pw - W - 8);
      top = clamp(anchor.y + anchor.h / 2 - H / 2, 8, ph - H - 8);
    }

    setPos({ left, top });
  }, [anchor, sortedMarkets.length, isPattern]);

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
          {slotLabel} · {rangeUnit(range, mode, patternKind)}
          {isPattern && (
            <span style={{ marginLeft: 6, color: TOKENS.textMuted }}>
              · avg over {lookbackDays}d
            </span>
          )}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
        <Stat label={isPattern ? "AVG SIGNALS" : "SIGNALS"} value={Math.round(cell.count)} />
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
                  Δ {metric}
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

      {!isPattern && sortedMarkets.length > 0 && (
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
              <span style={{ color: TOKENS.textMuted, fontFamily: TOKENS.mono, fontSize: 10, fontWeight: 700 }}>
                {i + 1}.
              </span>
              <span
                style={{
                  color: TOKENS.text,
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

function fmtCellShort(metric: HeatmapMetric, v: number): string {
  if (metric === "signals") return String(Math.round(v));
  if (Math.abs(v) >= 1e3) return "$" + (v / 1e3).toFixed(1) + "k";
  return "$" + Math.round(v);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

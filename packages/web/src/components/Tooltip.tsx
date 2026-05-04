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

const TOP_N = 5;
/** Personal Polymarket referral code — bake into all market URLs we render.
 *  Override at build time with NEXT_PUBLIC_POLYMARKET_REFERRAL. */
const POLY_REFERRAL =
  (typeof process !== "undefined" && process.env["NEXT_PUBLIC_POLYMARKET_REFERRAL"]) || "Moonkeee";

function marketUrl(slug: string | null): string | null {
  if (!slug) return null;
  return `https://polymarket.com/event/${encodeURIComponent(slug)}?r=${encodeURIComponent(POLY_REFERRAL)}`;
}

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
    case "whales":
      copy.sort((a, b) => {
        const c = cmpDesc(a.uniqueWhales, b.uniqueWhales);
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
  if (metric === "whales") return String(m.uniqueWhales);
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
  // PATTERN delta doesn't carry uniqueWhales — show no comparison for
  // the whales metric.
  if (metric === "whales") return { text: "—", color: TOKENS.textSec };
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

/** Numeric value of a cell for the active metric — used by the sparkline. */
function cellMetricValue(metric: HeatmapMetric, c: HeatmapCell): number {
  switch (metric) {
    case "signals":
      return c.count;
    case "volume":
      return c.volume;
    case "pnl":
      return c.pnl;
    case "winrate":
      return c.winRate ?? 0;
    case "whales":
      return c.uniqueWhales;
  }
}

/** Sparkline of a single row across all time slots in the chosen frame.
 *  Highlights the active slot in TOKENS.accent. PNL bars centre on a
 *  zero baseline (positive up, negative down); other metrics rest on the
 *  bottom edge. Pure SVG — no chart deps. */
function RowSparkline({
  rowCells,
  metric,
  activeSlot,
  height = 36,
}: {
  rowCells: ReadonlyArray<HeatmapCell>;
  metric: HeatmapMetric;
  activeSlot: number;
  height?: number;
}) {
  if (rowCells.length === 0) return null;
  const vals = rowCells.map((c) => cellMetricValue(metric, c));
  const isPnl = metric === "pnl";
  const maxAbs = Math.max(...vals.map(Math.abs), 1);
  // Equal-width bars with a small gutter so the silhouette reads cleanly
  // at 12 buckets in a ~310px tooltip width.
  const n = vals.length;
  const gap = 2;
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${n * 10} ${height}`}
      preserveAspectRatio="none"
      style={{ display: "block" }}
    >
      {vals.map((v, i) => {
        const isActive = i === activeSlot;
        const ratio = Math.min(1, Math.abs(v) / maxAbs);
        const barH = isPnl ? (height / 2) * ratio : (height - 2) * ratio;
        const y = isPnl
          ? v >= 0
            ? height / 2 - barH
            : height / 2
          : height - 1 - barH;
        const x = i * 10 + gap / 2;
        const w = 10 - gap;
        const fill = isActive
          ? TOKENS.accent
          : isPnl
            ? v >= 0
              ? "rgba(63,185,80,0.55)"
              : "rgba(248,81,73,0.55)"
            : "rgba(125,133,144,0.45)";
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={w}
            height={Math.max(1, barH)}
            fill={fill}
            rx={1}
          />
        );
      })}
      {isPnl && (
        <line
          x1={0}
          x2={n * 10}
          y1={height / 2}
          y2={height / 2}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={0.5}
        />
      )}
    </svg>
  );
}

function metricMin(metric: HeatmapMetric, cell: HeatmapCell): number {
  if (!cell.min) return 0;
  if (metric === "volume") return cell.min.volume;
  if (metric === "pnl") return cell.min.pnl;
  // whales falls back to count — uniqueWhales not in min/max yet.
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
}) {
  const meta = categoryMeta(category);
  const isPattern = mode === "pattern";
  const sortedMarkets = isPattern ? [] : sortMarkets(cell.markets, metric).slice(0, TOP_N);
  // Top whales in this cell — always sorted by USD volume desc (server-side).
  // Hide in PATTERN mode (no per-cell whale aggregation in the pattern query).
  const cellWhales: ReadonlyArray<WhaleCellSummary> =
    isPattern ? [] : (cell.topWhales ?? []).slice(0, TOP_N);
  // Slot index inside the active row — derived from cellId pattern "{cat}:{slot}"
  // upstream. We get rowCells in display order, so the active slot is the
  // last index for LIVE (NOW) ... actually we don't have direct access to
  // slot here. The parent guarantees rowCells matches the display order; we
  // find the slot by reference identity against `cell`.
  const activeSlot = rowCells.findIndex((c) => c === cell);
  // Sparkline only for LIVE — for PATTERN, the per-cycle bar chart will be
  // a separate (planned) widget; row-across-hours sparkline is duplicative
  // of the heatmap row itself.
  const showSparkline = !isPattern && rowCells.length > 1 && activeSlot >= 0;

  const ref = useRef<HTMLDivElement | null>(null);
  const margin = 10;
  const initialW = 340;
  const initialH = isPattern
    ? 230
    : sortedMarkets.length > 0
      ? 240 + sortedMarkets.length * 26 + (showSparkline ? 50 : 0) + (cellWhales.length > 0 ? 30 + cellWhales.length * 24 : 0)
      : 140 + (showSparkline ? 50 : 0) + (cellWhales.length > 0 ? 30 + cellWhales.length * 24 : 0);

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
  }, [anchor, sortedMarkets.length, isPattern, avoidRect, onPlaced]);

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
        // Locked tooltip is interactive (so the user can click market links).
        // Hover tooltip stays pointer-transparent so it doesn't hijack the
        // mouse during cell-to-cell comparison.
        pointerEvents: locked ? "auto" : "none",
        zIndex: locked ? 31 : 30,
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
            <span style={{ color: TOKENS.textSec }}>{metric}</span>
          </div>
          <RowSparkline rowCells={rowCells} metric={metric} activeSlot={activeSlot} />
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
            <span style={{ color: TOKENS.textSec }}>by volume</span>
          </div>
          {cellWhales.map((w) => (
            <button
              key={w.addr}
              type="button"
              onClick={() => onWhaleClick(w.addr)}
              style={{
                display: "grid",
                gridTemplateColumns: "10px 1fr auto auto",
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
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 8,
                  background: w.color,
                  flexShrink: 0,
                }}
              />
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
              <span
                style={{
                  color: TOKENS.textSec,
                  fontFamily: TOKENS.mono,
                  fontSize: 10,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                {w.signals}× sig
              </span>
              <span
                style={{
                  color: TOKENS.text,
                  fontFamily: TOKENS.mono,
                  fontSize: 11,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                {w.volume > 0 ? fmtMoneyShort(w.volume) : "—"}
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
              {(() => {
                const label = m.marketQuestion ?? "(unknown market)";
                const url = marketUrl(m.marketSlug);
                const baseStyle: React.CSSProperties = {
                  color: TOKENS.text,
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
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
        {locked ? "клікни ще раз щоб розлочити" : "клікни щоб залочити"}
      </div>
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

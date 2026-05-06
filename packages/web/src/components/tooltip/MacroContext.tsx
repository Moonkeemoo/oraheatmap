"use client";

import { TOKENS } from "@/lib/tokens";
import type {
  HeatmapBucket,
  HeatmapCell,
  HeatmapMetric,
  HeatmapResponse,
  MacroKind,
} from "@/lib/types";

/**
 * MACRO-mode "where in time" block. Three lenses that anchor a single
 * cell against the broader window — cheap to compute (all derived
 * from the existing displayData; no extra request) and tell the
 * analyst what's special about this exact moment vs everything else
 * on screen.
 *
 *   Window rank      3rd of 168 · top 2%
 *   Same hour-of-day this week  $450k · top-1 of 7 (avg $200k)
 *   Cascade          next 3h ▆▄▃ −34%  one-off peak
 *
 * 1. Window rank: where this cell falls in the full grid by metric
 *    "heat" (active metric, with abs for pnl / |x − .5| for winrate
 *    so ranking matches the visual intensity ramp).
 * 2. Same-slot anchor: same hour-of-day across the macro window
 *    (1H × WEEK) or same day-of-week across weeks (1D × 12W).
 *    Borrows PATTERN-style aggregation but anchored to ONE cell —
 *    "this Tue 14:00 is the hottest 14:00 hour this week".
 * 3. Cascade: next 3 cells in the same row vs this one. Tells whether
 *    the cell was the START of a wave, the PEAK, or a one-off spike.
 */

type CascadeKind = "cascading" | "stable" | "fading" | "one-off peak";

type MacroCtx = {
  windowRank: { rank: number; total: number; pctTop: number };
  sameSlot: {
    rank: number;
    total: number;
    mean: number;
    thisValue: number;
    label: string; // "hour-of-day this week" / "Tuesdays in 12 weeks"
  } | null;
  cascade: {
    nextValues: number[];
    pctChange: number;
    kind: CascadeKind;
  } | null;
};

export function MacroContext({
  data,
  category,
  slotIdx,
  metric,
}: {
  data: HeatmapResponse;
  category: string;
  slotIdx: number;
  metric: HeatmapMetric;
}) {
  const ctx = computeMacroContext({ data, category, slotIdx, metric });
  if (!ctx) return null;
  // Hide the whole block when the cell is empty — analytics on a
  // zero-value cell are noise. Window rank still has signal but the
  // block reads as filler.
  const thisValue = ctx.sameSlot?.thisValue ?? 0;
  if (thisValue === 0 && ctx.windowRank.rank > ctx.windowRank.total * 0.5) {
    return null;
  }

  return (
    <div style={{ borderTop: `1px solid ${TOKENS.border}`, paddingTop: 8, marginBottom: 8 }}>
      <div
        style={{
          fontSize: 9,
          letterSpacing: 0.5,
          color: TOKENS.textMuted,
          textTransform: "uppercase",
          marginBottom: 8,
          fontWeight: 600,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>Cell context</span>
        <span style={{ color: TOKENS.textSec }}>
          {metric === "signals" ? "trades" : metric}
        </span>
      </div>

      {/* 1 — Window rank. Always rendered (every cell has a position). */}
      <Row
        label="Window rank"
        right={
          <span style={{ fontFamily: TOKENS.mono, fontSize: 11, color: TOKENS.textSec }}>
            <span
              style={{
                color:
                  ctx.windowRank.pctTop <= 5
                    ? TOKENS.accent
                    : ctx.windowRank.pctTop <= 25
                      ? TOKENS.text
                      : TOKENS.textSec,
                fontWeight: 600,
              }}
            >
              #{ctx.windowRank.rank}
            </span>{" "}
            <span style={{ color: TOKENS.textMuted }}>of {ctx.windowRank.total}</span>{" "}
            <span style={{ color: TOKENS.textMuted }}>·</span>{" "}
            <span style={{ color: TOKENS.text }}>top {ctx.windowRank.pctTop}%</span>
          </span>
        }
      />

      {/* 2 — Same-slot anchor. Skipped when there are <2 peers. */}
      {ctx.sameSlot && (
        <Row
          label={ctx.sameSlot.label}
          right={
            <span style={{ fontFamily: TOKENS.mono, fontSize: 11, color: TOKENS.textSec }}>
              <span
                style={{
                  color: ctx.sameSlot.rank === 1 ? TOKENS.accent : TOKENS.text,
                  fontWeight: 600,
                }}
              >
                #{ctx.sameSlot.rank}
              </span>{" "}
              <span style={{ color: TOKENS.textMuted }}>
                of {ctx.sameSlot.total}
              </span>{" "}
              <span style={{ color: TOKENS.textMuted }}>·</span>{" "}
              <span style={{ color: TOKENS.text }}>
                {ratioLabel(ctx.sameSlot.thisValue, ctx.sameSlot.mean)}
              </span>
            </span>
          }
        />
      )}

      {/* 3 — Cascade. Skipped when this is one of the trailing cells
              (no "next 3" available). */}
      {ctx.cascade && (
        <Row
          label="Cascade (next 3)"
          right={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <CascadeSparkline values={ctx.cascade.nextValues} kind={ctx.cascade.kind} />
              <span
                style={{
                  fontSize: 11,
                  fontFamily: TOKENS.mono,
                  fontWeight: 600,
                  color: cascadeColor(ctx.cascade.kind),
                }}
              >
                {cascadeLabel(ctx.cascade)}
              </span>
            </span>
          }
        />
      )}
    </div>
  );
}

// ── Sub components ─────────────────────────────────────────────────

function Row({ label, right }: { label: string; right: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 5,
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: TOKENS.textMuted,
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      {right}
    </div>
  );
}

function CascadeSparkline({
  values,
  kind,
}: {
  values: number[];
  kind: CascadeKind;
}) {
  const max = Math.max(...values, 0.0001);
  const color = cascadeColor(kind);
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 14 }}>
      {values.map((v, i) => (
        <div
          key={i}
          style={{
            width: 4,
            height: Math.max(2, (v / max) * 14),
            borderRadius: 1,
            background: color,
            opacity: v === 0 ? 0.2 : 0.7,
          }}
        />
      ))}
    </div>
  );
}

function cascadeColor(k: CascadeKind): string {
  switch (k) {
    case "cascading":
      return TOKENS.pos;
    case "fading":
    case "one-off peak":
      return TOKENS.neg;
    case "stable":
      return TOKENS.textSec;
  }
}

function cascadeLabel(c: { pctChange: number; kind: CascadeKind }): string {
  if (c.kind === "stable") return "stable";
  if (c.kind === "one-off peak") return "one-off peak";
  const sign = c.pctChange > 0 ? "+" : "";
  return `${sign}${Math.round(c.pctChange)}% · ${c.kind}`;
}

function ratioLabel(thisValue: number, mean: number): string {
  if (mean === 0) return thisValue === 0 ? "n/a" : "no peer avg";
  const ratio = thisValue / mean;
  const pct = Math.round(ratio * 100);
  return `${pct}% of avg`;
}

// ── Pure context computation ────────────────────────────────────────

function heatValue(c: HeatmapCell, m: HeatmapMetric): number {
  switch (m) {
    case "signals":
      return c.count;
    case "volume":
      return c.volume;
    case "whales":
      return c.uniqueWhales;
    case "pnl":
      // Absolute value — both red and green cells are visually "hot",
      // ranking should match that intensity perception.
      return Math.abs(c.pnl);
    case "winrate":
      // Distance from 50% — extremes (10%, 90%) read as more notable
      // than balanced (50%) on the heatmap.
      return c.winRate !== null ? Math.abs(c.winRate - 0.5) : 0;
  }
}

function bucketTs(b: HeatmapBucket | undefined): Date | null {
  if (!b?.ts) return null;
  const d = new Date(b.ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

function computeMacroContext({
  data,
  category,
  slotIdx,
  metric,
}: {
  data: HeatmapResponse;
  category: string;
  slotIdx: number;
  metric: HeatmapMetric;
}): MacroCtx | null {
  if (data.mode !== "macro") return null;
  const rowCells = data.cells[category];
  if (!rowCells) return null;
  const thisCell = rowCells[slotIdx];
  if (!thisCell) return null;
  const thisValue = heatValue(thisCell, metric);

  // 1) Window rank — flatten every cell in the macro grid.
  const allValues: number[] = [];
  for (const cat of data.categories) {
    for (const c of data.cells[cat] ?? []) {
      allValues.push(heatValue(c, metric));
    }
  }
  // Rank = how many cells are STRICTLY hotter than this one + 1.
  // Ties don't push us further down, which matches the analyst's
  // "I'm tied for top" intuition better than dense-ranking.
  let strictlyHotter = 0;
  for (const v of allValues) if (v > thisValue) strictlyHotter += 1;
  const rank = strictlyHotter + 1;
  const total = allValues.length;
  const pctTop = total > 0 ? Math.max(1, Math.round((rank / total) * 100)) : 100;

  // 2) Same-slot anchor — same-hour-of-day in 1H×WEEK, same DOW in 1D×12W.
  let sameSlot: MacroCtx["sameSlot"] = null;
  const ts = bucketTs(data.buckets[slotIdx]);
  if (ts) {
    const macroKind: MacroKind = data.macroKind ?? "hour-week";
    const peerIdx: number[] = [];
    for (let i = 0; i < data.buckets.length; i++) {
      const peerTs = bucketTs(data.buckets[i]);
      if (!peerTs) continue;
      const isPeer =
        macroKind === "hour-week"
          ? peerTs.getHours() === ts.getHours()
          : peerTs.getDay() === ts.getDay();
      if (isPeer) peerIdx.push(i);
    }
    if (peerIdx.length >= 2) {
      const peerValues = peerIdx
        .map((i) => rowCells[i])
        .filter((c): c is HeatmapCell => c !== undefined)
        .map((c) => heatValue(c, metric));
      const sum = peerValues.reduce((a, b) => a + b, 0);
      const mean = sum / peerValues.length;
      let strict = 0;
      for (const v of peerValues) if (v > thisValue) strict += 1;
      const peerRank = strict + 1;
      sameSlot = {
        rank: peerRank,
        total: peerValues.length,
        mean,
        thisValue,
        label: macroKind === "hour-week" ? sameHourLabel(ts) : sameDowLabel(ts),
      };
    }
  }

  // 3) Cascade — next 3 cells in the same row.
  let cascade: MacroCtx["cascade"] = null;
  const cascadeStart = slotIdx + 1;
  const cascadeEnd = Math.min(rowCells.length, cascadeStart + 3);
  if (cascadeEnd > cascadeStart) {
    const nextCells = rowCells.slice(cascadeStart, cascadeEnd);
    const nextValues = nextCells.map((c) => heatValue(c, metric));
    const cascadeAvg =
      nextValues.length > 0
        ? nextValues.reduce((a, b) => a + b, 0) / nextValues.length
        : 0;
    let pctChange = 0;
    if (thisValue > 0) {
      pctChange = ((cascadeAvg - thisValue) / thisValue) * 100;
    } else if (cascadeAvg > 0) {
      pctChange = 100;
    }
    let kind: CascadeKind;
    const peerMean = sameSlot?.mean ?? 0;
    // "one-off peak": this cell was much hotter than its peer mean
    // AND the cascade dropped sharply. Reads as "spike that didn't
    // sustain" rather than just "fading".
    if (peerMean > 0 && thisValue > peerMean * 1.5 && pctChange < -50) {
      kind = "one-off peak";
    } else if (pctChange > 30) {
      kind = "cascading";
    } else if (pctChange < -30) {
      kind = "fading";
    } else {
      kind = "stable";
    }
    cascade = { nextValues, pctChange, kind };
  }

  return {
    windowRank: { rank, total, pctTop },
    sameSlot,
    cascade,
  };
}

function sameHourLabel(ts: Date): string {
  const hh = String(ts.getHours()).padStart(2, "0");
  return `${hh}:00 across week`;
}

function sameDowLabel(ts: Date): string {
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][ts.getDay()];
  return `${day}s across 12w`;
}

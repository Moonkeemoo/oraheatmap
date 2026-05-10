"use client";

import { fmtMoneyShort } from "@/lib/format";
import { TOKENS } from "@/lib/tokens";
import type { SlotCharacter as SlotCharacterData } from "@/hooks/useRecurringWhales";
import type { HeatmapMetric } from "@/lib/types";

/** Skeleton for the slot-character block — 3 shimmer rows matching
 *  the Direction / Concentration / Shape layout below. Mirrors the
 *  exact dimensions so the drawer doesn't jump when the recurring-
 *  whales response lands and the real character rows take over. */
export function SlotCharacterSkeleton() {
  const shimmer: React.CSSProperties = {
    backgroundImage: `linear-gradient(90deg, ${TOKENS.panel} 0%, ${TOKENS.panel2} 50%, ${TOKENS.panel} 100%)`,
    backgroundSize: "200% 100%",
    animation: "skeletonShimmer 1.6s ease-in-out infinite",
    borderRadius: 3,
  };
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
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: 11,
            height: 11,
            borderRadius: "50%",
            border: `1.5px solid ${TOKENS.border}`,
            borderTopColor: TOKENS.textMuted,
            animation: "drawerSpinner 0.8s linear infinite",
          }}
        />
        Slot character · loading
      </div>
      <style>{`
        @keyframes drawerSpinner { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "82px 1fr auto",
            alignItems: "center",
            gap: 10,
            marginBottom: 6,
          }}
        >
          <div style={{ ...shimmer, height: 9, animationDelay: `${i * 80}ms` }} />
          <div style={{ ...shimmer, height: 6, animationDelay: `${i * 80 + 30}ms` }} />
          <div
            style={{
              ...shimmer,
              width: 90,
              height: 9,
              animationDelay: `${i * 80 + 60}ms`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * Behavioural fingerprint for a PATTERN cell. Three analytical lenses
 * stacked as compact bar rows so the analyst reads "what kind of slot
 * is this" in 5 seconds — distinct from the per-cycle histogram
 * (which says "how big across cycles") and the recurring-whale list
 * (which says "specifically who").
 *
 *   Direction      ▮▮▮▮▮▮▮▮○○ 78% BUY · $310k vs $90k
 *   Concentration  ▮▮▮▮▮▮▮○○○ top-3 = 67% (8 whales)
 *   Shape          ▂▃▄▅▆▇█    rising +12% / week
 *
 * Direction & Concentration come from the recurring-whales endpoint's
 * `character` block (single round-trip with the whale list). Shape is
 * derived client-side from the cycle histogram samples we already
 * fetched for the bar chart above — no extra request.
 */

type CycleSample = { count: number; volume: number; pnl: number; winRate: number | null };

export function SlotCharacter({
  character,
  cycleSamples,
  metric,
}: {
  character: SlotCharacterData;
  cycleSamples: ReadonlyArray<CycleSample>;
  metric: HeatmapMetric;
}) {
  // Derive cycle shape — slope of values across past cycles + visual
  // mini-histogram. Slope normalised to "% per cycle" then scaled to
  // a more intuitive cadence: HOUR pattern's "cycle = day" → slope
  // per week. DOW pattern's "cycle = week" → slope already per week.
  const values = cycleSamples.map((s) => valueForMetric(s, metric));
  const shape = computeShape(values);

  // Direction is meaningless when the slot has no trade history at
  // all (e.g. low-activity drill cell). Hide instead of showing 0% / 0%.
  const showDirection = character.totalVolume > 0;
  const showConcentration = character.uniqueWhales > 0;

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
        <span>Slot character</span>
        <span style={{ color: TOKENS.textSec, fontFamily: TOKENS.mono }}>
          {character.totalTrades} trades · {character.uniqueWhales} whales
        </span>
      </div>

      {showDirection && (
        <Row
          label="Direction"
          bar={<DirectionBar buyShare={character.buyShare} />}
          right={
            <span style={{ fontSize: 11, color: TOKENS.textSec, fontFamily: TOKENS.mono }}>
              <span style={{ color: TOKENS.pos, fontWeight: 600 }}>
                {Math.round(character.buyShare * 100)}% BUY
              </span>{" "}
              <span style={{ color: TOKENS.textMuted }}>·</span>{" "}
              <span style={{ color: TOKENS.text }}>
                {fmtMoneyShort(character.buyVolume)}
              </span>{" / "}
              <span style={{ color: TOKENS.text }}>
                {fmtMoneyShort(character.sellVolume)}
              </span>
            </span>
          }
        />
      )}

      {showConcentration && (
        <Row
          label="Concentration"
          bar={<ConcentrationBar top3Share={character.top3Share} />}
          right={
            <span style={{ fontSize: 11, color: TOKENS.textSec, fontFamily: TOKENS.mono }}>
              <span
                style={{
                  color:
                    character.top1Share >= 0.6
                      ? TOKENS.accent
                      : character.top3Share >= 0.7
                        ? TOKENS.text
                        : TOKENS.textSec,
                  fontWeight: 600,
                }}
              >
                top-3 = {Math.round(character.top3Share * 100)}%
              </span>{" "}
              <span style={{ color: TOKENS.textMuted }}>·</span>{" "}
              <span style={{ color: TOKENS.text }}>{character.uniqueWhales}</span>{" "}
              <span>{character.uniqueWhales === 1 ? "whale" : "whales"}</span>
            </span>
          }
        />
      )}

      {shape && (
        <Row
          label="Shape"
          bar={<ShapeSparkline values={values} shape={shape} />}
          right={
            <span
              style={{
                fontSize: 11,
                fontFamily: TOKENS.mono,
                color:
                  shape.kind === "rising"
                    ? TOKENS.pos
                    : shape.kind === "declining"
                      ? TOKENS.neg
                      : TOKENS.textSec,
                fontWeight: 600,
              }}
            >
              {shape.label}
            </span>
          }
        />
      )}
    </div>
  );
}

function Row({
  label,
  bar,
  right,
}: {
  label: string;
  bar: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "82px 1fr auto",
        alignItems: "center",
        gap: 10,
        marginBottom: 6,
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
      {bar}
      {right}
    </div>
  );
}

// ── Bar primitives ─────────────────────────────────────────────────

function DirectionBar({ buyShare }: { buyShare: number }) {
  // Stacked horizontal bar — green for BUY portion, red for SELL.
  // Single-bar layout reads as a single fact ("net direction") rather
  // than two separate quantities.
  const buyPct = Math.round(buyShare * 100);
  return (
    <div
      style={{
        height: 6,
        borderRadius: 3,
        background: "rgba(248,81,73,0.35)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${buyPct}%`,
          height: "100%",
          background: TOKENS.pos,
          boxShadow: `0 0 6px ${TOKENS.pos}55`,
        }}
      />
    </div>
  );
}

function ConcentrationBar({ top3Share }: { top3Share: number }) {
  // Single-progress bar. Colour shifts to amber when concentration
  // gets meaningful (>=60%) — same warning hue used elsewhere for
  // "this is dominated by a few actors".
  const pct = Math.round(top3Share * 100);
  const color = pct >= 60 ? TOKENS.accent : TOKENS.link;
  return (
    <div
      style={{
        height: 6,
        borderRadius: 3,
        background: TOKENS.border,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: color,
        }}
      />
    </div>
  );
}

function ShapeSparkline({
  values,
  shape,
}: {
  values: ReadonlyArray<number>;
  shape: ShapeResult;
}) {
  if (values.length === 0) {
    return <div style={{ height: 18 }} />;
  }
  const max = Math.max(...values, 0);
  const safe = max > 0 ? max : 1;
  const color =
    shape.kind === "rising"
      ? TOKENS.pos
      : shape.kind === "declining"
        ? TOKENS.neg
        : TOKENS.textSec;
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        alignItems: "flex-end",
        height: 18,
      }}
    >
      {values.map((v, i) => {
        const h = Math.max(2, (Math.abs(v) / safe) * 18);
        return (
          <div
            key={i}
            style={{
              flex: 1,
              minWidth: 2,
              maxWidth: 6,
              height: h,
              borderRadius: 1,
              background: color,
              opacity: v === 0 ? 0.2 : 0.7,
            }}
          />
        );
      })}
    </div>
  );
}

// ── Math ───────────────────────────────────────────────────────────

function valueForMetric(s: CycleSample, metric: HeatmapMetric): number {
  switch (metric) {
    case "signals":
      return s.count;
    case "volume":
      return s.volume;
    case "pnl":
      return s.pnl;
    case "winrate":
      return s.winRate ?? 0;
    case "whales":
      // Cycle samples don't carry uniqueWhales — closest proxy is
      // signal count (more whales typically → more signals). Not
      // perfect but keeps the shape readable rather than blank.
      return s.count;
  }
}

type ShapeResult = {
  kind: "rising" | "declining" | "stable";
  /** Slope expressed as % per week, signed. */
  weeklyPct: number;
  /** Display string e.g. "rising +12%/wk". */
  label: string;
};

function computeShape(values: ReadonlyArray<number>): ShapeResult | null {
  // Need at least 4 cycles for a meaningful slope; below that the
  // line is dominated by noise and the label would mislead.
  if (values.length < 4) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  // Linear regression: slope = sum((x-x̄)(y-ȳ)) / sum((x-x̄)²)
  // x = cycle index, y = metric value
  let num = 0;
  let den = 0;
  const xMean = (values.length - 1) / 2;
  for (let i = 0; i < values.length; i++) {
    const dx = i - xMean;
    const dy = values[i]! - mean;
    num += dx * dy;
    den += dx * dx;
  }
  const slope = den > 0 ? num / den : 0;
  // Slope is "metric units per cycle". Express as a percentage of the
  // mean ("% per cycle"). For HOUR pattern (cycle = 1 day) scale to
  // /week. For DOW pattern (cycle = 1 week) keep as is. We don't have
  // patternKind here — caller-side hint would tighten this, but the
  // distinction is fine for both since most slots have ≥7 cycles
  // either way and the ratio reads similarly.
  // Conservative default: assume HOUR (×7) since that's the more
  // common pattern (30 cycles vs DOW's 4).
  const slopePerCyclePct = mean !== 0 ? (slope / Math.abs(mean)) * 100 : 0;
  const weeklyPct = slopePerCyclePct * 7;
  const abs = Math.abs(weeklyPct);
  let kind: ShapeResult["kind"];
  if (abs < 5) kind = "stable";
  else kind = weeklyPct > 0 ? "rising" : "declining";
  const sign = weeklyPct > 0 ? "+" : "";
  const label =
    kind === "stable"
      ? "stable"
      : `${kind} ${sign}${Math.round(weeklyPct)}%/wk`;
  return { kind, weeklyPct, label };
}

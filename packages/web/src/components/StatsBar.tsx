import { useMemo } from "react";
import { categoryMeta } from "@/lib/categories";
import { fmtMoneyShort } from "@/lib/format";
import { TOKENS } from "@/lib/tokens";
import type { HeatmapResponse } from "@/lib/types";
import { MiniSpark } from "./MiniSpark";

type StatItem = {
  label: string;
  value?: string;
  suffix?: string;
  delta?: { val: number; dir: "up" | "down" };
  pnlDir?: "up" | "down";
  badge?: { color: string; label: string };
  whale?: { color: string; alias: string };
  spark?: { values: ReadonlyArray<number>; color: string };
  bar?: number;
  sub?: string;
};

function StatCell({ item, divider }: { item: StatItem; divider: boolean }) {
  return (
    <div style={{ position: "relative", paddingRight: divider ? 20 : 0 }}>
      {divider && (
        <div
          style={{ position: "absolute", right: 0, top: 4, bottom: 4, width: 1, background: TOKENS.border }}
        />
      )}
      <div
        style={{
          fontSize: 9,
          color: TOKENS.textMuted,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        {item.label}
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
          {item.badge ? (
            <span
              style={{
                alignSelf: "flex-start",
                background: item.badge.color,
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.4,
                padding: "4px 9px",
                borderRadius: 3,
                textTransform: "uppercase",
              }}
            >
              {item.badge.label}
            </span>
          ) : item.whale ? (
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 9,
                  background: item.whale.color,
                  boxShadow: `0 0 8px ${item.whale.color}88`,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: TOKENS.text,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontFamily: TOKENS.mono,
                }}
              >
                {item.whale.alias}
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span
                style={{
                  fontSize: 19,
                  fontWeight: 800,
                  color: item.pnlDir
                    ? item.pnlDir === "up"
                      ? TOKENS.pos
                      : TOKENS.neg
                    : TOKENS.text,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: 0.2,
                  lineHeight: 1,
                }}
              >
                {item.value}
              </span>
              {item.suffix && (
                <span style={{ fontSize: 12, color: TOKENS.textSec, fontWeight: 600 }}>
                  {item.suffix}
                </span>
              )}
              {item.delta && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: item.delta.dir === "up" ? TOKENS.pos : TOKENS.neg,
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: 0.2,
                  }}
                >
                  {item.delta.dir === "up" ? "▲" : "▼"} {Math.abs(item.delta.val)}%
                </span>
              )}
            </div>
          )}
          {item.sub && (
            <span
              style={{
                fontSize: 10,
                color: TOKENS.textMuted,
                fontFamily: TOKENS.mono,
                letterSpacing: 0.2,
              }}
            >
              {item.sub}
            </span>
          )}
          {item.bar !== undefined && (
            <div
              style={{
                marginTop: 4,
                height: 3,
                borderRadius: 3,
                background: TOKENS.border,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${item.bar * 100}%`,
                  background: `linear-gradient(to right, ${TOKENS.pos}, ${TOKENS.accent})`,
                }}
              />
            </div>
          )}
        </div>
        {item.spark && <MiniSpark values={item.spark.values} color={item.spark.color} />}
      </div>
    </div>
  );
}

export function StatsBar({ data, trackedCount }: { data: HeatmapResponse; trackedCount: number }) {
  const num = data.buckets.length;

  const trendSignals = useMemo(
    () =>
      Array.from({ length: num }, (_, i) =>
        data.categories.reduce((a, cat) => a + (data.cells[cat][i]?.count ?? 0), 0),
      ),
    [data, num],
  );
  const trendVolume = useMemo(
    () =>
      Array.from({ length: num }, (_, i) =>
        data.categories.reduce((a, cat) => a + (data.cells[cat][i]?.volume ?? 0), 0),
      ),
    [data, num],
  );

  const half = Math.floor(num / 2);
  const lastHalf = trendSignals.slice(half).reduce((a, b) => a + b, 0);
  const firstHalf = trendSignals.slice(0, half).reduce((a, b) => a + b, 0);
  const sigDelta = firstHalf > 0 ? Math.round(((lastHalf - firstHalf) / firstHalf) * 100) : 0;

  // Heatmap.tsx only mounts StatsBar when totals exists (LIVE mode), but TS
  // doesn't carry that constraint through props. Bail safely if absent.
  if (!data.totals) return null;
  const t = data.totals;
  const topCatMeta = t.topCategory ? categoryMeta(t.topCategory) : null;

  const items: StatItem[] = [
    {
      label: "Total Signals",
      value: t.signals.toLocaleString(),
      delta: { val: sigDelta, dir: sigDelta >= 0 ? "up" : "down" },
      spark: { values: trendSignals, color: TOKENS.link },
    },
    {
      label: "Total Volume",
      value: fmtMoneyShort(t.volume),
      sub: "BUY entries (USD)",
      spark: { values: trendVolume, color: TOKENS.accent },
    },
    {
      label: "Win Rate",
      value: t.winRate === null ? "—" : Math.round(t.winRate * 100) + "%",
      pnlDir: t.winRate === null ? undefined : t.winRate >= 0.5 ? "up" : "down",
      sub: "by exits",
    },
    topCatMeta
      ? {
          label: "Top Category",
          badge: { color: topCatMeta.color, label: topCatMeta.label },
          sub: `${(t.signals).toLocaleString()} total signals`,
        }
      : { label: "Top Category", value: "—" },
    t.topWhale
      ? {
          label: "Top Whale",
          whale: { color: t.topWhale.color, alias: t.topWhale.alias },
          sub: "by USD entered",
        }
      : { label: "Top Whale", value: "—" },
    {
      label: "Active Whales",
      value: t.activeWhales.toString(),
      suffix: `/ ${trackedCount.toLocaleString()}`,
      bar: trackedCount > 0 ? Math.min(1, t.activeWhales / trackedCount) : 0,
    },
  ];

  return (
    <div
      style={{
        borderTop: `1px solid ${TOKENS.border}`,
        padding: "14px 32px",
        background: TOKENS.panel,
        display: "grid",
        gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
        gap: 22,
        flexShrink: 0,
      }}
    >
      {items.map((it, i) => (
        <StatCell key={it.label} item={it} divider={i < items.length - 1} />
      ))}
    </div>
  );
}

import { useMemo } from "react";
import { categoryMeta } from "@/lib/categories";
import { fmtMoneyShort } from "@/lib/format";
import { TOKENS } from "@/lib/tokens";
import type { Category, HeatmapResponse } from "@/lib/types";
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
        data.categories.reduce((a, cat) => a + (data.cells[cat]?.[i]?.count ?? 0), 0),
      ),
    [data, num],
  );
  const trendVolume = useMemo(
    () =>
      Array.from({ length: num }, (_, i) =>
        data.categories.reduce((a, cat) => a + (data.cells[cat]?.[i]?.volume ?? 0), 0),
      ),
    [data, num],
  );

  const half = Math.floor(num / 2);
  const lastHalf = trendSignals.slice(half).reduce((a, b) => a + b, 0);
  const firstHalf = trendSignals.slice(0, half).reduce((a, b) => a + b, 0);
  const sigDelta = firstHalf > 0 ? Math.round(((lastHalf - firstHalf) / firstHalf) * 100) : 0;

  // PATTERN totals derived client-side from the grid (server returns null in
  // pattern mode — single-window totals don't have a clear meaning when each
  // cell is itself an average). Sums across cells = "average daily total".
  const isPattern = data.mode === "pattern";
  const derived = useMemo(() => {
    let signals = 0;
    let volume = 0;
    let pnl = 0;
    let wins = 0;
    let exits = 0;
    let topCat: string | null = null;
    let topCount = 0;
    const perCat: Record<string, number> = {};
    for (const cat of data.categories) {
      let catCount = 0;
      for (const c of data.cells[cat] ?? []) {
        signals += c.count;
        volume += c.volume;
        pnl += c.pnl;
        catCount += c.count;
        if (c.winRate !== null) {
          // Approximate win/loss reconstruction not possible from rate alone;
          // fall back to weighted avg: treat each non-null cell as 1 sample.
          // Good enough for a footer summary; LIVE has the precise number.
          wins += c.winRate;
          exits += 1;
        }
      }
      perCat[cat] = catCount;
      if (catCount > topCount) {
        topCount = catCount;
        topCat = cat;
      }
    }
    const winRate = exits > 0 ? wins / exits : null;
    return { signals, volume, pnl, winRate, topCat, topCount };
  }, [data]);

  const t = data.totals;
  const isDrill = data.drillCategory !== null;
  // In drill mode `topCat` is a subcategory slug — colour it with the parent
  // bucket's hue and label it via subcategoryLabels.
  const topCategoryRaw = t?.topCategory ?? derived.topCat;
  const topCatMeta = topCategoryRaw
    ? isDrill
      ? {
          color: categoryMeta(data.drillCategory as Category).color,
          label: data.subcategoryLabels?.[topCategoryRaw] ?? topCategoryRaw,
        }
      : categoryMeta(topCategoryRaw as Category)
    : null;
  const totalSignals = t?.signals ?? Math.round(derived.signals);
  const totalVolume = t?.volume ?? derived.volume;
  const totalWinRate = t?.winRate ?? derived.winRate;

  const items: StatItem[] = [
    {
      label: isPattern ? "Avg Signals / Day" : "Total Signals",
      value: totalSignals.toLocaleString(),
      delta: isPattern ? undefined : { val: sigDelta, dir: sigDelta >= 0 ? "up" : "down" },
      spark: { values: trendSignals, color: TOKENS.link },
    },
    {
      label: isPattern ? "Avg Volume / Day" : "Total Volume",
      value: fmtMoneyShort(totalVolume),
      sub: "BUY entries (USD)",
      spark: { values: trendVolume, color: TOKENS.accent },
    },
    {
      label: "Win Rate",
      value: totalWinRate === null ? "—" : Math.round(totalWinRate * 100) + "%",
      pnlDir: totalWinRate === null ? undefined : totalWinRate >= 0.5 ? "up" : "down",
      sub: isPattern ? "avg over slots" : "by exits",
    },
    topCatMeta
      ? {
          label: isDrill ? "Top Subcategory" : "Top Category",
          badge: { color: topCatMeta.color, label: topCatMeta.label },
          sub: isPattern
            ? `${Math.round(derived.topCount).toLocaleString()} avg signals`
            : `${totalSignals.toLocaleString()} total signals`,
        }
      : { label: isDrill ? "Top Subcategory" : "Top Category", value: "—" },
    isPattern
      ? {
          label: "Lookback",
          value: String(data.lookbackDays ?? 30),
          suffix: "days",
          sub: "trend window",
        }
      : t?.topWhale
        ? {
            label: "Top Whale",
            whale: { color: t.topWhale.color, alias: t.topWhale.alias },
            sub: "by USD entered",
          }
        : { label: "Top Whale", value: "—" },
    isPattern
      ? {
          label: "Tracked Whales",
          value: trackedCount.toLocaleString(),
          sub: "corpus size",
        }
      : {
          label: "Active Whales",
          value: (t?.activeWhales ?? 0).toString(),
          suffix: `/ ${trackedCount.toLocaleString()}`,
          bar: trackedCount > 0 ? Math.min(1, (t?.activeWhales ?? 0) / trackedCount) : 0,
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

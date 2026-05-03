import { useMemo } from "react";
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
  whale?: { color: string; alias: string };
  spark?: { values: ReadonlyArray<number>; color: string };
  bar?: number;
  sub?: string;
  /** Hover hint shown via native title attribute. */
  tooltip?: string;
};

function StatCell({ item, divider }: { item: StatItem; divider: boolean }) {
  return (
    <div
      title={item.tooltip}
      style={{ position: "relative", paddingRight: divider ? 20 : 0, cursor: item.tooltip ? "help" : "default" }}
    >
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
          {item.whale ? (
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
  const trendPnl = useMemo(
    () =>
      Array.from({ length: num }, (_, i) =>
        data.categories.reduce((a, cat) => a + (data.cells[cat]?.[i]?.pnl ?? 0), 0),
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
    for (const cat of data.categories) {
      for (const c of data.cells[cat] ?? []) {
        signals += c.count;
        volume += c.volume;
        pnl += c.pnl;
        if (c.winRate !== null) {
          // Approximate win/loss reconstruction not possible from rate alone;
          // fall back to weighted avg: treat each non-null cell as 1 sample.
          // Good enough for a footer summary; LIVE has the precise number.
          wins += c.winRate;
          exits += 1;
        }
      }
    }
    const winRate = exits > 0 ? wins / exits : null;
    return { signals, volume, pnl, winRate };
  }, [data]);

  const t = data.totals;
  const totalSignals = t?.signals ?? Math.round(derived.signals);
  const totalVolume = t?.volume ?? derived.volume;
  const totalPnl = t?.pnl ?? derived.pnl;
  const totalWinRate = t?.winRate ?? derived.winRate;

  const items: StatItem[] = [
    {
      label: isPattern ? "Avg Signals / Day" : "Total Signals",
      value: totalSignals.toLocaleString(),
      delta: isPattern ? undefined : { val: sigDelta, dir: sigDelta >= 0 ? "up" : "down" },
      spark: { values: trendSignals, color: TOKENS.link },
      tooltip:
        "Number of whale trades captured in this window. Per-bucket trend shown as the sparkline. Δ% compares the latter half of the window to the earlier half.",
    },
    {
      label: isPattern ? "Avg Volume / Day" : "Total Volume",
      value: fmtMoneyShort(totalVolume),
      sub: "BUY entries (USD)",
      spark: { values: trendVolume, color: TOKENS.accent },
      tooltip:
        "USD value of BUY-side trades only — money entering whale positions. Excludes SELLs and SETTLEMENTs to keep this as a one-directional 'inflow' metric.",
    },
    {
      label: isPattern ? "Avg PnL / Day" : "Total PnL",
      value: fmtMoneyShort(totalPnl),
      pnlDir: totalPnl > 0 ? "up" : totalPnl < 0 ? "down" : undefined,
      sub: "realized on exits",
      spark: { values: trendPnl, color: totalPnl >= 0 ? TOKENS.pos : TOKENS.neg },
      tooltip:
        "Realized profit/loss summed across all SELL and SETTLEMENT events in this window. SELLs without a known prior BUY contribute nothing (bootstrap NULL — fades as we accumulate history).",
    },
    {
      label: "Win Rate",
      value: totalWinRate === null ? "—" : Math.round(totalWinRate * 100) + "%",
      pnlDir: totalWinRate === null ? undefined : totalWinRate >= 0.5 ? "up" : "down",
      sub: isPattern ? "avg over slots" : "by exits",
      tooltip:
        "Share of exits (SELL or SETTLEMENT) that closed in profit. Denominator excludes break-even exits and entries (BUYs).",
    },
    isPattern
      ? {
          label: "Lookback",
          value: String(data.lookbackDays ?? 30),
          suffix: "days",
          sub: "trend window",
          tooltip:
            "Number of days the cyclical pattern averages over. Lower values react quicker to recent shifts; higher values smooth out one-off spikes.",
        }
      : t?.topWhale
        ? {
            label: "Top Whale",
            whale: { color: t.topWhale.color, alias: t.topWhale.alias },
            sub: `${t.topWhale.alias.startsWith("0x") ? "address (no leaderboard alias)" : "Polymarket username"} · by USD entered`,
            tooltip: `Whale with the largest BUY-side USD inflow in this window.\nFull address: ${t.topWhale.addr}`,
          }
        : { label: "Top Whale", value: "—" },
    isPattern
      ? {
          label: "Tracked Whales",
          value: trackedCount.toLocaleString(),
          sub: "corpus size",
          tooltip:
            "Total addresses on the watchlist. Refreshed weekly from the Polymarket leaderboard (top-500 by ALL-time PnL per category, deduped).",
        }
      : {
          label: "Active Whales",
          value: (t?.activeWhales ?? 0).toString(),
          suffix: `/ ${trackedCount.toLocaleString()}`,
          bar: trackedCount > 0 ? Math.min(1, (t?.activeWhales ?? 0) / trackedCount) : 0,
          tooltip:
            "Distinct whales from the corpus that traded at least once in this window. The bar shows the share of the full watchlist that's currently active.",
        },
  ];

  return (
    <div
      style={{
        borderTop: `1px solid ${TOKENS.border}`,
        padding: "14px 32px",
        background: TOKENS.panel,
        display: "grid",
        // 6 cards (after dropping Top Category) — `1fr` each would give Win
        // Rate (minimal content) the same width as Top Whale (long alias).
        // Tuned per content: cards with sparklines get equal share, Win Rate
        // takes less, Top Whale takes a bit more so usernames don't truncate.
        gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,0.7fr) minmax(0,1.3fr) minmax(0,1fr)",
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

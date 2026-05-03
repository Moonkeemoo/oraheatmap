import { useMemo, useState, type ReactNode } from "react";
import { categoryMeta } from "@/lib/categories";
import { fmtMoney, fmtMoneyShort } from "@/lib/format";
import { TOKENS } from "@/lib/tokens";
import type { Category, HeatmapResponse } from "@/lib/types";
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
  /** Rich popover content rendered above the card on hover. Lazy so we don't
   *  pay the cost on every render — only when the user actually hovers. */
  popover?: () => ReactNode;
  /** Width override (px) for the popover panel. Default 320. */
  popoverWidth?: number;
};

function StatCell({
  item,
  divider,
  hovered,
  onHoverChange,
}: {
  item: StatItem;
  divider: boolean;
  hovered: boolean;
  onHoverChange: (h: boolean) => void;
}) {
  const interactive = item.tooltip || item.popover;
  return (
    <div
      title={item.popover ? undefined : item.tooltip}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      style={{
        position: "relative",
        paddingRight: divider ? 20 : 0,
        cursor: interactive ? "help" : "default",
      }}
    >
      {hovered && item.popover && (
        <KpiPopover width={item.popoverWidth ?? 320}>{item.popover()}</KpiPopover>
      )}
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

/** Floating popover anchored above the stat card. Appears on hover so the user
 *  can drill into a single number without clicking — much richer than a
 *  native title= tooltip. */
function KpiPopover({ width, children }: { width: number; children: ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        // Anchor to the card's left edge; `bottom: 100% + margin` puts the
        // panel directly above the card so the user reads downward into the
        // number they hovered.
        left: 0,
        bottom: "calc(100% + 10px)",
        width,
        maxWidth: "92vw",
        background: TOKENS.panel,
        border: `1px solid ${TOKENS.borderHi}`,
        borderRadius: 8,
        padding: "12px 14px",
        boxShadow: "0 16px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.4)",
        // We want the user to be able to click links inside the popover, so
        // pointerEvents stays auto.
        pointerEvents: "auto",
        zIndex: 40,
        animation: "tipIn .12s ease-out",
        boxSizing: "border-box",
        fontFamily: TOKENS.font,
        color: TOKENS.text,
      }}
    >
      {children}
    </div>
  );
}

function PopoverHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        marginBottom: 8,
      }}
    >
      <span
        style={{
          fontSize: 9,
          letterSpacing: 0.5,
          color: TOKENS.textMuted,
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        {title}
      </span>
      {hint && (
        <span style={{ fontSize: 9, color: TOKENS.textSec, fontFamily: TOKENS.mono }}>
          {hint}
        </span>
      )}
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

  // Per-row PnL ranking (top-level → category, drill → subcategory). Powers
  // the PnL card hover popover. Sorted by abs PnL desc so the most "loud"
  // rows surface first regardless of sign.
  const pnlByRow = useMemo(() => {
    const out: Array<{ key: string; pnl: number; signals: number }> = [];
    for (const cat of data.categories) {
      let pnl = 0;
      let signals = 0;
      for (const c of data.cells[cat] ?? []) {
        pnl += c.pnl;
        signals += c.count;
      }
      out.push({ key: cat, pnl, signals });
    }
    out.sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
    return out;
  }, [data]);

  const isDrill = data.drillCategory !== null;
  const rowLabel = (key: string): string => {
    if (isDrill) return data.subcategoryLabels?.[key] ?? key.toUpperCase();
    return categoryMeta(key as Category).label;
  };
  const rowColor = (key: string): string => {
    if (isDrill && data.drillCategory) {
      return categoryMeta(data.drillCategory as Category).color;
    }
    return categoryMeta(key as Category).color;
  };

  // Hover state — only one popover open at a time; index into the items array.
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Popover renderers — closed over the live data so labels/colors stay in
  // sync with the current view (drill vs top-level, mode, range).
  const renderPnlPopover = (): ReactNode => (
    <>
      <PopoverHeader
        title={isDrill ? "PnL by subcategory" : "PnL by category"}
        hint={`total ${fmtMoney(totalPnl)}`}
      />
      {pnlByRow.length === 0 ? (
        <div style={{ fontSize: 11, color: TOKENS.textSec }}>no data</div>
      ) : (
        pnlByRow.map((r) => {
          const color = r.pnl > 0 ? TOKENS.pos : r.pnl < 0 ? TOKENS.neg : TOKENS.textSec;
          return (
            <div
              key={r.key}
              style={{
                display: "grid",
                gridTemplateColumns: "10px 1fr auto",
                alignItems: "center",
                gap: 8,
                fontSize: 11,
                marginBottom: 5,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: rowColor(r.key),
                }}
              />
              <span style={{ color: TOKENS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {rowLabel(r.key)}
                <span style={{ color: TOKENS.textMuted, marginLeft: 6, fontSize: 10 }}>
                  · {r.signals.toLocaleString()} sig
                </span>
              </span>
              <span style={{ color, fontFamily: TOKENS.mono, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {r.pnl >= 0 ? "+" : ""}{fmtMoney(r.pnl)}
              </span>
            </div>
          );
        })
      )}
    </>
  );

  const renderTopWhalesPopover = (): ReactNode => {
    const list = data.topWhales ?? [];
    return (
      <>
        <PopoverHeader
          title={isDrill ? `Top whales · ${categoryMeta(data.drillCategory as Category).label}` : "Top whales"}
          hint="by USD entered"
        />
        {list.length === 0 ? (
          <div style={{ fontSize: 11, color: TOKENS.textSec }}>no data</div>
        ) : (
          list.map((w, i) => {
            const pnlColor = w.pnl > 0 ? TOKENS.pos : w.pnl < 0 ? TOKENS.neg : TOKENS.textSec;
            return (
              <div
                key={w.addr}
                style={{
                  display: "grid",
                  gridTemplateColumns: "16px 10px 1fr auto auto",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                  marginBottom: 5,
                  lineHeight: 1.3,
                }}
              >
                <span style={{ color: TOKENS.textMuted, fontFamily: TOKENS.mono, fontSize: 10, fontWeight: 700 }}>
                  {i + 1}.
                </span>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 8,
                    background: w.color,
                    boxShadow: `0 0 6px ${w.color}88`,
                  }}
                />
                <span
                  style={{
                    color: TOKENS.text,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontFamily: w.alias.startsWith("0x") ? TOKENS.mono : TOKENS.font,
                  }}
                  title={w.addr}
                >
                  {w.alias}
                </span>
                <span
                  style={{
                    color: TOKENS.text,
                    fontFamily: TOKENS.mono,
                    fontSize: 11,
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fmtMoneyShort(w.volume)}
                </span>
                <span
                  style={{
                    color: pnlColor,
                    fontFamily: TOKENS.mono,
                    fontSize: 10,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    minWidth: 50,
                    textAlign: "right",
                  }}
                >
                  {w.pnl >= 0 ? "+" : ""}{fmtMoneyShort(w.pnl)}
                </span>
              </div>
            );
          })
        )}
      </>
    );
  };

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
      sub: "realized on exits — hover for breakdown",
      spark: { values: trendPnl, color: totalPnl >= 0 ? TOKENS.pos : TOKENS.neg },
      tooltip:
        "Realized profit/loss summed across all SELL and SETTLEMENT events in this window.",
      popover: renderPnlPopover,
      popoverWidth: 360,
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
            sub: "by USD entered — hover for top 10",
            tooltip: `${t.topWhale.alias.startsWith("0x") ? "address (no leaderboard alias)" : "Polymarket username"}\n${t.topWhale.addr}`,
            popover: renderTopWhalesPopover,
            popoverWidth: 380,
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
        <StatCell
          key={it.label}
          item={it}
          divider={i < items.length - 1}
          hovered={hoveredIdx === i}
          onHoverChange={(h) => {
            if (h) setHoveredIdx(i);
            else setHoveredIdx((prev) => (prev === i ? null : prev));
          }}
        />
      ))}
    </div>
  );
}

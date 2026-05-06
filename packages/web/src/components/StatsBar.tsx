import { useMemo, useState, type ReactNode } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { categoryMeta } from "@/lib/categories";
import { fmtMoney, fmtMoneyShort } from "@/lib/format";
import { TOKENS } from "@/lib/tokens";
import type { Category, HeatmapResponse } from "@/lib/types";
import { MiniSpark } from "./MiniSpark";
import { WhaleAvatar } from "./WhaleAvatar";
import { WhaleSearch } from "./WhaleSearch";

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
  /** Make the value/badge area clickable (e.g. Top Whale → open drawer). */
  onClick?: () => void;
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
            <div
              role={item.onClick ? "button" : undefined}
              tabIndex={item.onClick ? 0 : undefined}
              onClick={item.onClick}
              onKeyDown={(e) => { if (item.onClick && (e.key === "Enter" || e.key === " ")) item.onClick(); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                cursor: item.onClick ? "pointer" : "default",
                borderRadius: 4,
              }}
              onMouseEnter={(e) => {
                if (item.onClick) (e.currentTarget as HTMLDivElement).style.opacity = "0.8";
              }}
              onMouseLeave={(e) => {
                if (item.onClick) (e.currentTarget as HTMLDivElement).style.opacity = "1";
              }}
            >
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
                  fontFamily: item.whale.alias.startsWith("0x") ? TOKENS.mono : TOKENS.font,
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
      {/* Invisible bridge fills the 10px gap between card and popover so
          the mouse never leaves the parent card's subtree while traveling
          up. Without this the parent's onMouseLeave fires the moment the
          cursor crosses the gap, the popover unmounts, and you can't
          reach the search input or click any row. Pointer-events on so
          it counts for the hit-test, transparent so it's invisible. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "100%",
          height: 12,
          background: "transparent",
        }}
      />
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

export function StatsBar({
  data,
  trackedCount,
  onWhaleClick,
  isAuthed,
  onRequestLogin,
}: {
  data: HeatmapResponse;
  trackedCount: number;
  /** Open the per-whale profile drawer for the clicked address. */
  onWhaleClick: (addr: string) => void;
  /** When false, every KPI's popover is replaced by a single sign-in CTA
   *  and the Top Whale onClick redirects to the login modal — keeps
   *  unauth UX consistent across the bar (was ad-hoc per item). */
  isAuthed: boolean;
  onRequestLogin: () => void;
}) {
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

  // Per-row aggregates (top-level → categories, drill → subcategories).
  // One pass; each popover sorts the result by its own metric. Win rate is
  // approximated as a count-weighted average of per-cell rates because the
  // wire doesn't carry win/loss counts directly.
  type RowAgg = {
    key: string;
    signals: number;
    volume: number;
    pnl: number;
    /** Weighted-sum numerator (sum of cell.winRate × cell.count over decided cells). */
    wrNum: number;
    /** Weighted-sum denominator (sum of cell.count over decided cells). */
    wrDen: number;
    /** Sum of per-cell uniqueWhales — over-counts whales active across multiple
     *  buckets within the same category, so it's a "busyness" proxy, not a
     *  true distinct count. */
    uniqueSum: number;
  };
  const rankByRow = useMemo<RowAgg[]>(() => {
    const out: RowAgg[] = [];
    for (const cat of data.categories) {
      const agg: RowAgg = { key: cat, signals: 0, volume: 0, pnl: 0, wrNum: 0, wrDen: 0, uniqueSum: 0 };
      for (const c of data.cells[cat] ?? []) {
        agg.signals += c.count;
        agg.volume += c.volume;
        agg.pnl += c.pnl;
        if (c.winRate !== null) {
          agg.wrNum += c.winRate * c.count;
          agg.wrDen += c.count;
        }
        agg.uniqueSum += c.uniqueWhales;
      }
      out.push(agg);
    }
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
  const isMobile = useIsMobile();

  // Single sign-in CTA used for every popover when the user isn't
  // authenticated. Keeps the bar's UX consistent — every KPI either
  // expands or it doesn't, instead of "PnL opens but Top Whale prompts
  // to log in".
  const renderLockedPopover = (): ReactNode => (
    <button
      onClick={onRequestLogin}
      style={{
        background: TOKENS.panel2,
        border: `1px solid ${TOKENS.borderHi}`,
        color: TOKENS.text,
        fontFamily: "inherit",
        fontSize: 11,
        fontWeight: 600,
        padding: "10px 12px",
        borderRadius: 6,
        width: "100%",
        cursor: "pointer",
        textAlign: "left",
        lineHeight: 1.4,
        transition: "filter .12s",
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.15)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.filter = "none")}
    >
      <span style={{ display: "block", color: TOKENS.text, fontWeight: 700, marginBottom: 2 }}>
        🔒 Sign in to unlock
      </span>
      <span style={{ display: "block", color: TOKENS.textSec, fontSize: 10, fontWeight: 500 }}>
        Per-category breakdowns &amp; whale lists
      </span>
    </button>
  );

  // ─── Generic per-row ranking popover ──────────────────────────────────
  // One renderer drives the breakdown for Signals, Volume, PnL, Win Rate.
  // Each metric supplies: a sort key, a value formatter, a value color, and
  // the popover title + hint to set context.
  function renderRanking(args: {
    title: string;
    hint?: string;
    valueOf: (r: RowAgg) => number;
    valueText: (r: RowAgg) => string;
    valueColor?: (r: RowAgg) => string;
    sortBy?: "value" | "absValue";
  }): ReactNode {
    const sorted = rankByRow.slice().sort((a, b) => {
      const av = args.valueOf(a);
      const bv = args.valueOf(b);
      return args.sortBy === "absValue"
        ? Math.abs(bv) - Math.abs(av)
        : bv - av;
    });
    return (
      <>
        <PopoverHeader title={args.title} hint={args.hint} />
        {sorted.length === 0 ? (
          <div style={{ fontSize: 11, color: TOKENS.textSec }}>no data</div>
        ) : (
          sorted.map((r) => (
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
              </span>
              <span
                style={{
                  color: args.valueColor ? args.valueColor(r) : TOKENS.text,
                  fontFamily: TOKENS.mono,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {args.valueText(r)}
              </span>
            </div>
          ))
        )}
      </>
    );
  }

  const breakdownLabel = isDrill ? "subcategory" : "category";

  const renderSignalsPopover = (): ReactNode =>
    renderRanking({
      title: `Signals by ${breakdownLabel}`,
      hint: `total ${totalSignals.toLocaleString()}`,
      valueOf: (r) => r.signals,
      valueText: (r) => r.signals.toLocaleString(),
    });

  const renderVolumePopover = (): ReactNode =>
    renderRanking({
      title: `Volume by ${breakdownLabel}`,
      hint: `total ${fmtMoneyShort(totalVolume)}`,
      valueOf: (r) => r.volume,
      valueText: (r) => fmtMoneyShort(r.volume),
    });

  const renderPnlPopover = (): ReactNode =>
    renderRanking({
      title: `PnL by ${breakdownLabel}`,
      hint: `total ${fmtMoney(totalPnl)}`,
      valueOf: (r) => r.pnl,
      valueText: (r) => (r.pnl >= 0 ? "+" : "") + fmtMoney(r.pnl),
      valueColor: (r) => (r.pnl > 0 ? TOKENS.pos : r.pnl < 0 ? TOKENS.neg : TOKENS.textSec),
      sortBy: "absValue",
    });

  const renderWinRatePopover = (): ReactNode =>
    renderRanking({
      title: `Win rate by ${breakdownLabel}`,
      hint: totalWinRate === null ? "no exits yet" : `overall ${Math.round(totalWinRate * 100)}%`,
      valueOf: (r) => (r.wrDen > 0 ? r.wrNum / r.wrDen : -1),
      valueText: (r) =>
        r.wrDen > 0 ? Math.round((r.wrNum / r.wrDen) * 100) + "%" : "—",
      valueColor: (r) => {
        if (r.wrDen === 0) return TOKENS.textSec;
        const wr = r.wrNum / r.wrDen;
        return wr >= 0.5 ? TOKENS.pos : TOKENS.neg;
      },
    });

  // ─── Whale-list renderer (Top Whale + Active Whales share the format) ──
  function renderWhaleList(args: {
    title: string;
    hint: string;
    sortBy: "volume" | "signals";
  }): ReactNode {
    const list = (data.topWhales ?? []).slice().sort((a, b) =>
      args.sortBy === "volume" ? b.volume - a.volume : b.signals - a.signals,
    );
    return (
      <>
        <PopoverHeader title={args.title} hint={args.hint} />
        {list.length === 0 ? (
          <div style={{ fontSize: 11, color: TOKENS.textSec }}>no data</div>
        ) : (
          list.map((w, i) => {
            const pnlColor = w.pnl > 0 ? TOKENS.pos : w.pnl < 0 ? TOKENS.neg : TOKENS.textSec;
            const primary = args.sortBy === "volume" ? fmtMoneyShort(w.volume) : w.signals.toLocaleString();
            const secondary = args.sortBy === "volume"
              ? `${w.signals.toLocaleString()} tr`
              : fmtMoneyShort(w.volume);
            return (
              <div
                key={w.addr}
                role="button"
                tabIndex={0}
                onClick={() => onWhaleClick(w.addr)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onWhaleClick(w.addr); }}
                style={{
                  display: "grid",
                  gridTemplateColumns: "16px 10px 1fr auto auto",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                  marginBottom: 5,
                  lineHeight: 1.3,
                  cursor: "pointer",
                  borderRadius: 4,
                  padding: "2px 4px",
                  marginLeft: -4,
                  marginRight: -4,
                  transition: "background .12s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = TOKENS.panel2 ?? "rgba(255,255,255,0.04)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = "transparent";
                }}
              >
                <span style={{ color: TOKENS.textMuted, fontFamily: TOKENS.mono, fontSize: 10, fontWeight: 700 }}>
                  {i + 1}.
                </span>
                <WhaleAvatar profileImage={w.profileImage} color={w.color} size={16} />
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
                  <span style={{ color: TOKENS.textMuted, marginLeft: 6, fontSize: 10 }}>
                    · {secondary}
                  </span>
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
                  {primary}
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
  }

  const drillSuffix = isDrill ? ` · ${categoryMeta(data.drillCategory as Category).label}` : "";
  const renderTopWhalesPopover = (): ReactNode => (
    <WhaleSearch
      onPick={onWhaleClick}
      defaultContent={renderWhaleList({
        title: `Top whales${drillSuffix}`,
        hint: "by USD entered",
        sortBy: "volume",
      })}
    />
  );

  const renderActiveWhalesPopover = (): ReactNode => (
    <WhaleSearch
      onPick={onWhaleClick}
      defaultContent={renderWhaleList({
        title: `Most active whales${drillSuffix}`,
        hint: "by signal count · search 10k+ corpus by name or 0x address",
        sortBy: "signals",
      })}
    />
  );

  // Substitute every authed popover with the single login CTA when
  // the user isn't signed in. `lockedPopoverWidth` keeps the prompt
  // narrow (260px) so it sits closer to the source card on mobile.
  const lockedPopoverWidth = 260;
  const gate = (real: () => ReactNode, w: number): { popover: () => ReactNode; popoverWidth: number } =>
    isAuthed
      ? { popover: real, popoverWidth: w }
      : { popover: renderLockedPopover, popoverWidth: lockedPopoverWidth };

  const items: StatItem[] = [
    {
      label: isPattern ? "Avg Signals / Day" : "Total Signals",
      value: totalSignals.toLocaleString(),
      delta: isPattern ? undefined : { val: sigDelta, dir: sigDelta >= 0 ? "up" : "down" },
      spark: { values: trendSignals, color: TOKENS.link },
      tooltip: "Number of whale trades captured in this window.",
      ...gate(renderSignalsPopover, 320),
    },
    {
      label: isPattern ? "Avg Volume / Day" : "Total Volume",
      value: fmtMoneyShort(totalVolume),
      sub: "BUY entries (USD)",
      spark: { values: trendVolume, color: TOKENS.accent },
      tooltip:
        "USD value of BUY-side trades only — money entering whale positions.",
      ...gate(renderVolumePopover, 320),
    },
    {
      label: isPattern ? "Avg PnL / Day" : "Total PnL",
      value: fmtMoneyShort(totalPnl),
      pnlDir: totalPnl > 0 ? "up" : totalPnl < 0 ? "down" : undefined,
      sub: "realized on exits",
      spark: { values: trendPnl, color: totalPnl >= 0 ? TOKENS.pos : TOKENS.neg },
      tooltip:
        "Realized profit/loss summed across all SELL and SETTLEMENT events in this window.",
      ...gate(renderPnlPopover, 360),
    },
    {
      label: "Win Rate",
      value: totalWinRate === null ? "—" : Math.round(totalWinRate * 100) + "%",
      pnlDir: totalWinRate === null ? undefined : totalWinRate >= 0.5 ? "up" : "down",
      sub: isPattern ? "avg over slots" : "by exits",
      tooltip:
        "Share of exits (SELL or SETTLEMENT) that closed in profit.",
      ...gate(renderWinRatePopover, 320),
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
            sub: "by USD entered",
            tooltip: `${t.topWhale.alias.startsWith("0x") ? "address (no leaderboard alias)" : "Polymarket username"}\n${t.topWhale.addr}`,
            ...gate(renderTopWhalesPopover, 380),
            onClick: isAuthed
              ? () => onWhaleClick(t.topWhale!.addr)
              : onRequestLogin,
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
            "Distinct whales from the corpus that traded at least once in this window.",
          ...gate(renderActiveWhalesPopover, 380),
        },
  ];

  if (isMobile) {
    // Mobile: horizontal-scroll strip of compact cards. Each card has a
    // minimum width so values don't compress to a single line — user pans
    // with thumb instead of trying to fit 6 cells across a 360px viewport.
    // Tap-to-popover keeps the same hover→popover machinery working with
    // the touch onClick path (StatCell already uses onMouseEnter which
    // touch devices fire on tap).
    return (
      <div
        style={{
          borderTop: `1px solid ${TOKENS.border}`,
          background: TOKENS.panel,
          padding: "6px 10px",
          paddingBottom: "max(env(safe-area-inset-bottom, 6px), 6px)",
          display: "flex",
          gap: 10,
          overflowX: "auto",
          overflowY: "visible",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          flexShrink: 0,
        }}
      >
        {items.map((it, i) => (
          <div key={it.label} style={{ flex: "0 0 auto", minWidth: 100 }}>
            <StatCell
              item={it}
              divider={false}
              hovered={hoveredIdx === i}
              onHoverChange={(h) => {
                if (h) setHoveredIdx(i);
                else setHoveredIdx((prev) => (prev === i ? null : prev));
              }}
            />
          </div>
        ))}
      </div>
    );
  }

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

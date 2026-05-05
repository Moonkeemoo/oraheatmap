import { fmtMoney, fmtMoneyShort } from "@/lib/format";
import { TOKENS } from "@/lib/tokens";
import type { HeatmapCell, HeatmapMetric, MarketSummary, WhaleCellSummary } from "@/lib/types";

/**
 * Pure metric/sort/format helpers shared across the tooltip's whale and
 * market sections. Centralised here so the sort priority tweaks (e.g.
 * "biggest earner first" vs "biggest absolute mover first") live in one
 * place — that distinction has bitten us before.
 */

function cmpDesc(a: number | null, b: number | null): number {
  const av = a ?? -Infinity;
  const bv = b ?? -Infinity;
  return bv - av;
}

/** Sort the per-cell whale list to match the active heatmap metric. WIN
 *  RATE: only whales that actually closed trades (winRate non-null) are
 *  eligible; the rest fall to the bottom. */
export function sortWhales(
  whales: ReadonlyArray<WhaleCellSummary>,
  metric: HeatmapMetric,
): WhaleCellSummary[] {
  const copy = whales.slice();
  switch (metric) {
    case "signals":
      copy.sort((a, b) => cmpDesc(a.signals, b.signals));
      break;
    case "volume":
      copy.sort((a, b) => cmpDesc(a.volume, b.volume));
      break;
    case "pnl":
      // "Earned the most" — raw PNL desc, not absolute value. The biggest
      // loser used to top this list because abs(-28k) > abs(+11k); now the
      // best earner sits at the top, losers fall to the bottom.
      copy.sort((a, b) => cmpDesc(a.pnl, b.pnl));
      break;
    case "winrate":
      copy.sort((a, b) => {
        const aHas = a.winRate !== null;
        const bHas = b.winRate !== null;
        if (aHas !== bHas) return aHas ? -1 : 1;
        const c = cmpDesc(a.winRate, b.winRate);
        return c !== 0 ? c : cmpDesc(a.signals, b.signals);
      });
      break;
    case "whales":
      // No per-whale "convergence" — keep volume sort.
      copy.sort((a, b) => cmpDesc(a.volume, b.volume));
      break;
  }
  return copy;
}

export function fmtWhaleMetric(metric: HeatmapMetric, w: WhaleCellSummary): string {
  if (metric === "signals") return String(w.signals);
  if (metric === "volume") return w.volume > 0 ? fmtMoneyShort(w.volume) : "—";
  if (metric === "pnl") return fmtMoney(w.pnl);
  if (metric === "winrate") return w.winRate === null ? "—" : Math.round(w.winRate * 100) + "%";
  return w.volume > 0 ? fmtMoneyShort(w.volume) : "—"; // whales metric → volume proxy
}

export function whaleMetricColor(metric: HeatmapMetric, w: WhaleCellSummary): string {
  if (metric === "pnl") return w.pnl >= 0 ? TOKENS.pos : TOKENS.neg;
  if (metric === "winrate") {
    if (w.winRate === null) return TOKENS.textSec;
    return w.winRate >= 0.5 ? TOKENS.pos : TOKENS.neg;
  }
  return TOKENS.text;
}

export function sortMarkets(
  markets: ReadonlyArray<MarketSummary>,
  metric: HeatmapMetric,
): MarketSummary[] {
  const copy = markets.slice();
  switch (metric) {
    case "signals":
      copy.sort((a, b) => cmpDesc(a.count, b.count));
      break;
    case "volume":
      copy.sort((a, b) => cmpDesc(a.volume, b.volume));
      break;
    case "pnl":
      copy.sort((a, b) => cmpDesc(a.pnl, b.pnl));
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

export function fmtMetric(metric: HeatmapMetric, m: MarketSummary): string {
  if (metric === "signals") return String(m.count);
  if (metric === "volume") return fmtMoneyShort(m.volume);
  if (metric === "pnl") return fmtMoney(m.pnl);
  if (metric === "whales") return String(m.uniqueWhales);
  return m.winRate === null ? "—" : Math.round(m.winRate * 100) + "%";
}

export function metricColor(metric: HeatmapMetric, m: MarketSummary): string {
  if (metric === "pnl") return m.pnl >= 0 ? TOKENS.pos : TOKENS.neg;
  if (metric === "winrate") {
    if (m.winRate === null) return TOKENS.textSec;
    return m.winRate >= 0.5 ? TOKENS.pos : TOKENS.neg;
  }
  return TOKENS.text;
}

/** PATTERN-mode parens beside the main cell value — shows current vs avg. */
export function fmtDeltaInline(
  metric: HeatmapMetric,
  d: HeatmapCell["delta"],
): { text: string; color: string } {
  if (!d) return { text: "—", color: TOKENS.textSec };
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

export function metricMin(metric: HeatmapMetric, cell: HeatmapCell): number {
  if (!cell.min) return 0;
  if (metric === "volume") return cell.min.volume;
  if (metric === "pnl") return cell.min.pnl;
  return cell.min.count;
}

export function metricMax(metric: HeatmapMetric, cell: HeatmapCell): number {
  if (!cell.max) return 0;
  if (metric === "volume") return cell.max.volume;
  if (metric === "pnl") return cell.max.pnl;
  return cell.max.count;
}

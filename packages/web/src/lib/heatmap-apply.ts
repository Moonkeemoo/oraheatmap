import type { Category, HeatmapResponse, SignalEvent } from "./types";

/**
 * Optimistic update — fold a single live SSE signal into the latest fetched
 * heatmap so the UI cell reflects the new value at the same instant the cell
 * flashes. Without this the flash arrives with /api/stream (sub-second) but
 * the number only updates on the next /api/heatmap poll (10s+) → visible
 * desync where the cell pulses but its label doesn't change.
 *
 * On every fresh /api/heatmap response we drop the pending-signals queue and
 * start over from the server's authoritative numbers; this guarantees we
 * can't drift indefinitely.
 *
 * What we update: count, volume (BUY only), pnl, top-trades list, and the
 * matching parts of `totals`. What we deliberately leave alone until the
 * next refetch: winRate (recomputing it incrementally requires per-cell win
 * and loss counts which we don't carry on the wire), uniqueWhales /
 * activeWhales (need DISTINCT, not approx), topCategory / topWhale (need
 * full re-rank). Those go slightly stale between refetches; acceptable.
 */
export function applySignal(d: HeatmapResponse, s: SignalEvent): HeatmapResponse {
  const cat = s.category as Category;
  if (!d.categories.includes(cat)) return d;
  const slotIdx = d.buckets.length - 1; // NOW
  const row = d.cells[cat];
  const oldCell = row[slotIdx];
  if (!oldCell) return d;

  const isBuy = s.side === "BUY";
  const buyVolumeAdd = isBuy ? s.sizeUsd : 0;
  const pnlAdd = s.realizedPnl ?? 0;

  const newCell = {
    ...oldCell,
    count: oldCell.count + 1,
    volume: oldCell.volume + buyVolumeAdd,
    pnl: oldCell.pnl + pnlAdd,
    // Prepend the new trade; cap at 5 so tooltip stays focused. Server's
    // top-3 will replace this on next refetch.
    trades: [
      {
        whaleAddr: s.whaleAddr,
        whaleAlias: s.whaleAlias,
        whaleColor: s.whaleColor,
        side: s.side,
        sizeUsd: s.sizeUsd,
        realizedPnl: s.realizedPnl,
        marketQuestion: s.marketQuestion,
      },
      ...oldCell.trades,
    ].slice(0, 5),
  };

  return {
    ...d,
    cells: {
      ...d.cells,
      [cat]: row.map((c, i) => (i === slotIdx ? newCell : c)),
    },
    totals: {
      ...d.totals,
      signals: d.totals.signals + 1,
      volume: d.totals.volume + buyVolumeAdd,
      pnl: d.totals.pnl + pnlAdd,
    },
  };
}

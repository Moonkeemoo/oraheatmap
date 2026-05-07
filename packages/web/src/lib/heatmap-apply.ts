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
  // subject="whales" → row=whaleAddr (must match one of the top-N
  //                    addresses currently shown). Categories array
  //                    holds the lowercased whale addresses; SSE may
  //                    emit either case so we lowercase to compare.
  // L1 → row=category, L2 → row=subcategory, L3 → row=conditionId.
  let rowKey: string;
  if (d.subject === "whales") {
    const addr = s.whaleAddr?.toLowerCase();
    if (!addr || !d.categories.includes(addr)) return d;
    rowKey = addr;
  } else if (d.drillSubcategory) {
    if (
      s.category !== d.drillCategory ||
      s.subcategory !== d.drillSubcategory ||
      !s.conditionId
    ) return d;
    if (!d.categories.includes(s.conditionId)) return d;
    rowKey = s.conditionId;
  } else if (d.drillCategory) {
    if (s.category !== d.drillCategory || !s.subcategory) return d;
    if (!d.categories.includes(s.subcategory)) return d;
    rowKey = s.subcategory;
  } else {
    const cat = s.category as Category;
    if (!d.categories.includes(cat)) return d;
    rowKey = cat;
  }
  const slotIdx = d.buckets.length - 1; // NOW
  const row = d.cells[rowKey];
  if (!row) return d;
  const oldCell = row[slotIdx];
  if (!oldCell) return d;

  const isBuy = s.side === "BUY";
  const buyVolumeAdd = isBuy ? s.sizeUsd : 0;
  const pnlAdd = s.realizedPnl ?? 0;

  // We don't optimistically merge into cell.markets — that would need
  // re-aggregating into the existing top-N list (find-or-add by condition_id,
  // bump per-market count/volume/pnl, re-sort) which is complex enough to
  // get wrong. Top markets stay accurate via the next /api/heatmap refetch
  // (within REFRESH_MS — 10s for 1h). Cell numbers + flash still update
  // every signal so the visible metric stays in sync.
  const newCell = {
    ...oldCell,
    count: oldCell.count + 1,
    volume: oldCell.volume + buyVolumeAdd,
    pnl: oldCell.pnl + pnlAdd,
  };

  // Heatmap.tsx never calls applySignal in PATTERN mode (totals is null
  // there), but the type allows null so we guard.
  const totals = d.totals
    ? {
        ...d.totals,
        signals: d.totals.signals + 1,
        volume: d.totals.volume + buyVolumeAdd,
        pnl: d.totals.pnl + pnlAdd,
      }
    : d.totals;

  return {
    ...d,
    cells: {
      ...d.cells,
      [rowKey]: row.map((c, i) => (i === slotIdx ? newCell : c)),
    },
    totals,
  };
}

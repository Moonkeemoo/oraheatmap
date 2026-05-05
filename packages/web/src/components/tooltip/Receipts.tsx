"use client";

import { fmtMoneyShort } from "@/lib/format";
import { marketUrl } from "@/lib/polymarket-url";
import { TOKENS } from "@/lib/tokens";
import type { ReceiptsSort } from "@/hooks/useCellReceipts";
import type { SignalEvent } from "@/lib/types";

/**
 * Receipts list — individual signals from a cell, ranked by the active
 * metric. Replaces the aggregate "Top whales" + "Top markets" sections
 * in the tooltip body when the heatmap is in HIGHLIGHTS mode.
 *
 * Shows: time · whale alias · market · USD · realized PnL when applicable.
 * Highlights win/loss colour for PnL sort modes.
 */
export function Receipts({
  signals,
  loading,
  sort,
}: {
  signals: ReadonlyArray<SignalEvent>;
  loading: boolean;
  sort: ReceiptsSort;
}) {
  if (loading && signals.length === 0) {
    return <div style={{ fontSize: 11, color: TOKENS.textMuted }}>Loading…</div>;
  }
  if (signals.length === 0) {
    return (
      <div style={{ fontSize: 11, color: TOKENS.textMuted, lineHeight: 1.5 }}>
        No notable trades found in this cell.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {signals.map((s, i) => (
        <Row key={`${s.txHash ?? s.assetId}-${s.side}-${i}`} entry={s} sort={sort} />
      ))}
    </div>
  );
}

function Row({ entry: e, sort }: { entry: SignalEvent; sort: ReceiptsSort }) {
  const sideColor =
    e.side === "BUY" ? TOKENS.link : e.side === "SELL" ? TOKENS.accent : TOKENS.textMuted;
  const url = marketUrl(e.marketSlug);
  const market = e.marketQuestion ?? "(unknown market)";
  // For PnL-sorted views the signed PnL IS the headline. For volume-sorted
  // the USD amount is the headline. Recency just shows USD as a stable ref.
  const isPnlSort = sort === "pnl" || sort === "abs_pnl";
  const headline = isPnlSort
    ? e.realizedPnl !== null
      ? `${e.realizedPnl >= 0 ? "+" : ""}${fmtMoneyShort(e.realizedPnl)}`
      : "—"
    : fmtMoneyShort(e.sizeUsd);
  const headlineColor = isPnlSort
    ? e.realizedPnl === null
      ? TOKENS.textMuted
      : e.realizedPnl > 0
        ? TOKENS.pos
        : e.realizedPnl < 0
          ? TOKENS.neg
          : TOKENS.textSec
    : TOKENS.text;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "64px 44px 1fr auto",
        alignItems: "baseline",
        columnGap: 8,
        padding: "5px 6px",
        borderBottom: `1px solid ${TOKENS.border}`,
        fontSize: 11,
        borderRadius: 4,
      }}
    >
      <span style={{ color: TOKENS.textMuted, fontFamily: TOKENS.mono, whiteSpace: "nowrap" }}>
        {fmtTime(e.ts)}
      </span>
      <span
        style={{
          color: sideColor,
          fontWeight: 700,
          fontSize: 9,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        {e.side}
      </span>
      <span
        style={{
          color: TOKENS.text,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        <span
          style={{
            color: TOKENS.text,
            fontFamily: e.whaleAlias.startsWith("0x") ? TOKENS.mono : TOKENS.font,
            fontWeight: 600,
          }}
          title={e.whaleAlias}
        >
          {e.whaleAlias.length > 18 ? e.whaleAlias.slice(0, 16) + "…" : e.whaleAlias}
        </span>
        <span style={{ color: TOKENS.textMuted, margin: "0 6px" }}>·</span>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: TOKENS.textSec, textDecoration: "none" }}
            title={market}
          >
            {market}
          </a>
        ) : (
          <span style={{ color: TOKENS.textSec }} title={market}>
            {market}
          </span>
        )}
      </span>
      <span
        style={{
          fontFamily: TOKENS.mono,
          color: headlineColor,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        {headline}
        {!isPnlSort && e.realizedPnl !== null && (
          <span
            style={{
              color: e.realizedPnl > 0 ? TOKENS.pos : e.realizedPnl < 0 ? TOKENS.neg : TOKENS.textSec,
              marginLeft: 6,
              fontSize: 10,
            }}
          >
            {e.realizedPnl >= 0 ? "+" : ""}
            {fmtMoneyShort(e.realizedPnl)}
          </span>
        )}
      </span>
    </div>
  );
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

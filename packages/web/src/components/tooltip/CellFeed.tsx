"use client";

import { fmtMoneyShort } from "@/lib/format";
import { marketUrl } from "@/lib/polymarket-url";
import { TOKENS } from "@/lib/tokens";
import type { FeedEntry } from "@/hooks/useCellFeed";

/**
 * Live feed inside the cell drawer — chronological list of signals
 * matching this cell's scope (category / subcategory / market). Newest
 * at the top. Fresh-arrival rows fade-flash for ~2.5s so the user
 * notices them.
 */
export function CellFeed({
  entries,
  loading,
}: {
  entries: ReadonlyArray<FeedEntry>;
  loading: boolean;
}) {
  if (loading && entries.length === 0) {
    return <div style={{ fontSize: 11, color: TOKENS.textMuted }}>Loading…</div>;
  }
  if (entries.length === 0) {
    return (
      <div style={{ fontSize: 11, color: TOKENS.textMuted, lineHeight: 1.5 }}>
        No activity recorded yet for this scope. Live signals will appear here.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {entries.map((e, i) => (
        <Row key={`${e.txHash ?? e.assetId}-${e.side}-${e.size}-${i}`} entry={e} />
      ))}
      <style>{`
        @keyframes feedFlash {
          0%   { background: rgba(63,185,80,0.18); }
          100% { background: transparent; }
        }
      `}</style>
    </div>
  );
}

function Row({ entry: e }: { entry: FeedEntry }) {
  const sideColor =
    e.side === "BUY" ? TOKENS.link : e.side === "SELL" ? TOKENS.accent : TOKENS.textMuted;
  const pnlColor =
    e.realizedPnl === null
      ? TOKENS.textMuted
      : e.realizedPnl > 0
        ? TOKENS.pos
        : e.realizedPnl < 0
          ? TOKENS.neg
          : TOKENS.textSec;
  const url = marketUrl(e.marketSlug);
  const market = e.marketQuestion ?? "(unknown market)";
  return (
    <div
      style={{
        // Time column has to fit "HH:MM:SS" (8 chars) at 11px mono with
        // breathing room — 44px clipped against the BUY badge. 64px is
        // safe with the 8px columnGap.
        display: "grid",
        gridTemplateColumns: "64px 44px 1fr auto",
        alignItems: "baseline",
        columnGap: 8,
        padding: "5px 6px",
        borderBottom: `1px solid ${TOKENS.border}`,
        fontSize: 11,
        animation: e.isFresh ? "feedFlash 2.5s ease-out" : undefined,
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
          color: TOKENS.textSec,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
          fontSize: 11,
        }}
      >
        {fmtMoneyShort(e.sizeUsd)}
        {e.realizedPnl !== null && (
          <span style={{ color: pnlColor, marginLeft: 6, fontWeight: 700 }}>
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
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

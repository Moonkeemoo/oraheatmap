"use client";

import { fmtMoneyShort } from "@/lib/format";
import { marketUrl } from "@/lib/polymarket-url";
import { TOKENS } from "@/lib/tokens";
import type { HighlightsResponse } from "@/hooks/useRowHighlights";
import { MarketIcon } from "./MarketIcon";

/** Standout-events list for the open cell drawer's row, scoped to the
 *  whole header range. Unit (trade vs market) is driven by the active
 *  metric server-side; this component renders both shapes. */
export function RowHighlights({
  data,
  loading,
}: {
  data: HighlightsResponse | null;
  loading: boolean;
}) {
  if (loading && !data) {
    return <div style={{ fontSize: 11, color: TOKENS.textMuted }}>Loading…</div>;
  }
  if (!data || data.items.length === 0) {
    return (
      <div style={{ fontSize: 11, color: TOKENS.textMuted, lineHeight: 1.5 }}>
        Nothing stands out — values are evenly spread across this window.
      </div>
    );
  }
  if (data.unit === "trade") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {data.items.map((t, i) => (
          <TradeRow key={`${t.txHash ?? t.assetId}-${i}`} trade={t} />
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {data.items.map((m, i) => (
        <MarketRow key={`${m.conditionId}-${i}`} market={m} metric={data.metric} />
      ))}
    </div>
  );
}

function TradeRow({ trade: t }: { trade: import("@/hooks/useRowHighlights").HighlightTrade }) {
  const url = marketUrl(t.marketSlug);
  const market = t.marketQuestion ?? "(unknown market)";
  const pnl = t.realizedPnl;
  const pnlText = pnl !== null ? `${pnl >= 0 ? "+" : ""}${fmtMoneyShort(pnl)}` : "—";
  const pnlColor =
    pnl === null
      ? TOKENS.textMuted
      : pnl > 0
        ? TOKENS.pos
        : pnl < 0
          ? TOKENS.neg
          : TOKENS.textSec;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        alignItems: "baseline",
        columnGap: 8,
        padding: "5px 6px",
        borderBottom: `1px solid ${TOKENS.border}`,
        fontSize: 11,
      }}
    >
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
            fontFamily: t.whaleAlias.startsWith("0x") ? TOKENS.mono : TOKENS.font,
            fontWeight: 600,
          }}
          title={t.whaleAlias}
        >
          {t.whaleAlias.length > 18 ? t.whaleAlias.slice(0, 16) + "…" : t.whaleAlias}
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
      <MultiplierChip multiplier={t.multiplier} />
      <span
        style={{
          fontFamily: TOKENS.mono,
          color: pnlColor,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        {pnlText}
      </span>
    </div>
  );
}

function MarketRow({
  market: m,
  metric,
}: {
  market: import("@/hooks/useRowHighlights").HighlightMarket;
  metric: "volume" | "signals" | "whales";
}) {
  const url = marketUrl(m.marketSlug);
  const label = m.marketQuestion ?? "(unknown market)";
  const value =
    metric === "volume"
      ? fmtMoneyShort(m.value)
      : metric === "signals"
        ? `${Math.round(m.value)} tr`
        : `${Math.round(m.value)} 🐋`;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "22px 1fr auto auto",
        alignItems: "center",
        columnGap: 8,
        padding: "5px 6px",
        borderBottom: `1px solid ${TOKENS.border}`,
        fontSize: 11,
      }}
    >
      <MarketIcon url={m.marketIcon} size={22} />
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: TOKENS.text,
            textDecoration: "none",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            lineHeight: 1.25,
          }}
          title={label}
        >
          {label}
        </a>
      ) : (
        <span
          style={{
            color: TOKENS.text,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            lineHeight: 1.25,
          }}
          title={label}
        >
          {label}
        </span>
      )}
      <MultiplierChip multiplier={m.multiplier} />
      <span
        style={{
          fontFamily: TOKENS.mono,
          color: TOKENS.text,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/** Small chip showing how much the item beats the row baseline. Hidden
 *  for sub-2× to keep the row clean — those squeak past the threshold
 *  but aren't really "standouts". */
function MultiplierChip({ multiplier }: { multiplier: number }) {
  if (!Number.isFinite(multiplier) || multiplier < 2) {
    return <span />;
  }
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 0.3,
        color: TOKENS.accent,
        background: TOKENS.panel2,
        border: `1px solid ${TOKENS.border}`,
        padding: "1px 5px",
        borderRadius: 3,
        fontFamily: TOKENS.mono,
        whiteSpace: "nowrap",
      }}
      title="multiplier vs row average in this window"
    >
      {multiplier.toFixed(1)}×
    </span>
  );
}

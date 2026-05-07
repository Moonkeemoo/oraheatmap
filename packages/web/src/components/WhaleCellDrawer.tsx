"use client";

import { useEffect } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useWhaleCell } from "@/hooks/useWhaleCell";
import type { WhaleCellResponse } from "@/hooks/useWhaleCell";
import { fmtMoneyShort } from "@/lib/format";
import { marketUrl } from "@/lib/polymarket-url";
import { TOKENS } from "@/lib/tokens";
import type { PatternKind } from "@/lib/types";
import { DrawerLoading } from "./DrawerLoading";
import { MarketIcon } from "./tooltip/MarketIcon";

/**
 * Per-whale × per-cell drawer. Opens on cell tap in whales subject
 * to surface what THIS WHALE specifically did inside THAT bucket.
 * Different from the WhaleDrawer (full whale profile across the
 * whole 90d window) — this one is scoped to one cell only.
 *
 * Mode-dependent content:
 *   LIVE / MACRO → trade list (chronological), markets touched
 *   PATTERN      → cycle histogram, hit rate, recurring markets
 * Summary headline (trades / volume / pnl / direction) is shared.
 */

type Scope = {
  addr: string;
  alias: string;
  // LIVE / MACRO
  fromTs?: string | null;
  toTs?: string | null;
  // PATTERN
  kind?: PatternKind | null;
  slot?: number | null;
  /** Display label in the drawer header (e.g. "16:35", "Tue 14:00", "Mon"). */
  slotLabel: string;
};

export function WhaleCellDrawer({
  scope,
  onClose,
}: {
  scope: Scope | null;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const open = scope !== null;
  const { data, loading, error } = useWhaleCell({
    scope: open
      ? {
          addr: scope.addr,
          fromTs: scope.fromTs ?? null,
          toTs: scope.toTs ?? null,
          kind: scope.kind ?? null,
          slot: scope.slot ?? null,
        }
      : null,
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          zIndex: 50,
          animation: "tipIn .18s ease-out",
        }}
      />
      <aside
        onClick={(e) => e.stopPropagation()}
        style={
          isMobile
            ? {
                position: "fixed",
                left: 0,
                right: 0,
                bottom: 0,
                width: "100vw",
                maxHeight: "85vh",
                background: TOKENS.panel,
                borderTop: `1px solid ${TOKENS.borderHi}`,
                borderTopLeftRadius: 14,
                borderTopRightRadius: 14,
                boxShadow: "0 -20px 60px rgba(0,0,0,0.6)",
                zIndex: 51,
                display: "flex",
                flexDirection: "column",
                fontFamily: TOKENS.font,
                color: TOKENS.text,
                animation: "drawerInBottom .22s ease-out",
                overflowY: "auto",
              }
            : {
                position: "fixed",
                top: 0,
                right: 0,
                width: "min(440px, 92vw)",
                height: "100vh",
                background: TOKENS.panel,
                borderLeft: `1px solid ${TOKENS.borderHi}`,
                boxShadow: "-20px 0 60px rgba(0,0,0,0.6)",
                zIndex: 51,
                display: "flex",
                flexDirection: "column",
                fontFamily: TOKENS.font,
                color: TOKENS.text,
                animation: "drawerIn .18s ease-out",
                overflowY: "auto",
              }
        }
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${TOKENS.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "sticky",
            top: 0,
            background: TOKENS.panel,
            zIndex: 1,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
            <span
              style={{
                fontSize: 9,
                letterSpacing: 0.6,
                color: TOKENS.textMuted,
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              {scope.kind ? `Pattern · ${scope.slotLabel}` : `Bucket · ${scope.slotLabel}`}
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: TOKENS.text,
                fontFamily: scope.alias.startsWith("0x") ? TOKENS.mono : TOKENS.font,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {scope.alias}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: `1px solid ${TOKENS.border}`,
              color: TOKENS.textSec,
              fontSize: 14,
              fontWeight: 700,
              padding: "4px 10px",
              borderRadius: 6,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: "12px 16px 24px", flex: 1 }}>
          {loading && !data && <DrawerLoading variant="block" />}
          {error && (
            <div style={{ fontSize: 11, color: TOKENS.neg, padding: "8px 0" }}>
              {error}
            </div>
          )}
          {data && <Body data={data} isPattern={Boolean(scope.kind)} />}
        </div>
      </aside>
      <style>{`
        @keyframes drawerIn {
          0% { transform: translateX(20px); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes drawerInBottom {
          0% { transform: translateY(40px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}

function Body({
  data,
  isPattern,
}: {
  data: WhaleCellResponse;
  isPattern: boolean;
}) {
  const { summary, trades, cycles, expectedCycles, markets } = data;
  const directionalVol = summary.buyVolume + summary.sellVolume;
  const buyShare = directionalVol > 0 ? summary.buyVolume / directionalVol : 0;
  const hitCount = cycles.filter((c) => c.count > 0).length;
  const hitPct =
    expectedCycles > 0 ? Math.round((hitCount / expectedCycles) * 100) : 0;

  return (
    <>
      {/* ── Summary 4-stat strip ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <Stat label="Trades" value={summary.trades.toString()} />
        <Stat label="Volume" value={fmtMoneyShort(summary.volume)} />
        <Stat
          label="PnL"
          value={
            summary.pnl > 0
              ? `+${fmtMoneyShort(summary.pnl)}`
              : summary.pnl < 0
                ? `-${fmtMoneyShort(Math.abs(summary.pnl))}`
                : "$0"
          }
          color={
            summary.pnl > 0 ? TOKENS.pos : summary.pnl < 0 ? TOKENS.neg : TOKENS.text
          }
        />
        <Stat
          label="Direction"
          value={`${Math.round(buyShare * 100)}% BUY`}
          color={buyShare >= 0.7 ? TOKENS.pos : buyShare <= 0.3 ? TOKENS.neg : TOKENS.text}
        />
      </div>

      {/* ── PATTERN: hit rate + cycle histogram ── */}
      {isPattern && (
        <Section
          title="Past cycles"
          rightHint={
            expectedCycles > 0
              ? `${hitCount}/${expectedCycles} (${hitPct}%)`
              : ""
          }
        >
          {cycles.length === 0 ? (
            <Empty>No history for this slot.</Empty>
          ) : (
            <CycleBars cycles={cycles} />
          )}
        </Section>
      )}

      {/* ── LIVE / MACRO: chronological trades ── */}
      {!isPattern && (
        <Section title="Trades in this bucket" rightHint={`${trades.length}`}>
          {trades.length === 0 ? (
            <Empty>No signals captured for this whale in this bucket.</Empty>
          ) : (
            <TradesList trades={trades} />
          )}
        </Section>
      )}

      {/* ── Markets touched (always) ── */}
      <Section
        title="Markets touched"
        rightHint={isPattern ? "across cycles" : "in bucket"}
      >
        {markets.length === 0 ? (
          <Empty>No markets recorded.</Empty>
        ) : (
          <MarketsList markets={markets} />
        )}
      </Section>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        borderRadius: 6,
        padding: "8px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
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
        {label}
      </span>
      <span
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: color ?? TOKENS.text,
          fontFamily: TOKENS.mono,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Section({
  title,
  rightHint,
  children,
}: {
  title: string;
  rightHint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ borderTop: `1px solid ${TOKENS.border}`, paddingTop: 8, marginBottom: 12 }}>
      <div
        style={{
          fontSize: 9,
          letterSpacing: 0.5,
          color: TOKENS.textMuted,
          textTransform: "uppercase",
          marginBottom: 6,
          fontWeight: 600,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>{title}</span>
        {rightHint && (
          <span style={{ color: TOKENS.textSec, fontFamily: TOKENS.mono }}>
            {rightHint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: TOKENS.textMuted,
        padding: "6px 0",
        lineHeight: 1.4,
      }}
    >
      {children}
    </div>
  );
}

function CycleBars({
  cycles,
}: {
  cycles: ReadonlyArray<{ cycle: string; count: number; volume: number; pnl: number }>;
}) {
  const max = Math.max(...cycles.map((c) => c.count), 1);
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        alignItems: "flex-end",
        height: 60,
        padding: "4px 0",
      }}
    >
      {cycles.map((c, i) => {
        const h = Math.max(2, (c.count / max) * 56);
        const color =
          c.pnl > 0 ? TOKENS.pos : c.pnl < 0 ? TOKENS.neg : TOKENS.link;
        return (
          <div
            key={i}
            title={`${new Date(c.cycle).toISOString().slice(0, 10)} · ${c.count} trades · ${fmtMoneyShort(c.volume)}`}
            style={{
              flex: 1,
              minWidth: 2,
              height: h,
              borderRadius: 1,
              background: color,
              opacity: c.count === 0 ? 0.15 : 0.7,
            }}
          />
        );
      })}
    </div>
  );
}

function TradesList({
  trades,
}: {
  trades: ReadonlyArray<{
    ts: string;
    side: "BUY" | "SELL" | "SETTLEMENT";
    marketQuestion: string | null;
    marketSlug: string | null;
    sizeUsd: number;
    realizedPnl: number | null;
  }>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {trades.map((t, i) => {
        const time = new Date(t.ts);
        const hh = String(time.getHours()).padStart(2, "0");
        const mm = String(time.getMinutes()).padStart(2, "0");
        const sideColor =
          t.side === "BUY"
            ? TOKENS.pos
            : t.side === "SELL"
              ? TOKENS.accent
              : TOKENS.textSec;
        const url = marketUrl(t.marketSlug);
        const label = t.marketQuestion ?? "(unknown market)";
        return (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "44px 50px 1fr auto",
              alignItems: "center",
              gap: 8,
              fontSize: 11,
              padding: "4px 0",
              borderBottom: `1px dashed ${TOKENS.border}`,
            }}
          >
            <span style={{ color: TOKENS.textMuted, fontFamily: TOKENS.mono }}>
              {hh}:{mm}
            </span>
            <span
              style={{
                color: sideColor,
                fontWeight: 700,
                fontSize: 10,
                letterSpacing: 0.5,
              }}
            >
              {t.side}
            </span>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: TOKENS.text,
                  textDecoration: "none",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={label}
              >
                {label}
              </a>
            ) : (
              <span
                style={{
                  color: TOKENS.text,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </span>
            )}
            <span
              style={{
                fontFamily: TOKENS.mono,
                fontWeight: 600,
                color:
                  t.realizedPnl !== null
                    ? t.realizedPnl > 0
                      ? TOKENS.pos
                      : t.realizedPnl < 0
                        ? TOKENS.neg
                        : TOKENS.text
                    : TOKENS.text,
              }}
            >
              {t.realizedPnl !== null
                ? `${t.realizedPnl > 0 ? "+" : ""}${fmtMoneyShort(t.realizedPnl)}`
                : `$${fmtMoneyShort(t.sizeUsd)}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MarketsList({
  markets,
}: {
  markets: ReadonlyArray<{
    conditionId: string;
    marketQuestion: string | null;
    marketSlug: string | null;
    marketIcon: string | null;
    signals: number;
    volume: number;
    pnl: number;
  }>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {markets.map((m, i) => {
        const url = marketUrl(m.marketSlug);
        const label = m.marketQuestion ?? "(unknown market)";
        return (
          <div
            key={m.conditionId}
            style={{
              display: "grid",
              gridTemplateColumns: "16px 22px 1fr auto",
              alignItems: "center",
              gap: 8,
              fontSize: 11,
              padding: "4px 0",
            }}
          >
            <span
              style={{
                color: TOKENS.textMuted,
                fontFamily: TOKENS.mono,
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              {i + 1}.
            </span>
            <MarketIcon url={m.marketIcon} size={22} />
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: TOKENS.text,
                  textDecoration: "none",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={label}
              >
                {label}
              </a>
            ) : (
              <span
                style={{
                  color: TOKENS.text,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={label}
              >
                {label}
              </span>
            )}
            <span
              style={{
                fontFamily: TOKENS.mono,
                fontWeight: 700,
                color: TOKENS.text,
              }}
            >
              {fmtMoneyShort(m.volume)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

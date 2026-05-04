"use client";

import { useEffect, useMemo } from "react";
import { useWhaleProfile } from "@/hooks/useWhaleProfile";
import { categoryMeta } from "@/lib/categories";
import { fmtMoney, fmtMoneyShort } from "@/lib/format";
import { TOKENS } from "@/lib/tokens";
import type { Category, LiveRange, WhaleProfile } from "@/lib/types";
import { WhaleAvatar } from "./WhaleAvatar";

const POLY_REFERRAL =
  (typeof process !== "undefined" && process.env["NEXT_PUBLIC_POLYMARKET_REFERRAL"]) || "Moonkeee";

function marketUrl(slug: string | null): string | null {
  if (!slug) return null;
  return `https://polymarket.com/event/${encodeURIComponent(slug)}?r=${encodeURIComponent(POLY_REFERRAL)}`;
}

function rangeLabel(r: LiveRange): string {
  switch (r) {
    case "1h":  return "last 60 min";
    case "24h": return "last 24 hours";
    case "12d": return "last 12 days";
    case "12w": return "last 12 weeks";
  }
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function fmtTimeAgo(iso: string): string {
  const ageMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ageMs / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export function WhaleDrawer({
  addr,
  range,
  onClose,
}: {
  addr: string | null;
  range: LiveRange;
  onClose: () => void;
}) {
  const { data, loading, error } = useWhaleProfile({ addr, range });
  const open = addr !== null;

  // ESC key closes the drawer.
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
      {/* Click-outside overlay — full viewport, dim, closes on click. */}
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
        // Stop click propagation so clicks INSIDE the drawer don't close it.
        onClick={(e) => e.stopPropagation()}
        style={{
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
        }}
      >
        {data && <DrawerBody data={data} range={range} onClose={onClose} />}
        {!data && loading && (
          <div style={{ padding: 20, color: TOKENS.textSec, fontSize: 13 }}>loading…</div>
        )}
        {!data && error && (
          <div style={{ padding: 20, color: TOKENS.neg, fontSize: 13 }}>error: {error}</div>
        )}
      </aside>
      {/* Slide-in keyframe — defined here so we don't have to touch globals.css. */}
      <style>{`
        @keyframes drawerIn {
          0% { transform: translateX(20px); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}

function DrawerBody({
  data,
  range,
  onClose,
}: {
  data: WhaleProfile;
  range: LiveRange;
  onClose: () => void;
}) {
  // Total volume across the mix is the denominator for percentages.
  const totalMixVolume = useMemo(
    () => data.categoryMix.reduce((a, c) => a + c.volume, 0),
    [data.categoryMix],
  );

  return (
    <>
      {/* Header */}
      <div style={{ padding: "16px 18px 12px", borderBottom: `1px solid ${TOKENS.border}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ marginTop: 2 }}>
            <WhaleAvatar
              profileImage={data.profileImage}
              color={data.color}
              size={42}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 6,
                fontSize: 18,
                fontWeight: 700,
                color: TOKENS.text,
                fontFamily: data.alias.startsWith("0x") ? TOKENS.mono : TOKENS.font,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {data.alias}
              {data.verified && (
                <span title="Verified on Polymarket" style={{ fontSize: 13, color: TOKENS.accent }}>
                  ✓
                </span>
              )}
            </div>
            <CopyableAddress addr={data.addr} />
            {data.xHandle && (
              <a
                href={`https://x.com/${data.xHandle.replace(/^@/, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block",
                  marginTop: 4,
                  fontSize: 11,
                  fontFamily: TOKENS.mono,
                  color: TOKENS.link,
                  textDecoration: "none",
                }}
              >
                @{data.xHandle.replace(/^@/, "")}
              </a>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close whale profile"
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
      </div>

      {/* Stats */}
      <Section title={`In ${rangeLabel(range)}`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <Stat label="Signals" value={data.stats.signals.toLocaleString()} />
          <Stat label="Volume" value={fmtMoneyShort(data.stats.volume)} />
          <Stat
            label="PnL"
            value={fmtMoneyShort(data.stats.pnl)}
            color={data.stats.pnl > 0 ? TOKENS.pos : data.stats.pnl < 0 ? TOKENS.neg : TOKENS.text}
          />
          <Stat
            label="Win"
            value={data.stats.winRate === null ? "—" : Math.round(data.stats.winRate * 100) + "%"}
            color={
              data.stats.winRate === null
                ? TOKENS.textSec
                : data.stats.winRate >= 0.5
                  ? TOKENS.pos
                  : TOKENS.neg
            }
          />
        </div>
      </Section>

      {/* Category mix */}
      <Section title="Category mix · by volume">
        {data.categoryMix.length === 0 ? (
          <div style={{ fontSize: 11, color: TOKENS.textSec }}>no activity</div>
        ) : (
          data.categoryMix.map((c) => {
            const pct = totalMixVolume > 0 ? c.volume / totalMixVolume : 0;
            const meta = categoryMeta(c.category as Category);
            return (
              <div key={c.category} style={{ marginBottom: 6 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11,
                    marginBottom: 3,
                    color: TOKENS.textSec,
                  }}
                >
                  <span style={{ color: TOKENS.text, fontWeight: 600 }}>{meta.label}</span>
                  <span style={{ fontFamily: TOKENS.mono }}>
                    {Math.round(pct * 100)}% · {fmtMoneyShort(c.volume)}
                  </span>
                </div>
                <div style={{ height: 4, background: TOKENS.border, borderRadius: 4, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${pct * 100}%`,
                      height: "100%",
                      background: meta.color,
                      transition: "width .18s",
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </Section>

      {/* Scrollable lists */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 12 }}>
        <Section title={`Open positions · top ${data.openPositions.length}`}>
          {data.openPositions.length === 0 ? (
            <div style={{ fontSize: 11, color: TOKENS.textSec }}>no open positions</div>
          ) : (
            data.openPositions.map((p) => {
              const url = marketUrl(p.marketSlug);
              const value = p.netShares * p.avgEntry;
              return (
                <div
                  key={p.assetId}
                  style={{
                    marginBottom: 8,
                    paddingBottom: 8,
                    borderBottom: `1px dashed ${TOKENS.border}`,
                    fontSize: 12,
                    lineHeight: 1.35,
                  }}
                >
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: TOKENS.link, textDecoration: "none" }}
                    >
                      {p.marketQuestion ?? "(unknown market)"}
                    </a>
                  ) : (
                    <span style={{ color: TOKENS.text }}>
                      {p.marketQuestion ?? "(unknown market)"}
                    </span>
                  )}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      color: TOKENS.textMuted,
                      fontFamily: TOKENS.mono,
                      fontSize: 11,
                      marginTop: 2,
                    }}
                  >
                    <span>
                      {p.netShares.toLocaleString(undefined, { maximumFractionDigits: 1 })} sh @ ${p.avgEntry.toFixed(3)}
                    </span>
                    <span style={{ color: TOKENS.textSec }}>
                      ≈ {fmtMoney(value)} · {fmtTimeAgo(p.openedAt)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </Section>

        <Section title={`Recent trades · last ${data.recentTrades.length}`}>
          {data.recentTrades.length === 0 ? (
            <div style={{ fontSize: 11, color: TOKENS.textSec }}>no trades in window</div>
          ) : (
            data.recentTrades.map((t, i) => {
              const url = marketUrl(t.marketSlug);
              const sideColor =
                t.side === "BUY" ? TOKENS.link : t.side === "SELL" ? TOKENS.accent : TOKENS.textMuted;
              const pnlColor =
                t.realizedPnl === null
                  ? TOKENS.textMuted
                  : t.realizedPnl > 0
                    ? TOKENS.pos
                    : t.realizedPnl < 0
                      ? TOKENS.neg
                      : TOKENS.textSec;
              return (
                <div
                  key={`${t.ts}-${i}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "44px 56px 1fr auto",
                    alignItems: "baseline",
                    gap: 6,
                    fontSize: 11,
                    padding: "4px 0",
                    borderBottom: `1px solid ${TOKENS.border}`,
                  }}
                >
                  <span style={{ color: TOKENS.textMuted, fontFamily: TOKENS.mono }}>
                    {fmtTime(t.ts)}
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
                    {t.side}
                  </span>
                  <span
                    style={{
                      color: TOKENS.text,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={t.marketQuestion ?? ""}
                  >
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: TOKENS.text, textDecoration: "none" }}>
                        {t.marketQuestion ?? "—"}
                      </a>
                    ) : (
                      t.marketQuestion ?? "—"
                    )}
                  </span>
                  <span
                    style={{
                      fontFamily: TOKENS.mono,
                      color: TOKENS.textSec,
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.size.toLocaleString(undefined, { maximumFractionDigits: 1 })}@${t.price.toFixed(3)}
                    {t.realizedPnl !== null && (
                      <span style={{ color: pnlColor, marginLeft: 6, fontWeight: 700 }}>
                        {t.realizedPnl >= 0 ? "+" : ""}{fmtMoneyShort(t.realizedPnl)}
                      </span>
                    )}
                  </span>
                </div>
              );
            })
          )}
        </Section>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "12px 18px", borderBottom: `1px solid ${TOKENS.border}` }}>
      <div
        style={{
          fontSize: 9,
          letterSpacing: 0.5,
          color: TOKENS.textMuted,
          textTransform: "uppercase",
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          color: TOKENS.textMuted,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          fontWeight: 600,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          color: color ?? TOKENS.text,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function CopyableAddress({ addr }: { addr: string }) {
  const short = `${addr.slice(0, 6)}…${addr.slice(-6)}`;
  return (
    <button
      onClick={() => {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          void navigator.clipboard.writeText(addr);
        }
      }}
      title="Copy full address"
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        marginTop: 2,
        color: TOKENS.textSec,
        fontFamily: TOKENS.mono,
        fontSize: 11,
        cursor: "pointer",
      }}
    >
      {short} 📋
    </button>
  );
}

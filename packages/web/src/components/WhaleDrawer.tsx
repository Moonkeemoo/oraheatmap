"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { useWhaleProfile } from "@/hooks/useWhaleProfile";
import { useWatchlist } from "@/hooks/useWatchlist";
import { categoryMeta } from "@/lib/categories";
import { fmtMoney, fmtMoneyShort } from "@/lib/format";
import { marketUrl } from "@/lib/polymarket-url";
import { TOKENS } from "@/lib/tokens";
import type { Category, LiveRange, WhaleProfile } from "@/lib/types";
import { BalanceChart } from "./BalanceChart";
import { Drawer } from "./Drawer";
import { DrawerLoading } from "./DrawerLoading";
import { WhaleAvatar } from "./WhaleAvatar";

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
  onBack,
}: {
  addr: string | null;
  range: LiveRange;
  onClose: () => void;
  /** Optional — when set, a ← button appears in the top-left corner.
   *  Used when the drawer was opened by drilling out of a cell panel:
   *  ← restores the cell panel instead of closing everything. */
  onBack?: () => void;
}) {
  const { data, loading, error } = useWhaleProfile({ addr, range });
  const open = addr !== null;

  return (
    <Drawer open={open} onClose={onClose}>
      {data && <DrawerBody data={data} range={range} onClose={onClose} onBack={onBack} />}
      {!data && loading && (
        <div style={{ padding: 20 }}>
          <DrawerLoading variant="block" />
        </div>
      )}
      {!data && error && (
        <div style={{ padding: 20, color: TOKENS.neg, fontSize: 13 }}>error: {error}</div>
      )}
    </Drawer>
  );
}

function DrawerBody({
  data,
  range,
  onClose,
  onBack,
}: {
  data: WhaleProfile;
  range: LiveRange;
  onClose: () => void;
  onBack?: () => void;
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
          {/* Back button — appears only when the drawer was opened by
              drilling out of a cell panel. Restores the cell panel rather
              than dropping the user back to a bare grid. */}
          {onBack && (
            <button
              onClick={onBack}
              aria-label="Back to cell panel"
              title="Back to cell panel"
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
                marginTop: 2,
              }}
            >
              ←
            </button>
          )}
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
                alignItems: "center",
                gap: 6,
                minWidth: 0,
              }}
            >
              {/* Alias span owns the truncation — flex:1 + min-width:0
                  lets the text ellipsis while the LVL badge keeps its
                  natural width (flex-shrink: 0 inside the badge). On
                  narrow mobile drawer widths long aliases were
                  clipping the badge entirely; this layout keeps the
                  badge visible regardless. */}
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
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
                  <span
                    title="Verified on Polymarket"
                    style={{ fontSize: 13, color: TOKENS.accent, marginLeft: 4 }}
                  >
                    ✓
                  </span>
                )}
              </span>
              <ReputationBadge reputation={data.reputation} />
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
          {/* Pin / unpin to watchlist. Anon users get the disabled
              state with a "sign in to pin" tooltip — hides the action
              from the empty-state-on-WATCHLIST flow. Authed: filled
              accent when pinned, hairline outline when not, instant
              optimistic toggle via useWatchlist. */}
          <PinButton addr={data.addr} />
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
          {/* Signals = BUY + SELL + SETTLEMENT count. Volume above
              wasn't matching it intuitively because Volume counts
              ONLY BUY-side USD entered; SETTLEMENT events (open
              positions auto-resolving) bloat the signals count
              without adding to entries. Clarified the labels:
              "Trades" reads better than the internal "Signals"
              term for the headline strip, and "Entries" + the
              "BUY" sub mirrors the StatsBar convention so users
              don't read "Volume" as gross trading activity. */}
          <Stat label="Trades" value={data.stats.signals.toLocaleString()} sub="incl. settlements" />
          <Stat label="Entries" value={fmtMoneyShort(data.stats.volume)} sub="BUY (USD)" />
          <Stat
            label="PnL"
            value={fmtMoneyShort(data.stats.pnl)}
            sub="realized"
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

      {/* Balance growth — last 90 days of cumulative realized PnL. Independent
          of the active heatmap range; gives a longer arc than the stats above. */}
      <Section title="Balance growth · last 90 days">
        <BalanceChart points={data.pnlHistory} />
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

function Stat({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
}) {
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
      {sub && (
        <div
          style={{
            fontSize: 9,
            color: TOKENS.textMuted,
            fontFamily: TOKENS.mono,
            letterSpacing: 0.2,
            marginTop: 2,
          }}
        >
          {sub}
        </div>
      )}
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

/**
 * Profile-level badge — one prominent number in the drawer header
 * derived from the 90-day reputation score the API computes. Reads
 * as "trader trust" at a glance, similar to how a game shows a
 * character level. Tier colour shifts at 70 / 50 / 30:
 *
 *   ≥70  green  — strong recent form (high PnL + decent winRate +
 *                 enough trades to back the avg)
 *   50-69 yellow — typical trader, no strong signal either way
 *   30-49 muted  — underwater or not enough sample
 *   <30   red    — losing money on the 90d window
 *
 * Hover tooltip surfaces the inputs (PnL, trades, win rate) so the
 * user can sanity-check the score without leaving the drawer.
 */
/** Watchlist toggle button shown in the WhaleDrawer header. Anon
 *  users see a locked variant with no click effect (label-only); the
 *  WhaleSetToggle's WATCHLIST tab handles the "sign in to pin"
 *  funnel, so we don't need to open the login modal from here.
 *
 *  Pinned state: filled accent, "★ Pinned".
 *  Unpinned + authed: hairline outline, "☆ Pin".
 *  Anon: disabled, faint outline, "☆ Pin" with tooltip.
 */
function PinButton({ addr }: { addr: string }) {
  const { status } = useSession();
  const isAuthed = status === "authenticated";
  const watchlist = useWatchlist();
  const pinned = watchlist.has(addr);
  const onClick = (): void => {
    if (!isAuthed) return;
    void watchlist.toggle(addr);
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title={
        !isAuthed
          ? "Sign in to pin whales to your watchlist"
          : pinned
            ? "Remove from watchlist"
            : "Pin to watchlist"
      }
      style={{
        background: pinned ? TOKENS.accent : "transparent",
        border: `1px solid ${pinned ? TOKENS.accent : TOKENS.border}`,
        color: pinned ? "#1a1410" : isAuthed ? TOKENS.text : TOKENS.textMuted,
        fontFamily: TOKENS.font,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        padding: "5px 10px",
        borderRadius: 6,
        cursor: isAuthed ? "pointer" : "help",
        lineHeight: 1,
        opacity: !isAuthed ? 0.6 : 1,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        transition: "background-color .12s, border-color .12s, color .12s",
      }}
    >
      <span style={{ fontSize: 12 }}>{pinned ? "★" : "☆"}</span>
      <span>{pinned ? "Pinned" : "Pin"}</span>
    </button>
  );
}

function ReputationBadge({
  reputation,
}: {
  reputation: WhaleProfile["reputation"];
}) {
  const { score } = reputation;
  const tier = score >= 70 ? "high" : score >= 50 ? "mid" : score >= 30 ? "low" : "neg";
  const palette = {
    high: { bg: "rgba(63,185,80,0.16)", border: "rgba(63,185,80,0.45)", color: TOKENS.pos },
    mid:  { bg: "rgba(240,180,41,0.14)", border: "rgba(240,180,41,0.45)", color: TOKENS.accent },
    low:  { bg: "rgba(125,133,144,0.12)", border: TOKENS.borderHi, color: TOKENS.textSec },
    neg:  { bg: "rgba(248,81,73,0.14)", border: "rgba(248,81,73,0.45)", color: TOKENS.neg },
  }[tier];
  const pnlLabel =
    reputation.realizedPnl90d >= 0
      ? `+${fmtMoneyShort(reputation.realizedPnl90d)}`
      : `−${fmtMoneyShort(Math.abs(reputation.realizedPnl90d))}`;
  const winLabel =
    reputation.winRate90d === null
      ? "no exits"
      : `${Math.round(reputation.winRate90d * 100)}% wins`;
  const title = `Reputation ${score}/100 · 90d window\n${reputation.trades90d} trades · ${pnlLabel} · ${winLabel}`;
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 999,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.color,
        fontFamily: TOKENS.mono,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.3,
        lineHeight: 1.3,
        verticalAlign: "middle",
        // Always visible regardless of how long the alias is — the
        // alias sibling holds the ellipsis, badge stays put.
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 9, opacity: 0.7, letterSpacing: 0.6 }}>LVL</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{score}</span>
    </span>
  );
}

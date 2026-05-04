"use client";

import { useEffect, useState } from "react";
import { fmtMoneyShort } from "@/lib/format";
import { TOKENS } from "@/lib/tokens";
import type { Plaque } from "@/hooks/useLiveActivity";

/**
 * Unified left-side highlight plaque for `/app`. Mounts only in LIVE mode.
 * Visual contract:
 *   - Sits in the gutter to the left of the now-column cell of the
 *     plaque's category, vertically aligned to the row.
 *   - Height never exceeds the row height.
 *   - Connector line points right at the cell.
 *   - Body shows: amount (PnL or volume USD), alias, market question.
 *   - Colour: green/red for PnL kind (sign), accent yellow for volume kind.
 *
 * Convergence badges share the same gutter, sitting flush against the
 * row's left edge but shorter — they read as "passive" markers vs the
 * "active" plaque.
 */

const POLY_REFERRAL =
  (typeof process !== "undefined" && process.env["NEXT_PUBLIC_POLYMARKET_REFERRAL"]) || "Moonkeee";

function marketUrl(slug: string | null): string | null {
  if (!slug) return null;
  return `https://polymarket.com/event/${encodeURIComponent(slug)}?r=${encodeURIComponent(POLY_REFERRAL)}`;
}

type ConvergenceProps = { category: string; count: number };

export function LiveActivityOverlay({
  plaque,
  convergences,
}: {
  plaque: Plaque | null;
  convergences: ReadonlyArray<ConvergenceProps>;
}) {
  return (
    <>
      {plaque && <PlaqueView key={plaque.id} plaque={plaque} />}
      {convergences.map((c) => (
        <ConvergenceBadge key={c.category} {...c} />
      ))}
    </>
  );
}

function useCellRect(category: string): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    let raf = 0;
    function read() {
      const el = document.querySelector(
        `[data-cell-category="${cssEscape(category)}"][data-live-now="true"]`,
      ) as HTMLElement | null;
      setRect(el?.getBoundingClientRect() ?? null);
    }
    read();
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(read);
    };
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("scroll", onResize, { passive: true });
    // Periodic re-read so we follow the now-column cell as time advances
    // (LIVE mode rotates buckets every ~5s).
    const interval = setInterval(read, 1500);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize);
      cancelAnimationFrame(raf);
      clearInterval(interval);
    };
  }, [category]);
  return rect;
}

function cssEscape(s: string): string {
  return s.replace(/["\\]/g, "\\$&");
}

function getGridLeft(): number {
  const wrap = document.querySelector("[data-hm-grid-wrap]") as HTMLElement | null;
  return wrap?.getBoundingClientRect().left ?? 16;
}

function PlaqueView({ plaque }: { plaque: Plaque }) {
  const rect = useCellRect(plaque.category);
  if (!rect) return null;

  const gridLeft = getGridLeft();
  const cellMidY = rect.top + rect.height / 2;
  // Plaque is constrained to row height — at most rect.height, generally smaller
  // so the connector line has room. Cap on small viewports.
  const maxH = Math.max(36, Math.min(rect.height, 64));
  const connectorWidth = Math.max(8, rect.left - (gridLeft - 8) - 6);

  // Colour scheme by plaque kind. PnL: green for win, red for loss.
  // Volume: yellow accent.
  const isPnl = plaque.kind === "pnl";
  const isLoss = isPnl && (plaque.pnlUsd ?? 0) < 0;
  const accent = isPnl
    ? isLoss ? TOKENS.neg : TOKENS.pos
    : TOKENS.accent;
  const amountText = isPnl
    ? `${(plaque.pnlUsd ?? 0) >= 0 ? "+" : ""}${fmtMoneyShort(plaque.pnlUsd ?? 0)}`
    : `${plaque.side === "BUY" ? "+" : "-"}${fmtMoneyShort(plaque.sizeUsd)}`;
  // "BIG" only on $10k+ — at smaller sizes it reads as inflated copy even
  // when the trade IS top-1% in scope. "WHALE BUY/SELL" is neutral and
  // honest for $300–$10k volume tags.
  const isBig = !isPnl && plaque.sizeUsd >= 10_000;
  const labelText = isPnl
    ? isLoss ? "REALISED LOSS" : "REALISED WIN"
    : plaque.side === "BUY"
      ? isBig ? "BIG BUY" : "WHALE BUY"
      : isBig ? "BIG SELL" : "WHALE SELL";

  const url = marketUrl(plaque.marketSlug);
  const market = plaque.marketQuestion ?? "(unknown market)";

  return (
    <div
      style={{
        position: "fixed",
        left: gridLeft - 8,
        top: cellMidY,
        transform: "translate(-100%, -50%)",
        display: "flex",
        alignItems: "center",
        pointerEvents: "auto",
        zIndex: 60,
        animation: "plaqueIn .25s ease-out",
        fontFamily: TOKENS.font,
      }}
    >
      <div
        style={{
          background: TOKENS.panel,
          border: `1px solid ${accent}`,
          borderLeft: `3px solid ${accent}`,
          borderRadius: 6,
          padding: "5px 9px",
          maxHeight: maxH,
          maxWidth: 240,
          minWidth: 180,
          boxShadow: "0 10px 28px rgba(0,0,0,0.55)",
          display: "flex",
          flexDirection: "column",
          gap: 1,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 9,
            fontFamily: TOKENS.mono,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            fontWeight: 700,
            color: accent,
            lineHeight: 1.1,
          }}
        >
          <span>{labelText}</span>
          <span style={{ color: TOKENS.textMuted }}>· {plaque.category}</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 6,
            fontFamily: TOKENS.mono,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1.1,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, color: accent }}>{amountText}</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: TOKENS.textSec,
              fontFamily: plaque.alias.startsWith("0x") ? TOKENS.mono : TOKENS.font,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 110,
            }}
            title={plaque.alias}
          >
            {plaque.alias}
          </span>
        </div>
        <div
          style={{
            fontSize: 10,
            color: TOKENS.textSec,
            lineHeight: 1.3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 220,
          }}
          title={market}
        >
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: TOKENS.textSec, textDecoration: "none" }}
            >
              {market}
            </a>
          ) : (
            market
          )}
        </div>
      </div>
      {/* connector line → cell */}
      <span
        aria-hidden="true"
        style={{
          width: connectorWidth,
          height: 1,
          background: `linear-gradient(90deg, ${accent}, rgba(0,0,0,0))`,
        }}
      />
      <style>{`
        @keyframes plaqueIn {
          from { opacity: 0; transform: translate(-110%, -50%); }
          to   { opacity: 1; transform: translate(-100%, -50%); }
        }
      `}</style>
    </div>
  );
}

function ConvergenceBadge({ category, count }: ConvergenceProps) {
  const rect = useCellRect(category);
  if (!rect) return null;
  const gridLeft = getGridLeft();
  const cellMidY = rect.top + rect.height / 2;
  const connectorWidth = Math.max(8, rect.left - (gridLeft - 8) - 4);

  return (
    <div
      style={{
        position: "fixed",
        left: gridLeft - 8,
        top: cellMidY,
        transform: "translate(-100%, -50%)",
        display: "flex",
        alignItems: "center",
        pointerEvents: "none",
        zIndex: 59,
        animation: "convergeIn .25s ease-out",
      }}
    >
      <span
        style={{
          background: TOKENS.accent,
          color: "#1a1410",
          borderRadius: 999,
          padding: "3px 9px",
          fontSize: 10,
          fontWeight: 800,
          fontFamily: TOKENS.mono,
          letterSpacing: 0.6,
          boxShadow: "0 6px 16px rgba(240,180,41,0.45)",
          animation: "convergePulseDot 1.4s ease-in-out infinite",
          whiteSpace: "nowrap",
        }}
      >
        🐋×{count}
      </span>
      <span
        aria-hidden="true"
        style={{
          width: connectorWidth,
          height: 1,
          background: `linear-gradient(90deg, ${TOKENS.accent}, rgba(240,180,41,0))`,
        }}
      />
      <style>{`
        @keyframes convergeIn {
          from { opacity: 0; transform: translate(-110%, -50%); }
          to   { opacity: 1; transform: translate(-100%, -50%); }
        }
        @keyframes convergePulseDot {
          0%, 100% { box-shadow: 0 0 0 0 rgba(240,180,41,0.45); }
          50%      { box-shadow: 0 0 0 6px rgba(240,180,41,0); }
        }
      `}</style>
    </div>
  );
}

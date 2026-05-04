"use client";

import { useEffect, useState } from "react";
import { fmtMoneyShort } from "@/lib/format";
import { TOKENS } from "@/lib/tokens";

/**
 * Renders the active "huge" trade callout and any convergence badges,
 * absolute-positioned over the heatmap grid. Cells are tagged with
 * `data-cell-category="<cat>" data-live-now="true"` (Cell.tsx); we
 * `querySelector` for the now-column cell of the relevant category to
 * anchor each overlay element.
 *
 * Only mounted in LIVE mode by Heatmap.tsx — PATTERN cells aren't a moving
 * window so "now" doesn't apply.
 */

type CalloutProps = {
  category: string;
  alias: string;
  sizeUsd: number;
  side: "BUY" | "SELL";
};

type ConvergenceProps = {
  category: string;
  count: number;
};

export function LiveActivityOverlay({
  callout,
  convergences,
}: {
  callout: CalloutProps | null;
  convergences: ReadonlyArray<ConvergenceProps>;
}) {
  return (
    <>
      {callout && <Callout key={`${callout.category}-${callout.alias}-${callout.sizeUsd}`} {...callout} />}
      {convergences.map((c) => (
        <Convergence key={c.category} {...c} />
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
    // Re-read on resize / scroll so the overlay tracks viewport changes.
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(read);
    };
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("scroll", onResize, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize);
      cancelAnimationFrame(raf);
    };
  }, [category]);
  return rect;
}

function cssEscape(s: string): string {
  // Categories are simple identifiers ("Crypto", "Sports", etc.) — no
  // special chars in practice. Escape the few that could legally appear in
  // a DOM-API attribute selector just in case (quotes, backslash).
  return s.replace(/["\\]/g, "\\$&");
}

function Callout({ category, alias, sizeUsd, side }: CalloutProps) {
  const rect = useCellRect(category);
  if (!rect) return null;
  const accent = side === "BUY" ? TOKENS.pos : TOKENS.neg;
  return (
    <div
      style={{
        position: "fixed",
        left: rect.left + rect.width / 2,
        top: rect.top - 8,
        transform: "translate(-50%, -100%)",
        background: TOKENS.panel,
        border: `1px solid ${accent}`,
        borderRadius: 8,
        padding: "7px 11px",
        boxShadow: "0 12px 32px rgba(0,0,0,0.55)",
        whiteSpace: "nowrap",
        animation: "liveCalloutIn .25s ease-out",
        pointerEvents: "none",
        zIndex: 60,
        color: TOKENS.text,
        fontFamily: TOKENS.font,
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
          color: TOKENS.textMuted,
        }}
      >
        <span style={{ color: accent }}>{side === "BUY" ? "↑" : "↓"} {side}</span>
        <span>·</span>
        <span style={{ color: TOKENS.text }}>{fmtMoneyShort(sizeUsd)}</span>
        <span style={{ color: TOKENS.textSec }}>· {category}</span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: TOKENS.text, marginTop: 1, fontFamily: alias.startsWith("0x") ? TOKENS.mono : TOKENS.font }}>
        {alias}
      </div>
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "50%",
          bottom: -5,
          transform: "translateX(-50%) rotate(45deg)",
          width: 8,
          height: 8,
          background: TOKENS.panel,
          border: `1px solid ${accent}`,
          borderTop: "none",
          borderLeft: "none",
        }}
      />
      <style>{`
        @keyframes liveCalloutIn {
          from { opacity: 0; transform: translate(-50%, calc(-100% + 6px)) scale(0.96); }
          to   { opacity: 1; transform: translate(-50%, -100%)             scale(1);    }
        }
      `}</style>
    </div>
  );
}

function Convergence({ category, count }: ConvergenceProps) {
  const rect = useCellRect(category);
  if (!rect) return null;
  return (
    <div
      style={{
        position: "fixed",
        left: rect.left + rect.width / 2,
        top: rect.bottom + 6,
        transform: "translateX(-50%)",
        background: TOKENS.accent,
        color: "#1a1410",
        borderRadius: 999,
        padding: "3px 9px",
        fontSize: 10,
        fontWeight: 800,
        fontFamily: TOKENS.mono,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        boxShadow: "0 6px 16px rgba(240,180,41,0.45)",
        animation: "convergePulse 1.2s ease-in-out infinite",
        pointerEvents: "none",
        zIndex: 60,
        whiteSpace: "nowrap",
      }}
    >
      🐋×{count} converging
      <style>{`
        @keyframes convergePulse {
          0%, 100% { transform: translateX(-50%) scale(1);    box-shadow: 0 0 0 0 rgba(240,180,41,0.45); }
          50%      { transform: translateX(-50%) scale(1.04); box-shadow: 0 0 0 6px rgba(240,180,41,0); }
        }
      `}</style>
    </div>
  );
}

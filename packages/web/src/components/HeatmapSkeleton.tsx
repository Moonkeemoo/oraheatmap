"use client";

import { useEffect, useState } from "react";
import { TOKENS } from "@/lib/tokens";

/**
 * Skeleton shown during the initial /api/heatmap fetch (before any data is
 * available to render). Mirrors the real grid's column layout — 9 rows ×
 * 12 buckets — with shimmer-animated dim cells. Centred status text
 * explains what's happening so a slow cold-path fetch doesn't read as
 * "the page is broken".
 */
export function HeatmapSkeleton() {
  const cols = 12;
  const rows = 9;
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `130px repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `26px repeat(${rows}, minmax(38px, 1fr))`,
          gap: 4,
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* time-row placeholder */}
        <div />
        {Array.from({ length: cols }).map((_, i) => (
          <div
            key={`t-${i}`}
            style={{
              height: 8,
              margin: "auto 8px",
              borderRadius: 2,
              background: TOKENS.border,
              opacity: 0.5,
            }}
          />
        ))}

        {Array.from({ length: rows }).map((_, r) => (
          <RowSkeleton key={r} cols={cols} delayMs={r * 60} />
        ))}
      </div>

      <LoadingStatus />
    </div>
  );
}

/** Centred status line over the skeleton — rotates through a short
 *  sequence so a 2-3s wait reads as "the system is doing something
 *  specific" rather than a stuck spinner. Final state stays put.
 *  Each step is ~700ms so a fast fetch barely shows step 1. */
function LoadingStatus() {
  const STAGES: ReadonlyArray<{ headline: string; sub: string }> = [
    {
      headline: "Connecting to the firehose",
      sub: "subscribing to every Polymarket trade in real time",
    },
    {
      headline: "Matching against the watchlist",
      sub: "filtering for trades from the top 10,000 whale wallets",
    },
    {
      headline: "Aggregating into time slots",
      sub: "bucketing PnL, volume and unique whales per category",
    },
    {
      headline: "Rendering the heatmap",
      sub: "almost there",
    },
  ];

  const [stage, setStage] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setStage((s) => Math.min(STAGES.length - 1, s + 1));
    }, 700);
    return () => clearInterval(id);
  }, []);

  const current = STAGES[stage]!;
  return (
    <div
      aria-live="polite"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        textAlign: "center",
        gap: 10,
      }}
    >
      {/* Pulsing dot — anchors the eye + tells the user "live" not "stuck". */}
      <span
        aria-hidden
        style={{
          width: 10,
          height: 10,
          borderRadius: 10,
          background: TOKENS.pos,
          boxShadow: `0 0 14px ${TOKENS.pos}`,
          animation: "skeletonStatusPulse 1.4s ease-in-out infinite",
        }}
      />
      <div
        key={`h-${stage}`}
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: TOKENS.text,
          fontFamily: '"Space Grotesk", -apple-system, sans-serif',
          letterSpacing: -0.3,
          animation: "skeletonStatusFade .35s ease-out",
        }}
      >
        {current.headline}
      </div>
      <div
        key={`s-${stage}`}
        style={{
          fontSize: 12,
          color: TOKENS.textSec,
          fontFamily: TOKENS.mono,
          letterSpacing: 0.2,
          maxWidth: 360,
          lineHeight: 1.5,
          animation: "skeletonStatusFade .35s ease-out",
        }}
      >
        {current.sub}
      </div>
      <style>{`
        @keyframes skeletonStatusPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.4; transform: scale(0.7); }
        }
        @keyframes skeletonStatusFade {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function RowSkeleton({ cols, delayMs }: { cols: number; delayMs: number }) {
  // Shimmer gradient travels across the row L → R; stagger between rows so
  // it reads as a wave rather than every row pulsing in sync.
  const shimmer: React.CSSProperties = {
    backgroundImage: `linear-gradient(90deg, ${TOKENS.panel} 0%, ${TOKENS.panel2} 50%, ${TOKENS.panel} 100%)`,
    backgroundSize: "200% 100%",
    animation: `skeletonShimmer 1.6s ease-in-out infinite`,
    animationDelay: `${delayMs}ms`,
  };
  return (
    <>
      {/* row-label placeholder badge */}
      <div
        style={{
          height: 22,
          margin: "auto 8px auto 22px",
          borderRadius: 4,
          ...shimmer,
        }}
      />
      {Array.from({ length: cols }).map((_, c) => (
        <div
          key={c}
          style={{
            borderRadius: 7,
            border: `1px solid ${TOKENS.border}`,
            ...shimmer,
          }}
        />
      ))}
    </>
  );
}

"use client";

import { TOKENS } from "@/lib/tokens";

/**
 * Skeleton shown during the initial /api/heatmap fetch (before any data is
 * available to render). Mirrors the real grid's column layout — 9 rows ×
 * 12 buckets — with shimmer-animated dim cells. Reads as "the heatmap is
 * loading" rather than the previous bare "loading…" text.
 */
export function HeatmapSkeleton() {
  const cols = 12;
  const rows = 9;
  return (
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

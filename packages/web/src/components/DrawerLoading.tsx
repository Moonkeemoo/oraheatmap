"use client";

import { TOKENS } from "@/lib/tokens";

/**
 * Loading placeholder for the right-side drawer panels.
 *
 * Plain shimmer-skeleton plates — same gradient sweep
 * (skeletonShimmer keyframe in globals.css) used by HeatmapSkeleton
 * and StatsBarSkeleton, kept neutral on purpose so the loading state
 * doesn't fight the rest of the dark UI for attention.
 *
 * Variants:
 *   - "inline" — a small 60×9 plate sized to fit inside a header row
 *   - "block"  — a wider 120×18 plate used as a section placeholder
 *   - "rows"   — N skeleton rows (avatar / label / value triple) for
 *                list sections (recurring whales, top markets, etc.)
 */

export function DrawerLoading({
  variant = "block",
  rows,
}: {
  variant?: "inline" | "block" | "rows";
  /** Used only when variant === "rows". Default 3. */
  rows?: number;
}) {
  if (variant === "rows") {
    const n = rows ?? 3;
    return (
      <div style={{ padding: "4px 0" }}>
        {Array.from({ length: n }).map((_, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "20px 1fr auto",
              alignItems: "center",
              gap: 8,
              padding: "5px 4px",
              marginBottom: 2,
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                ...shimmer(i * 80),
              }}
            />
            <div style={{ height: 9, borderRadius: 3, ...shimmer(i * 80 + 40) }} />
            <div
              style={{
                width: 36,
                height: 9,
                borderRadius: 3,
                ...shimmer(i * 80 + 80),
              }}
            />
          </div>
        ))}
      </div>
    );
  }
  const w = variant === "inline" ? 60 : 120;
  const h = variant === "inline" ? 9 : 18;
  return (
    <div
      role="status"
      aria-label="Loading"
      style={{
        width: w,
        height: h,
        borderRadius: 3,
        ...shimmer(0),
      }}
    />
  );
}

function shimmer(delayMs: number): React.CSSProperties {
  return {
    backgroundImage: `linear-gradient(90deg, ${TOKENS.panel} 0%, ${TOKENS.panel2} 50%, ${TOKENS.panel} 100%)`,
    backgroundSize: "200% 100%",
    animation: "skeletonShimmer 1.6s ease-in-out infinite",
    animationDelay: `${delayMs}ms`,
  };
}

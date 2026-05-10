"use client";

import { TOKENS } from "@/lib/tokens";

/**
 * Loading placeholder for the right-side drawer panels.
 *
 * Each variant pairs an animated spinner with a shimmer-skeleton plate
 * (same `skeletonShimmer` sweep as HeatmapSkeleton / StatsBarSkeleton).
 * The spinner makes "loading" obvious at a glance — the shimmer plates
 * by themselves are too subtle to read as motion on the dark panel
 * (user feedback, 2026-05-10). The shimmer still owns layout so the
 * drawer doesn't jump when data lands.
 *
 * Variants:
 *   - "inline" — small spinner + 60×9 plate, fits inside a header row
 *   - "block"  — spinner + 120×18 plate, section placeholder
 *   - "rows"   — spinner banner above N skeleton rows (avatar / label
 *                / value triple) for list sections (recurring whales,
 *                top markets, etc.)
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "2px 4px 6px",
            color: TOKENS.textMuted,
            fontSize: 10,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          <Spinner size={11} />
          <span>Loading</span>
        </div>
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
        <SpinnerKeyframes />
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
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: variant === "inline" ? 0 : "4px 0",
      }}
    >
      <Spinner size={variant === "inline" ? 10 : 12} />
      <span
        style={{
          width: w,
          height: h,
          borderRadius: 3,
          ...shimmer(0),
        }}
      />
      <SpinnerKeyframes />
    </div>
  );
}

/** Small ring-spinner. Border-based so it survives in any nested
 *  layout without needing an SVG file or external icon. */
function Spinner({ size = 12 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        border: `1.5px solid ${TOKENS.border}`,
        borderTopColor: TOKENS.textMuted,
        animation: "drawerSpinner 0.8s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

/** Inline keyframes so we don't need to plumb anything into globals.css.
 *  Idempotent — multiple Spinners on screen reuse the same `@keyframes
 *  drawerSpinner` definition. */
function SpinnerKeyframes() {
  return (
    <style>{`
      @keyframes drawerSpinner {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }
    `}</style>
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

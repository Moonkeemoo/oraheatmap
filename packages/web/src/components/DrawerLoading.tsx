"use client";

import { TOKENS } from "@/lib/tokens";

/**
 * Branded loading indicator for the right-side drawer panels.
 *
 * Five small heatmap-coloured cells pulse in a left-to-right wave —
 * coherent with the product's visual identity (the heatmap IS the
 * product), more polished than a bare "loading…" text. The wave
 * pattern reads as "data is filling in" without resorting to a
 * generic spinner.
 *
 * Variants:
 *   - "inline"  — compact, fits inside a widget header row
 *   - "block"   — taller padding, used as a section placeholder
 *   - "rows"    — N skeleton rows + a single wave footer, for list
 *                 sections (recurring whales, top markets, etc.)
 */

const COLORS = [
  TOKENS.pos,       // green
  TOKENS.accent,    // yellow
  TOKENS.link,      // blue
  TOKENS.pos,
  TOKENS.accent,
];

export function DrawerLoading({
  variant = "block",
  label,
  rows,
}: {
  variant?: "inline" | "block" | "rows";
  /** Override default "loading…" text. Pass null/empty to hide entirely. */
  label?: string | null;
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
                ...shimmerStyle(i * 80),
              }}
            />
            <div style={{ height: 9, borderRadius: 3, ...shimmerStyle(i * 80 + 40) }} />
            <div
              style={{
                width: 36,
                height: 9,
                borderRadius: 3,
                ...shimmerStyle(i * 80 + 80),
              }}
            />
          </div>
        ))}
        <div style={{ marginTop: 6, paddingLeft: 4 }}>
          <Wave compact />
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: variant === "inline" ? 0 : "8px 0",
      }}
    >
      <Wave compact={variant === "inline"} />
      {label !== null && (
        <span
          style={{
            fontSize: 11,
            color: TOKENS.textMuted,
            fontFamily: TOKENS.mono,
            letterSpacing: 0.4,
          }}
        >
          {label ?? "loading"}
        </span>
      )}
    </div>
  );
}

function Wave({ compact }: { compact?: boolean }) {
  const size = compact ? 6 : 8;
  const gap = compact ? 3 : 4;
  return (
    <div
      aria-label="Loading"
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap,
      }}
    >
      {COLORS.map((color, i) => (
        <span
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: 2,
            background: color,
            // Stagger 0.12s per cell so the brightest spot travels
            // L → R like a heatmap "now" sweep. Total cycle 1.2s.
            animation: "drawerWave 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.12}s`,
            boxShadow: `0 0 6px ${color}`,
          }}
        />
      ))}
    </div>
  );
}

function shimmerStyle(delayMs: number): React.CSSProperties {
  return {
    backgroundImage: `linear-gradient(90deg, ${TOKENS.panel} 0%, ${TOKENS.panel2} 50%, ${TOKENS.panel} 100%)`,
    backgroundSize: "200% 100%",
    animation: "skeletonShimmer 1.6s ease-in-out infinite",
    animationDelay: `${delayMs}ms`,
  };
}

/**
 * ORALAB · Polymarket Heatmap brand mark.
 *
 * Inline SVG so `currentColor` carries through — white on dark surface, near-
 * black on light. 3×3-style colored grid icon to the left, ORALAB wordmark
 * + POLYMARKET HEATMAP descriptor stacked to the right. One concept, no
 * separator dot.
 *
 * Two sizes share the same artwork via the `size` prop:
 *   "hero"    — header / landing hero (icon 60px, ORALAB 42px, descriptor 14px)
 *   "compact" — places where space is tight (icon 24px, ORALAB 18px, descriptor 8px)
 */

import "@fontsource/space-grotesk/700.css";

const ICON_RECTS: ReadonlyArray<{ x: number; y: number; fill: string }> = [
  { x: 0,  y: 0,  fill: "#3fb950" },
  { x: 35, y: 0,  fill: "#238636" },
  { x: 0,  y: 35, fill: "#f0b429" },
  { x: 35, y: 35, fill: "#3fb950" },
  { x: 70, y: 35, fill: "#238636" },
  { x: 35, y: 70, fill: "#f85149" },
  { x: 70, y: 70, fill: "#f0b429" },
];

type Size = "hero" | "compact";

type Spec = {
  width: number;
  height: number;
  iconScale: number;
  iconY: number;
  textX: number;
  oralabSize: number;
  oralabY: number;
  descriptorSize: number;
  descriptorY: number;
};

const HERO: Spec = {
  width: 360,
  height: 80,
  iconScale: 0.6,           // 100×100 viewbox → 60px
  iconY: 10,
  textX: 76,
  oralabSize: 42,
  oralabY: 46,
  descriptorSize: 14,
  descriptorY: 68,
};

const COMPACT: Spec = {
  width: 168,
  height: 32,
  iconScale: 0.24,          // 24px
  iconY: 4,
  textX: 32,
  oralabSize: 18,
  oralabY: 18,
  descriptorSize: 8,
  descriptorY: 28,
};

export function BrandLogo({
  size = "hero",
  showDescriptor = true,
  ariaLabel = "ORALAB Polymarket Heatmap",
}: {
  size?: Size;
  showDescriptor?: boolean;
  ariaLabel?: string;
}) {
  const s = size === "hero" ? HERO : COMPACT;
  return (
    <svg
      viewBox={`0 0 ${s.width} ${s.height}`}
      width={s.width}
      height={s.height}
      role="img"
      aria-label={ariaLabel}
      style={{ display: "block" }}
    >
      <title>{ariaLabel}</title>
      <g transform={`translate(0,${s.iconY}) scale(${s.iconScale})`}>
        {ICON_RECTS.map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={30} height={30} rx={2} fill={r.fill} />
        ))}
      </g>
      <text
        x={s.textX}
        y={s.oralabY}
        style={{
          fontFamily: "'Space Grotesk', system-ui, sans-serif",
          fontSize: s.oralabSize,
          fontWeight: 700,
          letterSpacing: "-0.02em",
        }}
        fill="currentColor"
      >
        ORALAB
      </text>
      {showDescriptor && (
        <text
          x={s.textX}
          y={s.descriptorY}
          style={{
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
            fontSize: s.descriptorSize,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
          fill="currentColor"
          fillOpacity={0.5}
        >
          POLYMARKET HEATMAP
        </text>
      )}
    </svg>
  );
}

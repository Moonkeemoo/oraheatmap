/**
 * ORALAB · Polymarket Heatmap brand mark.
 *
 * HTML+flex container so the icon and the stacked text block share the
 * exact same vertical center (SVG <text> only baseline-aligns, which
 * always looked subtly off in earlier attempts).
 *
 * Two sizes share the same artwork via the `size` prop:
 *   "hero"    — header / landing hero (icon 64px, ORALAB 36px, descriptor 12px)
 *   "compact" — places where space is tight (icon 24px, ORALAB 16px, descriptor 8px)
 *
 * Color: `currentColor` for both wordmark and descriptor — the brand
 * inherits the surrounding `color` (white on dark, near-black on light).
 * Descriptor at opacity 0.5 — one concept, no separator dot.
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

const SIZES: Record<Size, {
  icon: number;
  gap: number;
  oralabSize: number;
  descriptorSize: number;
  rowGap: number;
  oralabLetterSpacing: string;
}> = {
  // Lowercase "oralab" — visual height of the wordmark roughly matches
  // the icon. Bigger font-size than uppercase ORALAB needed because
  // x-height is ~50% of font-size in Space Grotesk.
  hero:    { icon: 60, gap: 16, oralabSize: 54, descriptorSize: 14, rowGap: 4, oralabLetterSpacing: "-0.04em" },
  compact: { icon: 24, gap: 8,  oralabSize: 22, descriptorSize: 8,  rowGap: 2, oralabLetterSpacing: "-0.04em" },
};

function GridIcon({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={{ display: "block", flexShrink: 0 }}
      aria-hidden="true"
    >
      {ICON_RECTS.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={30} height={30} rx={2} fill={r.fill} />
      ))}
    </svg>
  );
}

export function BrandLogo({
  size = "hero",
  showDescriptor = true,
  ariaLabel = "ORALAB Polymarket Heatmap",
}: {
  size?: Size;
  showDescriptor?: boolean;
  ariaLabel?: string;
}) {
  const s = SIZES[size];
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: s.gap,
        color: "currentColor",
        lineHeight: 1,
      }}
    >
      <GridIcon size={s.icon} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: s.rowGap,
          fontFamily: "'Space Grotesk', system-ui, sans-serif",
          fontWeight: 700,
        }}
      >
        {/* Wordmark stays lowercase. Descriptor is UPPERCASE — keeps the
            "tag underneath the brand" hierarchy clean. */}
        <span
          style={{
            fontSize: s.oralabSize,
            lineHeight: 1,
            letterSpacing: s.oralabLetterSpacing,
            color: "currentColor",
          }}
        >
          oralab
        </span>
        {showDescriptor && (
          <span
            style={{
              fontSize: s.descriptorSize,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              color: "currentColor",
              opacity: 0.5,
            }}
          >
            POLYMARKET HEATMAP
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * ORALAB · Polymarket Heatmap brand mark.
 *
 * Two render modes share the same artwork via the `size` prop:
 *   "hero"     — fixed-pixel HTML+flex (icon 60px, ORALAB 36px, descriptor 12px)
 *   "fill"     — SVG with viewBox; container's height drives the size,
 *                proportions stay locked
 *   "compact"  — small fixed-pixel for tight chrome
 *
 * `currentColor` carries through for both wordmark and descriptor so the
 * brand inherits the surrounding color (white on dark, near-black on light).
 * Descriptor at fill-opacity 0.5 — one concept, no separator dot.
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

type Size = "hero" | "compact" | "fill";

const FIXED: Record<"hero" | "compact", { icon: number; gap: number; oralabSize: number; descriptorSize: number; rowGap: number }> = {
  hero:    { icon: 60, gap: 16, oralabSize: 36, descriptorSize: 12, rowGap: 2 },
  compact: { icon: 24, gap: 8,  oralabSize: 16, descriptorSize: 8,  rowGap: 1 },
};

function GridIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ display: "block", flexShrink: 0 }} aria-hidden="true">
      {ICON_RECTS.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={30} height={30} rx={2} fill={r.fill} />
      ))}
    </svg>
  );
}

/** Fixed-pixel HTML/flex variant — used for "hero" + "compact". */
function FixedBrand({ s, ariaLabel, showDescriptor }: { s: typeof FIXED["hero"]; ariaLabel: string; showDescriptor: boolean }) {
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
          letterSpacing: "-0.02em",
          textTransform: "uppercase",
        }}
      >
        <span style={{ fontSize: s.oralabSize, lineHeight: 1, color: "currentColor" }}>ORALAB</span>
        {showDescriptor && (
          <span style={{ fontSize: s.descriptorSize, lineHeight: 1, color: "currentColor", opacity: 0.5 }}>
            POLYMARKET HEATMAP
          </span>
        )}
      </div>
    </div>
  );
}

/** SVG variant with viewBox — scales to fill the container's height while
 *  preserving the hero proportions (1 : 0.6 : 0.2 between icon, ORALAB,
 *  descriptor). Use on a parent with explicit height (or align-self:
 *  stretch in a flex row) — the SVG sets height:100% and width:auto. */
function FillBrand({ ariaLabel, showDescriptor }: { ariaLabel: string; showDescriptor: boolean }) {
  // Reference units (60px icon variant), used only as numbers — final
  // pixel size is whatever the SVG container is.
  const ICON = 100;            // grid icon viewBox is 100×100
  const SCALE = 0.6;           // 60-unit icon
  const ICON_PX = ICON * SCALE; // 60
  const GAP = 16;
  const ORALAB = 36;
  const DESC = 12;
  const ROW_GAP = 2;
  const TEXT_X = ICON_PX + GAP;

  // Vertical centering — text block height = ORALAB + ROW_GAP + DESC = 50.
  // Centered in 60-tall canvas → top of ORALAB cap at y=5, baseline at
  // y=ORALAB+5=41 (using line-height 1 the cap top sits on baseline-asc),
  // descriptor cap top at y=ORALAB+ROW_GAP+5=43, baseline y=DESC+43=55.
  const HEIGHT = 60;
  // We use dominantBaseline="hanging" so the top of the text aligns with
  // y, sidestepping per-font ascender quirks. Then placement is just from
  // the top of each line.
  const oralabTopY = 5;
  const descriptorTopY = oralabTopY + ORALAB + ROW_GAP;

  // Width: text extent for "POLYMARKET HEATMAP" at 12px ≈ 110, icon + gap
  // + that ≈ 60 + 16 + 110 = 186. Round up.
  const WIDTH = 200;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
      // CSS-only sizing — height fills the container, width is derived
      // from the viewBox aspect ratio. Avoids the browser default of
      // 300×150 that kicks in when SVG attributes are "auto".
      style={{ display: "block", height: "100%", width: "auto", color: "currentColor" }}
    >
      <title>{ariaLabel}</title>
      <g transform={`translate(0, ${(HEIGHT - ICON_PX) / 2}) scale(${SCALE})`}>
        {ICON_RECTS.map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={30} height={30} rx={2} fill={r.fill} />
        ))}
      </g>
      <text
        x={TEXT_X}
        y={oralabTopY}
        dominantBaseline="hanging"
        style={{
          fontFamily: "'Space Grotesk', system-ui, sans-serif",
          fontSize: ORALAB,
          fontWeight: 700,
          letterSpacing: "-0.02em",
        }}
        fill="currentColor"
      >
        ORALAB
      </text>
      {showDescriptor && (
        <text
          x={TEXT_X}
          y={descriptorTopY}
          dominantBaseline="hanging"
          style={{
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
            fontSize: DESC,
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

export function BrandLogo({
  size = "hero",
  showDescriptor = true,
  ariaLabel = "ORALAB Polymarket Heatmap",
}: {
  size?: Size;
  showDescriptor?: boolean;
  ariaLabel?: string;
}) {
  if (size === "fill") {
    return <FillBrand ariaLabel={ariaLabel} showDescriptor={showDescriptor} />;
  }
  return <FixedBrand s={FIXED[size]} ariaLabel={ariaLabel} showDescriptor={showDescriptor} />;
}

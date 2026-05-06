import { ImageResponse } from "next/og";

/**
 * Browser-tab + Google-SERP favicon (32×32 PNG). Generated at build time
 * so it stays in lockstep with the SVG version in /public/favicon.svg
 * — same 7-cell heatmap motif, just rasterised because Google's SERP
 * favicon pipeline doesn't render SVG reliably (we showed up as a
 * generic globe). Browsers still get the SVG for crisp rendering at
 * higher DPRs via the icons.icon array in app/layout.tsx.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const CELLS: ReadonlyArray<{ row: 0 | 1 | 2; col: 0 | 1 | 2; color: string }> = [
  { row: 0, col: 0, color: "#3fb950" },
  { row: 0, col: 1, color: "#238636" },
  { row: 1, col: 0, color: "#f0b429" },
  { row: 1, col: 1, color: "#3fb950" },
  { row: 1, col: 2, color: "#238636" },
  { row: 2, col: 1, color: "#f85149" },
  { row: 2, col: 2, color: "#f0b429" },
];

export default function Icon(): ImageResponse {
  return iconImage(32, 9, 1);
}

/** Shared renderer used by both /icon and /apple-icon — same motif,
 *  different cell + gap sizing. */
export function iconImage(canvasPx: number, cellPx: number, gapPx: number): ImageResponse {
  const padding = (canvasPx - cellPx * 3 - gapPx * 2) / 2;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          gap: gapPx,
          padding: padding,
          background: "transparent",
        }}
      >
        {([0, 1, 2] as const).map((row) => (
          <div key={row} style={{ display: "flex", gap: gapPx, height: cellPx }}>
            {([0, 1, 2] as const).map((col) => {
              const cell = CELLS.find((c) => c.row === row && c.col === col);
              return (
                <div
                  key={col}
                  style={{
                    width: cellPx,
                    height: cellPx,
                    borderRadius: Math.max(1, Math.round(cellPx * 0.18)),
                    background: cell ? cell.color : "transparent",
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    ),
    { width: canvasPx, height: canvasPx },
  );
}

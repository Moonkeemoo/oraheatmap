import { ImageResponse } from "next/og";

/**
 * Dynamic Open Graph card. Next.js builds this once at build time and
 * serves it as /opengraph-image — no fonts/images on disk, just the
 * composed PNG. Twitter card / OG meta in layout.tsx point at this
 * file via metadataBase + the conventional file-based discovery.
 *
 * Renders a brand-coloured 1200x630 card with the product hook copy
 * and a faux-heatmap strip that mirrors the live grid colour palette.
 */
// We self-host this Next.js app on Bun (no Vercel Edge), so leave the
// runtime at the default "nodejs". Edge-only here would 502 on prod.
export const alt = "oralab — Polymarket whale tracker · live PnL heatmap";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  // 9 columns × 5 rows of mock heatmap cells. The pattern is hand-tuned
  // (not random) so the OG image always reads as a credible cross-
  // section of "smart money in/out" rather than visual noise.
  const PATTERN: ReadonlyArray<ReadonlyArray<-1 | 0 | 1>> = [
    [ 1,  1,  1,  0,  1,  1,  1,  1,  1],
    [-1, -1, -1, -1,  0, -1, -1,  0, -1],
    [ 1,  0,  1,  1,  1,  0,  1,  1,  1],
    [-1, -1,  0, -1, -1, -1,  0,  0, -1],
    [ 1,  1,  1,  0,  1,  1,  1,  1,  1],
  ];
  const cellColor = (v: -1 | 0 | 1, intensity: number): string => {
    if (v === 0) return "#1f2530";
    const a = 0.35 + intensity * 0.4; // 0.35 → 0.75
    return v > 0 ? `rgba(63,185,80,${a})` : `rgba(248,81,73,${a})`;
  };

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background:
            "radial-gradient(circle at 80% 20%, rgba(240,180,41,0.12) 0%, transparent 55%), linear-gradient(135deg, #0d1117 0%, #14181d 100%)",
          color: "#fff",
          fontFamily: "Inter, system-ui, -apple-system, sans-serif",
          padding: 64,
        }}
      >
        {/* Header — wordmark + Live pill */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 24,
          }}
        >
          {/* Wordmark — multi-child text needs display:flex per @vercel/og.
              flexWrap:wrap keeps it inline-looking despite being a flexbox. */}
          <div
            style={{
              display: "flex",
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: -1,
              color: "#fff",
            }}
          >
            <span>oralab</span>
            <span style={{ color: "#f0b429" }}>.</span>
            <span>xyz</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 14,
              fontFamily: "ui-monospace, Menlo, monospace",
              letterSpacing: 1.5,
              textTransform: "uppercase",
              color: "#b1bac4",
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 10,
                background: "#3fb950",
                boxShadow: "0 0 14px #3fb950",
              }}
            />
            <span>Live</span>
          </div>
        </div>

        {/* Headline — flex-wrap so the multi-span text reads naturally. */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 14,
            fontSize: 76,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: -2.5,
            color: "#fff",
            maxWidth: 920,
            marginBottom: 14,
          }}
        >
          <span>Polymarket whale tracker.</span>
          <span style={{ color: "#f0b429" }}>Every trade.</span>
          <span style={{ color: "#3fb950" }}>Live.</span>
        </div>

        {/* Subhead */}
        <div
          style={{
            fontSize: 24,
            color: "#b1bac4",
            maxWidth: 880,
            lineHeight: 1.4,
            marginBottom: 36,
          }}
        >
          Real-time heatmap of every trade from 10,000+ top wallets. Drill from
          a hot cell to the markets driving it.
        </div>

        {/* Faux heatmap strip */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: 12,
            border: "1px solid #30363d",
            borderRadius: 12,
            background: "rgba(22,27,34,0.55)",
          }}
        >
          {PATTERN.map((row, ri) => (
            <div key={ri} style={{ display: "flex", gap: 6 }}>
              {row.map((v, ci) => {
                // Right-most columns intensify ("now" edge) so the
                // image hints at the sliding-window narrative.
                const intensity = 0.4 + (ci / row.length) * 0.6;
                return (
                  <div
                    key={ci}
                    style={{
                      width: 100,
                      height: 60,
                      borderRadius: 6,
                      background: cellColor(v, intensity),
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}

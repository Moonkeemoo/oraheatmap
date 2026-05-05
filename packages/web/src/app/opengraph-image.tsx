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
  // 11 columns × 4 rows of mock heatmap cells. Pattern is hand-tuned
  // (not random) so the OG image reads as a credible cross-section of
  // "smart money in/out". 4 rows fit cleanly under the headline + sub
  // without overlapping in the 1200×630 frame.
  const PATTERN: ReadonlyArray<ReadonlyArray<-1 | 0 | 1>> = [
    [ 1,  1,  1,  0,  1,  1,  1,  1,  1,  1,  1],
    [-1, -1, -1, -1,  0, -1, -1,  0, -1, -1,  0],
    [ 1,  0,  1,  1,  1,  0,  1,  1,  1,  1,  1],
    [-1, -1,  0, -1, -1, -1,  0,  0, -1, -1,  0],
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
          justifyContent: "space-between",
          background:
            "radial-gradient(circle at 80% 20%, rgba(240,180,41,0.12) 0%, transparent 55%), linear-gradient(135deg, #0d1117 0%, #14181d 100%)",
          color: "#fff",
          fontFamily: "Inter, system-ui, -apple-system, sans-serif",
          padding: 56,
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

        {/* Body — text block, growing from below the header. */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 14,
              fontSize: 68,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -2.2,
              color: "#fff",
              maxWidth: 920,
              marginBottom: 18,
            }}
          >
            <span>Polymarket whale tracker.</span>
            <span style={{ color: "#f0b429" }}>Every trade.</span>
            <span style={{ color: "#3fb950" }}>Live.</span>
          </div>
          <div
            style={{
              fontSize: 22,
              color: "#b1bac4",
              maxWidth: 880,
              lineHeight: 1.4,
            }}
          >
            Real-time heatmap of every trade from 10,000+ top wallets — drill
            from a hot cell to the markets driving it.
          </div>
        </div>

        {/* Faux heatmap strip — pinned bottom via outer space-between. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 5,
            padding: 10,
            border: "1px solid #30363d",
            borderRadius: 10,
            background: "rgba(22,27,34,0.55)",
          }}
        >
          {PATTERN.map((row, ri) => (
            <div key={ri} style={{ display: "flex", gap: 5 }}>
              {row.map((v, ci) => {
                // Right-most columns intensify ("now" edge) so the
                // image hints at the sliding-window narrative.
                const intensity = 0.4 + (ci / row.length) * 0.6;
                return (
                  <div
                    key={ci}
                    style={{
                      width: 96,
                      height: 36,
                      borderRadius: 5,
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

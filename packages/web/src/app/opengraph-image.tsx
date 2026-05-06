import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Dynamic Open Graph card. Translated from the marketing-assets
 * design (claude-design HTML mock at marketing-assets/OG Image.html)
 * into @vercel/og JSX so Next.js can render it at request time and
 * serve as /opengraph-image — every social client (Telegram, X,
 * Discord, Slack, LinkedIn) discovers it via metadataBase + the
 * file-based convention without an explicit URL in layout.tsx.
 *
 * Layout (1200×630):
 *   ┌─────────────────────────────────────────────┐
 *   │ [▦▦] oralab.xyz             [● LIVE]         │
 *   │      POLYMARKET HEATMAP                      │
 *   │                                              │
 *   │ Polymarket whale tracker.                    │
 *   │ Every trade. Live.                           │
 *   │ Real-time heatmap of every trade ...         │
 *   │                                              │
 *   │ ┌──────┬──────────────────────────────────┐ │
 *   │ │ Sports│ ░░░▓▓▓▓▒▒▒▒▒▒                  │ │
 *   │ │ ...   │ ░░░░░░░░░░░░                   │ │
 *   │ └──────┴──────────────────────────────────┘ │
 *   │ $2.8M tracked · 10K+ whales · ...            │
 *   └─────────────────────────────────────────────┘
 *
 * @vercel/og caveats vs the source HTML:
 * - backdrop-filter doesn't render → use opaque panel colour instead.
 * - mask-image gradient on the dot grid pattern doesn't render → drop.
 *   The radial gradients still carry visual depth without it.
 * - JetBrains Mono not bundled locally → fall back to ui-monospace
 *   for the small mono labels. Space Grotesk loaded from /public/fonts.
 */

// We self-host this Next.js app on Bun (no Vercel Edge), so leave the
// runtime at the default "nodejs". Edge-only here would 502 on prod.
export const alt = "oralab — Polymarket whale tracker · live PnL heatmap";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Hand-tuned 5×12 heatmap matrix mirrored from the source HTML.
// Class strings encode (color × intensity): g1-g4 = green ramp, r1-r4
// = red ramp, y3/y4 = yellow accent. Empty string = inactive cell.
// Pattern intensifies left → right to read as "current moment".
const ROWS: ReadonlyArray<ReadonlyArray<string>> = [
  // 0    1     2     3    4    5     6    7    8     9     10    11
  ["",   "g1", "",   "g1", "g2", "",   "g2", "g2", "g3", "g3", "g4", "g4"], // sports
  ["r1", "r1", "",   "r2", "",   "r1", "r1", "",   "g1", "g2", "g3", "g3"], // politics
  ["",   "g1", "r1", "",   "y3", "",   "g1", "r2", "g2", "y4", "g3", "g3"], // crypto
  ["",   "",   "r1", "",   "",   "g1", "",   "g1", "g2", "g2", "g3", "g3"], // finance
  ["",   "",   "",   "g1", "",   "",   "r1", "",   "g1", "",   "g2", "g3"], // tech
];

const CELL_STYLES: Record<string, React.CSSProperties> = {
  g1: { background: "rgba(63,185,80,0.22)" },
  g2: { background: "rgba(63,185,80,0.36)" },
  g3: { background: "rgba(63,185,80,0.55)", boxShadow: "0 0 10px rgba(63,185,80,0.35)" },
  g4: { background: "rgba(63,185,80,0.78)", boxShadow: "0 0 14px rgba(63,185,80,0.55)" },
  r1: { background: "rgba(248,81,73,0.22)" },
  r2: { background: "rgba(248,81,73,0.36)" },
  r3: { background: "rgba(248,81,73,0.55)", boxShadow: "0 0 10px rgba(248,81,73,0.35)" },
  r4: { background: "rgba(248,81,73,0.78)", boxShadow: "0 0 14px rgba(248,81,73,0.55)" },
  y3: { background: "rgba(240,180,41,0.55)", boxShadow: "0 0 10px rgba(240,180,41,0.35)" },
  y4: { background: "rgba(240,180,41,0.78)", boxShadow: "0 0 14px rgba(240,180,41,0.55)" },
};

const CATS: ReadonlyArray<{
  label: string;
  bg: string;
  color: string;
  border: string;
}> = [
  { label: "Sports",   bg: "rgba(248,81,73,0.14)",  color: "#ff8b85", border: "rgba(248,81,73,0.32)" },
  { label: "Politics", bg: "rgba(88,166,255,0.14)", color: "#8cc2ff", border: "rgba(88,166,255,0.32)" },
  { label: "Crypto",   bg: "rgba(240,180,41,0.14)", color: "#f7c75d", border: "rgba(240,180,41,0.36)" },
  { label: "Finance",  bg: "rgba(56,184,178,0.14)", color: "#6fdfd9", border: "rgba(56,184,178,0.32)" },
  { label: "Tech",     bg: "rgba(63,185,80,0.14)",  color: "#75d68a", border: "rgba(63,185,80,0.32)" },
];

// 9-cell oralab mark — 3×3 grid mirroring the BrandLogo component.
// `null` slots stay empty (transparent). The mark sits next to the
// wordmark in the top-left and reads as a faceted "block of pixels".
const MARK_CELLS: ReadonlyArray<{ bg: string; shadow: string } | null> = [
  { bg: "#3fb950", shadow: "0 0 12px rgba(63,185,80,0.45)" },   // t1
  { bg: "#238636", shadow: "0 0 10px rgba(35,134,54,0.35)" },   // t2
  null,                                                          // t3
  { bg: "#f0b429", shadow: "0 0 12px rgba(240,180,41,0.5)" },   // t4
  { bg: "#3fb950", shadow: "0 0 12px rgba(63,185,80,0.4)" },    // t5
  { bg: "#238636", shadow: "0 0 10px rgba(35,134,54,0.35)" },   // t6
  null,                                                          // t7
  { bg: "#f85149", shadow: "0 0 12px rgba(248,81,73,0.5)" },    // t8
  { bg: "#f0b429", shadow: "0 0 12px rgba(240,180,41,0.45)" },  // t9
];

async function loadFont(filename: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(process.cwd(), "public/fonts", filename));
  } catch {
    // Font missing or unreadable — fall back to the default in-bundle
    // Vercel-OG sans (Inter-ish). Better than crashing the whole route.
    return null;
  }
}

export default async function Image() {
  const [sg500, sg700] = await Promise.all([
    loadFont("SpaceGrotesk-500.ttf"),
    loadFont("SpaceGrotesk-700.ttf"),
  ]);

  const fonts: Array<{
    name: string;
    data: Buffer;
    weight: 400 | 500 | 600 | 700;
    style: "normal";
  }> = [];
  if (sg500) fonts.push({ name: "Space Grotesk", data: sg500, weight: 500, style: "normal" });
  if (sg700) fonts.push({ name: "Space Grotesk", data: sg700, weight: 700, style: "normal" });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#0d1117",
          color: "#e6edf3",
          fontFamily: "Space Grotesk, Inter, system-ui, sans-serif",
          position: "relative",
        }}
      >
        {/* Warm radial in the top-right corner — adds depth + brand
            warmth without overpowering the text. Second radial at the
            bottom-left for green undertone. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 88% 8%, rgba(240,180,41,0.14) 0%, rgba(240,180,41,0.05) 28%, transparent 55%), radial-gradient(circle at 12% 110%, rgba(63,185,80,0.08) 0%, transparent 45%)",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            height: "100%",
            padding: 44,
          }}
        >
          {/* ── Top row: brand mark + wordmark on the left, Live pill on the right ── */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {/* 3×3 mark — flex-wrap'd row of 9 squares, wrapping every
                  3 to mimic CSS grid. Each cell carries its own glow. */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  width: 56,
                  height: 56,
                  gap: 3,
                  flexShrink: 0,
                }}
              >
                {MARK_CELLS.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      width: (56 - 6) / 3,
                      height: (56 - 6) / 3,
                      borderRadius: 3,
                      background: c?.bg ?? "transparent",
                      boxShadow: c?.shadow ?? "none",
                    }}
                  />
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
                <div
                  style={{
                    fontSize: 38,
                    fontWeight: 700,
                    letterSpacing: -1.5,
                    color: "#e6edf3",
                  }}
                >
                  oralab.xyz
                </div>
                <div
                  style={{
                    fontFamily: "ui-monospace, Menlo, monospace",
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: 2.4,
                    color: "#7d8590",
                    marginTop: 8,
                  }}
                >
                  POLYMARKET HEATMAP
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 14px 8px 12px",
                border: "1px solid #30363d",
                borderRadius: 999,
                background: "rgba(22,27,34,0.6)",
                fontFamily: "ui-monospace, Menlo, monospace",
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: 2,
                color: "#e6edf3",
                textTransform: "uppercase",
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: "#3fb950",
                  boxShadow:
                    "0 0 0 3px rgba(63,185,80,0.18), 0 0 14px rgba(63,185,80,0.85)",
                }}
              />
              <span>Live</span>
            </div>
          </div>

          {/* ── Headline + sub ──
              Sized down vs. the source HTML mock — that mock was tall
              (min-height: 100vh) so it never had to fit inside 630px.
              Headline 56 / sub 17 with tighter gaps lands at ~240px
              total leaving room for the 230px heatmap panel + stats. */}
          <div style={{ marginTop: 28, maxWidth: 980, display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                fontSize: 56,
                fontWeight: 700,
                lineHeight: 1.0,
                letterSpacing: -2.2,
                color: "#e6edf3",
              }}
            >
              <span>Polymarket whale tracker.&nbsp;</span>
              <span style={{ color: "#f0b429" }}>Every trade.&nbsp;</span>
              <span style={{ color: "#3fb950" }}>Live.</span>
            </div>
            <div
              style={{
                marginTop: 14,
                fontSize: 17,
                lineHeight: 1.4,
                color: "#7d8590",
                maxWidth: 880,
                fontWeight: 400,
              }}
            >
              Real-time heatmap of every trade from 10,000+ top wallets. Drill
              from a hot cell to the markets driving it.
            </div>
          </div>

          {/* ── Bottom: heatmap panel + stats row, pushed to bottom ──
              Satori (the @vercel/og renderer) doesn't support
              display: grid, and nested flex with `flex: 1` cells gets
              quirky on cell distribution — use explicit pixel
              dimensions throughout. The 1200×630 frame stays fixed,
              so hardcoding cell sizes is correct here. ── */}
          <div
            style={{
              marginTop: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 14,
                padding: 14,
                border: "1px solid #30363d",
                borderRadius: 14,
                background:
                  "linear-gradient(180deg, rgba(22,27,34,0.92) 0%, rgba(22,27,34,0.78) 100%)",
              }}
            >
              {/* Category pills column — 110×200px, 5 pills × 36px tall
                  plus 4 × 5px gaps. */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                  width: 110,
                  flexShrink: 0,
                }}
              >
                {CATS.map((c) => (
                  <div
                    key={c.label}
                    style={{
                      width: 110,
                      height: 36,
                      fontFamily: "ui-monospace, Menlo, monospace",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: 1.4,
                      textTransform: "uppercase",
                      padding: "0 10px",
                      borderRadius: 5,
                      display: "flex",
                      alignItems: "center",
                      background: c.bg,
                      color: c.color,
                      border: `1px solid ${c.border}`,
                      boxSizing: "border-box",
                    }}
                  >
                    {c.label}
                  </div>
                ))}
              </div>

              {/* 5×12 cell grid. 936×200px content area, 12 cells per
                  row at 73px wide × 36px tall, 5px gaps. Stacked as 5
                  flex rows so satori doesn't have to do grid. */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                  width: 936,
                  height: 200,
                }}
              >
                {ROWS.map((row, ri) => (
                  <div
                    key={ri}
                    style={{ display: "flex", gap: 5, height: 36 }}
                  >
                    {row.map((cls, ci) => (
                      <div
                        key={ci}
                        style={{
                          width: 73,
                          height: 36,
                          borderRadius: 5,
                          border: "1px solid rgba(255,255,255,0.02)",
                          background: "#1f2530",
                          boxSizing: "border-box",
                          ...(CELL_STYLES[cls] ?? {}),
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Stats row. */}
            <div
              style={{
                display: "flex",
                gap: 22,
                alignItems: "center",
                fontFamily: "ui-monospace, Menlo, monospace",
                fontSize: 12,
                color: "#8b949e",
                letterSpacing: 0.8,
                paddingLeft: 4,
              }}
            >
              <span style={{ display: "flex" }}>
                <span style={{ color: "#e6edf3", fontWeight: 500 }}>$2.8M</span>
                <span>&nbsp;tracked</span>
              </span>
              <span style={{ color: "#30363d" }}>·</span>
              <span style={{ display: "flex" }}>
                <span style={{ color: "#e6edf3", fontWeight: 500 }}>10K+</span>
                <span>&nbsp;whales</span>
              </span>
              <span style={{ color: "#30363d" }}>·</span>
              <span style={{ display: "flex" }}>
                <span style={{ color: "#e6edf3", fontWeight: 500 }}>9</span>
                <span>&nbsp;categories</span>
              </span>
              <span style={{ color: "#30363d" }}>·</span>
              <span style={{ display: "flex" }}>
                <span style={{ color: "#e6edf3", fontWeight: 500 }}>24h</span>
                <span>&nbsp;window</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      // Pass loaded SpaceGrotesk faces. Empty array falls back to the
      // built-in @vercel/og sans (Inter-ish), so the route still
      // renders even if /public/fonts is missing.
      ...(fonts.length > 0 ? { fonts } : {}),
    },
  );
}

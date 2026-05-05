import { TOKENS } from "@/lib/tokens";
import { MockShell } from "./MockShell";

/** Mock for the LIVE-mode feature row. Static PnL-tinted cells with a
 *  "trade just landed" callout pinned to the rightmost (now) column.
 *  Shows an L2 SPORTS drill (subcategories) so the visual proves the
 *  product goes deeper than just top-level categories. */
export function LiveHeatmapMock() {
  const rows: ReadonlyArray<{ label: string; tilt: number }> = [
    { label: "NBA",     tilt:  0.42 },
    { label: "NFL",     tilt: -0.55 },
    { label: "EPL",     tilt:  0.30 },
    { label: "UCL",     tilt: -0.20 },
    { label: "MLB",     tilt:  0.55 },
    { label: "TENNIS",  tilt: -0.40 },
    { label: "F1",      tilt:  0.10 },
  ];
  const COLS = 12;
  // Time labels along the bottom — only a handful drawn so they don't crowd.
  const timeLabels = ["−55m", "", "", "−40m", "", "", "−25m", "", "", "−10m", "", "now"];
  // The "trade just landed" callout pins to this row+col so the visual
  // says "fresh signal arrived → cell flashed → tooltip popped".
  const FRESH_ROW = 4; // MLB — bright green row, draws the eye
  const FRESH_COL = COLS - 1; // rightmost = "now"

  return (
    <MockShell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 9, color: TOKENS.textMuted, fontFamily: TOKENS.mono, letterSpacing: 0.5, textTransform: "uppercase" }}>
          {"LIVE · 1h · "}
          <span style={{ color: TOKENS.accent }}>SPORTS</span>
          {" › subcategories"}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9, color: TOKENS.pos, fontFamily: TOKENS.mono, letterSpacing: 0.4, textTransform: "uppercase", fontWeight: 700 }}>
          <span style={{ width: 5, height: 5, borderRadius: 5, background: TOKENS.pos, boxShadow: `0 0 6px ${TOKENS.pos}`, animation: "livePulse 1.4s ease-in-out infinite" }} />
          streaming
        </span>
      </div>
      <div style={{ position: "relative" }}>
        <div style={{ display: "grid", gridTemplateColumns: `64px repeat(${COLS}, 1fr)`, gap: 3 }}>
          {rows.map((r, ri) => (
            <Row key={r.label} row={r} ri={ri} fresh={ri === FRESH_ROW} cols={COLS} freshCol={FRESH_COL} />
          ))}
        </div>
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -2,
            bottom: 0,
            right: `calc((100% - 64px - 3px) / ${COLS} / 2)`,
            transform: "translateX(50%)",
            width: 1,
            background: TOKENS.accent,
            opacity: 0.45,
            pointerEvents: "none",
          }}
        />
        <FreshCallout col={FRESH_COL} cols={COLS} />
      </div>
      <div
        style={{
          marginTop: 6,
          display: "grid",
          gridTemplateColumns: `64px repeat(${COLS}, 1fr)`,
          gap: 3,
          fontSize: 8,
          fontFamily: TOKENS.mono,
          color: TOKENS.textMuted,
        }}
      >
        <span />
        {timeLabels.map((t, i) => (
          <span
            key={i}
            style={{
              textAlign: "center",
              color: i === COLS - 1 ? TOKENS.accent : TOKENS.textMuted,
              fontWeight: i === COLS - 1 ? 700 : 400,
            }}
          >
            {t}
          </span>
        ))}
      </div>
      <style>{`
        @keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes freshFlash {
          0%   { box-shadow: 0 0 0 0 rgba(63,185,80,0.7); transform: scale(1); }
          50%  { box-shadow: 0 0 0 5px rgba(63,185,80,0.0); transform: scale(1.06); }
          100% { box-shadow: 0 0 0 0 rgba(63,185,80,0); transform: scale(1); }
        }
      `}</style>
    </MockShell>
  );
}

function Row({
  row,
  ri,
  fresh,
  cols,
  freshCol,
}: {
  row: { label: string; tilt: number };
  ri: number;
  fresh: boolean;
  cols: number;
  freshCol: number;
}) {
  return (
    <>
      <div
        style={{
          background: TOKENS.panel2,
          color: TOKENS.textSec,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 0.5,
          display: "flex",
          alignItems: "center",
          paddingLeft: 8,
          borderRadius: 3,
          border: `1px solid ${TOKENS.border}`,
          height: 26,
        }}
      >
        {row.label}
      </div>
      {Array.from({ length: cols }).map((_, i) => {
        const recency = (i + 1) / cols;
        const phase = Math.sin(ri * 1.3 + i * 0.5) * 0.4;
        const signed = Math.max(-1, Math.min(1, (row.tilt + phase) * (0.55 + recency * 0.45)));
        const a = Math.abs(signed);
        const isQuiet = a < 0.06;
        const baseColor = isQuiet
          ? "#30363d"
          : signed > 0
            ? "#3fb950"
            : "#f85149";
        const baseAlpha = isQuiet ? 0.35 : 0.22 + a * 0.7;
        const isFresh = fresh && i === freshCol;
        return (
          <div
            key={i}
            style={{
              height: 26,
              borderRadius: 3,
              background: baseColor,
              opacity: baseAlpha,
              position: "relative",
              animation: isFresh ? "freshFlash 1.6s ease-out infinite" : undefined,
              outline: isFresh ? `1.5px solid ${TOKENS.pos}` : undefined,
              outlineOffset: isFresh ? "-1px" : undefined,
              zIndex: isFresh ? 1 : 0,
            }}
          />
        );
      })}
    </>
  );
}

function FreshCallout({ col, cols }: { col: number; cols: number }) {
  return (
    <div
      style={{
        position: "absolute",
        right: `calc((100% - 64px - 3px) * ${1 - (col + 0.5) / cols})`,
        transform: "translate(50%, -50%)",
        top: -2,
        background: TOKENS.panel,
        border: `1px solid ${TOKENS.pos}`,
        borderRadius: 6,
        padding: "5px 8px",
        fontSize: 10,
        color: TOKENS.text,
        fontFamily: TOKENS.mono,
        fontWeight: 700,
        whiteSpace: "nowrap",
        boxShadow: "0 6px 18px rgba(0,0,0,0.5)",
        pointerEvents: "none",
      }}
    >
      <span style={{ color: TOKENS.pos }}>↑ +$148k</span>
      <span style={{ color: TOKENS.textMuted, margin: "0 4px" }}>·</span>
      <span style={{ color: TOKENS.text }}>Theo4 · Yankees</span>
    </div>
  );
}

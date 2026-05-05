import { TOKENS } from "@/lib/tokens";
import { MockShell } from "./MockShell";

/** Mock for PATTERN-mode feature row. Bars + curve overlay on a 24h
 *  hour-axis — visually distinct from LIVE's heatmap-tape. */
export function PatternMock() {
  const HOURS = 12; // each col = 2-hour slot
  // Bell-curved averages, peak at slot 7 (≈14 UTC) to match the copy.
  const heights: number[] = Array.from({ length: HOURS }, (_, i) => {
    const dist = Math.abs(i - 7) / 7;
    const bell = 1 - dist * dist;
    const noise = (Math.sin(i * 1.3) + 1) / 2 * 0.08;
    return Math.max(0.08, bell * 0.92 + noise);
  });
  const W = 320;
  const H = 80;
  const padX = 10;
  const innerW = W - padX * 2;
  const barW = innerW / HOURS - 4;

  const linePath = heights
    .map((h, i) => {
      const x = padX + (i + 0.5) * (innerW / HOURS);
      const y = H - h * (H - 14) - 4;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <MockShell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 9, color: TOKENS.textMuted, fontFamily: TOKENS.mono, letterSpacing: 0.5, textTransform: "uppercase" }}>
          PATTERN · HOUR · 30-day average
        </span>
        <span style={{ fontSize: 9, color: TOKENS.accent, fontFamily: TOKENS.mono, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 700 }}>
          ↻ cycles
        </span>
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {[0.33, 0.66, 1].map((g, i) => (
          <line
            key={i}
            x1={padX}
            x2={W - padX}
            y1={H - g * (H - 14) - 4}
            y2={H - g * (H - 14) - 4}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={0.5}
            strokeDasharray="2 3"
          />
        ))}
        {heights.map((h, i) => {
          const x = padX + i * (innerW / HOURS) + 2;
          const y = H - h * (H - 14) - 4;
          const barH = h * (H - 14);
          const isPeak = i === 7;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barW}
              height={barH}
              rx={2}
              fill={isPeak ? TOKENS.accent : "rgba(240,180,41,0.55)"}
              opacity={isPeak ? 1 : 0.55 + h * 0.4}
            />
          );
        })}
        <path d={linePath} fill="none" stroke={TOKENS.text} strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
        {heights.map((h, i) => {
          const x = padX + (i + 0.5) * (innerW / HOURS);
          const y = H - h * (H - 14) - 4;
          return <circle key={i} cx={x} cy={y} r={1.6} fill={TOKENS.text} opacity={0.85} />;
        })}
        <line
          x1={padX + 7.5 * (innerW / HOURS)}
          x2={padX + 7.5 * (innerW / HOURS)}
          y1={4}
          y2={H - 14}
          stroke={TOKENS.accent}
          strokeWidth={0.6}
          strokeDasharray="2 2"
          opacity={0.6}
        />
      </svg>

      <div
        style={{
          marginTop: 4,
          padding: `0 ${padX}px`,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 8,
          fontFamily: TOKENS.mono,
          color: TOKENS.textMuted,
          letterSpacing: 0.4,
        }}
      >
        {["00", "04", "08", "12", "16", "20"].map((h, i) => (
          <span key={h} style={{ color: i === 3 ? TOKENS.accent : TOKENS.textMuted, fontWeight: i === 3 ? 700 : 400 }}>
            {h}{i === 3 ? "↑" : ""}
          </span>
        ))}
      </div>

      <div style={{ marginTop: 10, fontSize: 10, color: TOKENS.textSec, lineHeight: 1.4, padding: "8px 10px", background: TOKENS.panel2, border: `1px solid ${TOKENS.border}`, borderRadius: 6 }}>
        <span style={{ color: TOKENS.text, fontWeight: 600 }}>Crypto whales fire 14:00–16:00 UTC.</span>{" "}
        <span style={{ color: TOKENS.textSec }}>2.4× more active than the daily mean.</span>
      </div>
    </MockShell>
  );
}

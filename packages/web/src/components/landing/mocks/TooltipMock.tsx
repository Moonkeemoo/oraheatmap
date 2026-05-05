import { TOKENS } from "@/lib/tokens";
import { MockShell } from "./MockShell";

/** Mock for the "Lock-and-compare" feature row — compact replica of the
 *  real lock-on-click tooltip with stat header, sparkline, mini cycle
 *  histogram, top whales rows, top markets rows. Synthetic. */
export function TooltipMock() {
  const sparkPoints = [12, 18, 9, 22, 28, 19, 35, 31, 44, 38, 52, 49];
  const W = 110;
  const H = 28;
  const max = Math.max(...sparkPoints);
  const min = Math.min(...sparkPoints);
  const sxOf = (i: number): number => (i / (sparkPoints.length - 1)) * W;
  const syOf = (v: number): number => H - ((v - min) / (max - min || 1)) * H;
  const sparkPath = sparkPoints
    .map((v, i) => `${i === 0 ? "M" : "L"}${sxOf(i).toFixed(1)},${syOf(v).toFixed(1)}`)
    .join(" ");

  return (
    <MockShell>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 9,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: TOKENS.textMuted,
          fontWeight: 700,
          paddingBottom: 8,
          borderBottom: `1px solid ${TOKENS.border}`,
        }}
      >
        <span style={{ color: "#f0b429" }}>● CRYPTO · 14:00 UTC</span>
        <span style={{ color: TOKENS.textMuted }}>🔒 click to lock</span>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 10 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: TOKENS.text, fontFamily: '"Space Grotesk", -apple-system, sans-serif', letterSpacing: -0.5, lineHeight: 1 }}>
            $2.4M
          </div>
          <div style={{ fontSize: 10, color: TOKENS.textMuted, fontFamily: TOKENS.mono, marginTop: 2 }}>
            47 trades · 12 unique whales
          </div>
        </div>
        <svg width={W} height={H} style={{ display: "block" }}>
          <path d={sparkPath} fill="none" stroke={TOKENS.accent} strokeWidth={1.4} strokeLinejoin="round" />
        </svg>
      </div>

      <div style={{ marginTop: 12, fontSize: 8, letterSpacing: 0.5, textTransform: "uppercase", color: TOKENS.textMuted, fontWeight: 700, marginBottom: 4 }}>
        How this hour usually looks · 30-day
      </div>
      <div style={{ display: "flex", gap: 2, height: 18, alignItems: "flex-end" }}>
        {[0.3, 0.45, 0.6, 0.4, 0.7, 0.85, 1.0, 0.92, 0.78, 0.55, 0.42, 0.3].map((h, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${h * 100}%`,
              background: i === 6 ? TOKENS.accent : "rgba(240,180,41,0.35)",
              borderRadius: 2,
            }}
          />
        ))}
      </div>

      <div style={{ marginTop: 12, fontSize: 8, letterSpacing: 0.5, textTransform: "uppercase", color: TOKENS.textMuted, fontWeight: 700, marginBottom: 6 }}>
        Top whales in this cell
      </div>
      {[
        { name: "Theo4 ✓",     pnl: "+$22k",  vol: "$140k", color: "#f0b429" },
        { name: "@PrincessOfCo", pnl: "+$18k", vol: "$98k",  color: "#58a6ff" },
        { name: "GammaGod",    pnl: "+$11k",  vol: "$74k",  color: "#3fb950" },
      ].map((w) => (
        <div
          key={w.name}
          style={{
            display: "grid",
            gridTemplateColumns: "16px 1fr auto auto",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            paddingBottom: 5,
          }}
        >
          <span style={{ width: 12, height: 12, borderRadius: 12, background: w.color }} />
          <span style={{ color: TOKENS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</span>
          <span style={{ fontFamily: TOKENS.mono, fontSize: 10, color: TOKENS.textMuted }}>{w.vol}</span>
          <span style={{ fontFamily: TOKENS.mono, fontSize: 11, color: TOKENS.pos, fontWeight: 700 }}>{w.pnl}</span>
        </div>
      ))}

      <div style={{ marginTop: 6, paddingTop: 8, borderTop: `1px solid ${TOKENS.border}`, fontSize: 8, letterSpacing: 0.5, textTransform: "uppercase", color: TOKENS.textMuted, fontWeight: 700, marginBottom: 6 }}>
        Top markets
      </div>
      {[
        { q: "Bitcoin Up or Down · 2:30PM ET",       v: "$1.1M" },
        { q: "Will BTC close above $112k on May 30?", v: "$680k" },
      ].map((m) => (
        <div
          key={m.q}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            paddingBottom: 4,
          }}
        >
          <span style={{ color: TOKENS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.q}</span>
          <span style={{ fontFamily: TOKENS.mono, fontSize: 10, color: TOKENS.textSec }}>{m.v}</span>
        </div>
      ))}
    </MockShell>
  );
}

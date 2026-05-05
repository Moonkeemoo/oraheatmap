import { TOKENS } from "@/lib/tokens";
import { MockShell } from "./MockShell";

/** Mock for the "Whale dossier" feature row. Mirrors the WhaleDrawer:
 *  header + 4-stat row + 90d balance chart + category mix bar +
 *  positions strip. Synthetic data only. */
export function WhaleProfileMock() {
  // Synthetic balance curve — visually credible, ends positive.
  const points = [0, 8, 5, 14, 22, 18, 30, 41, 38, 55, 62, 70, 84];
  const max = Math.max(...points);
  const min = Math.min(...points, 0);
  const W = 280;
  const H = 60;
  const xOf = (i: number): number => (i / (points.length - 1)) * W;
  const yOf = (v: number): number => H - ((v - min) / (max - min)) * H;
  const path = points.map((v, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  const area = `${path} L${W},${H} L0,${H} Z`;

  const mix: ReadonlyArray<{ cat: string; pct: number; color: string }> = [
    { cat: "Politics", pct: 0.42, color: "#58a6ff" },
    { cat: "Crypto",   pct: 0.28, color: "#f0b429" },
    { cat: "Sports",   pct: 0.18, color: "#3fb950" },
    { cat: "Other",    pct: 0.12, color: "#7d8590" },
  ];

  return (
    <MockShell>
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 10, borderBottom: `1px solid ${TOKENS.border}` }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 32,
            background: "linear-gradient(135deg, #f0b429, #f85149)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#1a1410",
            fontSize: 12,
            fontWeight: 700,
            fontFamily: TOKENS.mono,
          }}
        >
          T4
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: TOKENS.text, display: "flex", gap: 4, alignItems: "center" }}>
            Theo4 <span style={{ color: TOKENS.accent, fontSize: 10 }}>✓</span>
            <span style={{ color: TOKENS.link, fontSize: 10, fontFamily: TOKENS.mono, marginLeft: 6, fontWeight: 500 }}>@theo4</span>
          </div>
          <div style={{ fontSize: 10, color: TOKENS.textMuted, fontFamily: TOKENS.mono }}>0xa1b2…f9c3</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, padding: "10px 0" }}>
        {[
          { label: "Signals", value: "412",   color: TOKENS.text },
          { label: "Volume",  value: "$2.1M", color: TOKENS.text },
          { label: "PnL",     value: "+$84k", color: TOKENS.pos },
          { label: "Win",     value: "62%",   color: TOKENS.pos },
        ].map((s) => (
          <div key={s.label}>
            <div style={{ fontSize: 8, letterSpacing: 0.5, textTransform: "uppercase", color: TOKENS.textMuted, fontWeight: 700 }}>{s.label}</div>
            <div style={{ fontSize: 13, color: s.color, fontWeight: 700, marginTop: 2, fontFamily: TOKENS.mono }}>{s.value}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 8, letterSpacing: 0.5, textTransform: "uppercase", color: TOKENS.textMuted, fontWeight: 700, marginBottom: 4 }}>
        Balance growth · 90 days
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        <line
          x1={0}
          x2={W}
          y1={yOf(0)}
          y2={yOf(0)}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={0.5}
          strokeDasharray="2 2"
        />
        <path d={area} fill="rgba(63,185,80,0.18)" />
        <path d={path} fill="none" stroke={TOKENS.pos} strokeWidth={1.6} strokeLinejoin="round" />
        <circle cx={xOf(points.length - 1)} cy={yOf(points[points.length - 1]!)} r={2.5} fill={TOKENS.pos} />
      </svg>
      <div style={{ fontSize: 8, letterSpacing: 0.5, textTransform: "uppercase", color: TOKENS.textMuted, fontWeight: 700, marginTop: 12, marginBottom: 6 }}>
        Category mix · by volume
      </div>
      <div
        style={{
          display: "flex",
          width: "100%",
          height: 5,
          borderRadius: 3,
          overflow: "hidden",
          marginBottom: 6,
        }}
      >
        {mix.map((m) => (
          <div key={m.cat} style={{ width: `${m.pct * 100}%`, background: m.color }} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 10, color: TOKENS.textSec }}>
        {mix.map((m) => (
          <span key={m.cat} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
            <span style={{ width: 6, height: 6, borderRadius: 6, background: m.color }} />
            {m.cat} {Math.round(m.pct * 100)}%
          </span>
        ))}
      </div>
      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: `1px solid ${TOKENS.border}`,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: TOKENS.textMuted,
          fontFamily: TOKENS.mono,
        }}
      >
        <span><strong style={{ color: TOKENS.text }}>5</strong> open positions</span>
        <span><strong style={{ color: TOKENS.text }}>41</strong> trades · 7d</span>
        <span><strong style={{ color: TOKENS.pos }}>+$12.4k</strong> · 24h</span>
      </div>
    </MockShell>
  );
}

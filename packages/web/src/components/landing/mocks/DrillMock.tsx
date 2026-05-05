import { TOKENS } from "@/lib/tokens";
import { MockShell } from "./MockShell";

/** Mock for the "One click to the source" feature row — L1 → L2 → L3
 *  breadcrumb with synthetic per-market rows fading by relevance. */
export function DrillMock() {
  return (
    <MockShell>
      <div style={{ fontSize: 10, color: TOKENS.textMuted, fontFamily: TOKENS.mono, marginBottom: 10 }}>
        Crypto <span style={{ color: TOKENS.textSec }}>›</span> Bitcoin <span style={{ color: TOKENS.text }}>›</span> Markets
      </div>
      {[
        { q: "Bitcoin Up or Down · 2:30PM ET",        v: "$148.2k", a: 0.95 },
        { q: "Will BTC close above $112k on May 30?", v: "$92.4k",  a: 0.78 },
        { q: "BTC reach $120k in May 2026?",          v: "$54.1k",  a: 0.55 },
        { q: "Bitcoin Up or Down · 3:00PM ET",        v: "$31.8k",  a: 0.40 },
      ].map((m, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            alignItems: "center",
            gap: 10,
            padding: "8px 10px",
            background: TOKENS.panel2,
            borderRadius: 6,
            marginBottom: 6,
            borderLeft: `3px solid ${TOKENS.accent}`,
            opacity: m.a,
          }}
        >
          <span style={{ fontSize: 12, color: TOKENS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {m.q}
          </span>
          <span style={{ fontSize: 11, color: TOKENS.textSec, fontFamily: TOKENS.mono }}>{m.v}</span>
        </div>
      ))}
    </MockShell>
  );
}

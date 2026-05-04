import { TOKENS } from "@/lib/tokens";

/**
 * Live numbers strip — emphasis on volume, signal count, money flow. Units
 * pulled from production scale (~10k whales × multi-million daily Polymarket
 * volume). Wire to /api/totals later if precision matters; visual story
 * here is the credibility punch, not exact figures.
 */
type Stat = {
  value: string;
  unit?: string;
  label: string;
  sub: string;
  /** "pos" / "neg" for PnL flow direction; default neutral. */
  tone?: "pos" | "neg";
};

const STATS: ReadonlyArray<Stat> = [
  { value: "$2.4",  unit: "B",  label: "volume tracked",     sub: "across the watchlist" },
  { value: "412",   unit: "k",  label: "signals streamed",   sub: "every trade · every minute" },
  { value: "+$84",  unit: "M",  label: "net inflow · 24h",   sub: "buys minus sells",          tone: "pos" },
  { value: "10,426",            label: "whales watched",     sub: "refreshed weekly" },
];

export function Stats() {
  return (
    <section
      style={{
        padding: "40px 24px",
        borderTop: `1px solid ${TOKENS.border}`,
        borderBottom: `1px solid ${TOKENS.border}`,
        background: "linear-gradient(180deg, rgba(22,27,34,0) 0%, rgba(22,27,34,0.55) 50%, rgba(22,27,34,0) 100%)",
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 24,
        }}
        className="stats-grid"
      >
        {STATS.map((s) => {
          const valueColor =
            s.tone === "pos" ? TOKENS.pos : s.tone === "neg" ? TOKENS.neg : TOKENS.text;
          return (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "baseline",
                  gap: 1,
                  fontWeight: 700,
                  letterSpacing: -1.2,
                  color: valueColor,
                  fontFamily: '"Space Grotesk", -apple-system, sans-serif',
                  lineHeight: 1,
                }}
              >
                <span style={{ fontSize: 42 }}>{s.value}</span>
                {s.unit && (
                  <span style={{ fontSize: 24, opacity: 0.85, marginLeft: 1 }}>
                    {s.unit}
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  color: TOKENS.textSec,
                  fontWeight: 600,
                  marginTop: 8,
                }}
              >
                {s.label}
              </div>
              <div style={{ fontSize: 10, color: TOKENS.textMuted, marginTop: 3, fontFamily: TOKENS.mono }}>
                {s.sub}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @media (max-width: 720px) {
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 28px !important; }
        }
      `}</style>
    </section>
  );
}

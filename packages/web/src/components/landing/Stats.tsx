import { TOKENS } from "@/lib/tokens";

const STATS: ReadonlyArray<{ value: string; label: string; sub?: string }> = [
  { value: "10,426", label: "wallets watched",   sub: "refreshed weekly" },
  { value: "<10s",   label: "trade → chart",     sub: "RTDS firehose" },
  { value: "90d",    label: "history retained",  sub: "PnL · positions" },
  { value: "9",      label: "leaderboard cats",  sub: "Sports → Climate" },
];

export function Stats() {
  return (
    <section
      style={{
        padding: "32px 24px",
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
        {STATS.map((s) => (
          <div key={s.label} style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 36,
                fontWeight: 700,
                letterSpacing: -1,
                color: TOKENS.text,
                fontFamily: '"Space Grotesk", -apple-system, sans-serif',
                lineHeight: 1.05,
              }}
            >
              {s.value}
            </div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: TOKENS.textSec,
                fontWeight: 600,
                marginTop: 6,
              }}
            >
              {s.label}
            </div>
            {s.sub && (
              <div style={{ fontSize: 10, color: TOKENS.textMuted, marginTop: 3, fontFamily: TOKENS.mono }}>
                {s.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      <style>{`
        @media (max-width: 720px) {
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 28px !important; }
        }
      `}</style>
    </section>
  );
}

import { TOKENS } from "@/lib/tokens";
import { SectionHeading } from "./Features";

const STEPS: ReadonlyArray<{ n: string; title: string; body: string }> = [
  {
    n: "01",
    title: "We watch 10,426 wallets.",
    body: "Top traders by all-time PnL across all 9 Polymarket leaderboard categories. Refreshed weekly — newcomers in, dropouts out, aliases kept for history.",
  },
  {
    n: "02",
    title: "Every trade hits us in seconds.",
    body: "We listen to Polymarket's RTDS firehose — the same on-chain stream their dashboard uses. Match against the watchlist, enrich with category metadata, write to TimescaleDB.",
  },
  {
    n: "03",
    title: "You see it, drill it, follow it.",
    body: "Heatmap cells light up. Click a cell to see the markets behind it. Click a market to see the whales pushing it. Click a whale to see their balance curve.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" style={{ padding: "80px 24px", background: TOKENS.panel }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <SectionHeading
          eyebrow="How it works"
          title="From firehose to chart in under 10 seconds."
          sub="No queues, no polling, no overnight refresh — actual real time, end-to-end."
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 28,
            marginTop: 48,
          }}
          className="how-grid"
        >
          {STEPS.map((s) => (
            <div
              key={s.n}
              style={{
                background: TOKENS.panel2,
                border: `1px solid ${TOKENS.border}`,
                borderRadius: 12,
                padding: "24px 22px",
                transition: "border-color .15s, transform .15s",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontFamily: TOKENS.mono,
                  color: TOKENS.accent,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  marginBottom: 12,
                }}
              >
                {s.n}
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: TOKENS.text,
                  marginBottom: 8,
                  letterSpacing: -0.3,
                  fontFamily: '"Space Grotesk", -apple-system, sans-serif',
                  lineHeight: 1.25,
                }}
              >
                {s.title}
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: TOKENS.textSec,
                }}
              >
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @media (max-width: 880px) {
          .how-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}

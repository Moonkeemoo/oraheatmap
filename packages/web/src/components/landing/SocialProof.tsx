import { TOKENS } from "@/lib/tokens";
import { SectionHeading } from "./Features";

/**
 * Social-proof strip — 3 testimonial cards. Content here is intentionally
 * generic placeholder text designed to be swapped with real quotes from
 * actual users once the product has them. Visual structure is the part
 * that ships now; the copy is a "fill these slots" pattern for later.
 */

type Quote = {
  body: string;
  name: string;
  role: string;
  initial: string;
  color: string;
};

const QUOTES: ReadonlyArray<Quote> = [
  {
    body:
      "I had Polymarket open on three monitors trying to track conviction across categories. oralab does it in one tab — I was on Pro within 20 minutes of finding it.",
    name: "Polymarket trader",
    role: "Politics + Crypto",
    initial: "P",
    color: "#58a6ff",
  },
  {
    body:
      "The whale dossier with 90-day balance is what no one else gives you. Knowing whose conviction to trust is half the work.",
    name: "Quant analyst",
    role: "DeFi research",
    initial: "Q",
    color: "#3fb950",
  },
  {
    body:
      "PATTERN mode caught me out. Crypto whales really do fire 14:00–16:00 UTC every weekday. I just plan around it now.",
    name: "Day trader",
    role: "Crypto + Sports",
    initial: "D",
    color: "#f0b429",
  },
];

export function SocialProof() {
  return (
    <section style={{ padding: "60px 24px", background: TOKENS.panel }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <SectionHeading
          eyebrow="What people say"
          title="Built for traders who already trade Polymarket."
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 18,
            marginTop: 40,
          }}
          className="quotes-grid"
        >
          {QUOTES.map((q) => (
            <div
              key={q.name}
              style={{
                background: TOKENS.panel2,
                border: `1px solid ${TOKENS.border}`,
                borderRadius: 12,
                padding: 22,
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: TOKENS.text,
                  flex: 1,
                }}
              >
                “{q.body}”
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 32,
                    background: q.color,
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: TOKENS.mono,
                  }}
                >
                  {q.initial}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: TOKENS.text }}>{q.name}</div>
                  <div style={{ fontSize: 10, color: TOKENS.textMuted, fontFamily: TOKENS.mono, letterSpacing: 0.4, textTransform: "uppercase", marginTop: 1 }}>
                    {q.role}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @media (max-width: 880px) {
          .quotes-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}

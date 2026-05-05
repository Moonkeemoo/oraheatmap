import { TOKENS } from "@/lib/tokens";
import { MockShell } from "./MockShell";

/** Mock for the "Top highlights" feature row — replicates the cell-drawer
 *  section that surfaces standout markets/trades for the open row over the
 *  whole header timerange. Each row has a multiplier chip to convey the
 *  "above average" criterion. Synthetic — no live data. */
export function HighlightsMock() {
  const items: ReadonlyArray<{
    icon: string;
    label: string;
    value: string;
    mult: string;
    color: string;
  }> = [
    { icon: "₿", label: "Will BTC hit $150k by July?", value: "$3.1M", mult: "12×", color: "#f7931a" },
    { icon: "🇺🇸", label: "Trump signs executive order this week", value: "$2.4M", mult: "9.4×", color: "#58a6ff" },
    { icon: "⚽", label: "Chelsea win Premier League", value: "$1.8M", mult: "7.2×", color: "#22c55e" },
    { icon: "🏀", label: "Lakers vs Celtics — Lakers", value: "$1.1M", mult: "4.5×", color: "#a78bfa" },
    { icon: "⛅", label: "NYC temperature > 25°C on Friday", value: "$420k", mult: "1.7×", color: "#0ea5e9" },
  ];

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
        <span>Top highlights</span>
        <span style={{ color: TOKENS.textSec }}>24h · by USD volume</span>
      </div>

      <div style={{ marginTop: 6 }}>
        {items.map((it, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "20px 1fr auto auto",
              alignItems: "center",
              columnGap: 8,
              padding: "6px 4px",
              borderBottom: i === items.length - 1 ? "none" : `1px solid ${TOKENS.border}`,
              fontSize: 11,
            }}
          >
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                background: it.color + "33",
                color: it.color,
                fontSize: 12,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
              }}
            >
              {it.icon}
            </span>
            <span
              style={{
                color: TOKENS.text,
                fontSize: 11,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={it.label}
            >
              {it.label}
            </span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.3,
                color: TOKENS.accent,
                background: TOKENS.panel2,
                border: `1px solid ${TOKENS.border}`,
                padding: "1px 5px",
                borderRadius: 3,
                fontFamily: TOKENS.mono,
              }}
            >
              {it.mult}
            </span>
            <span
              style={{
                fontFamily: TOKENS.mono,
                color: TOKENS.text,
                fontVariantNumeric: "tabular-nums",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {it.value}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 8,
          fontSize: 9,
          color: TOKENS.textMuted,
          fontFamily: TOKENS.mono,
          letterSpacing: 0.3,
          textAlign: "center",
        }}
      >
        items shown only when ≥ 1.5× the row average
      </div>
    </MockShell>
  );
}

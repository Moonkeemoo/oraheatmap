"use client";

import { useEffect, useState } from "react";
import { apiBase } from "@/lib/api";
import { TOKENS } from "@/lib/tokens";

/**
 * Live numbers strip — fetched from /api/landing-stats so the marketing
 * page is honest. Refreshes every 60s on the client; tiny pulse next to
 * the heading communicates "this is live, not a screenshot".
 */
type StatsResponse = {
  totalSignals: number;
  totalVolumeUsd: number;
  netFlow24hUsd: number;
  whalesWatched: number;
  generatedAt: string;
};

type Stat = {
  /** Number portion, formatted. */
  value: string;
  /** Suffix (B/M/k). */
  unit?: string;
  label: string;
  sub: string;
  tone?: "pos" | "neg";
};

export function Stats() {
  const [data, setData] = useState<StatsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch(`${apiBase()}/api/landing-stats`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: StatsResponse | null) => {
          if (cancelled || !j) return;
          setData(j);
        })
        .catch(() => {
          // Fail silent — placeholders below carry the visual weight.
        });
    }
    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const stats: ReadonlyArray<Stat> = data
    ? [
        {
          // Gross BUY-side USD — never negative, so no signed prefix.
          ...formatBigUsd(data.totalVolumeUsd, { signed: false }),
          label: "volume tracked",
          sub: "all-time · all watched whales",
        },
        {
          ...formatBigCount(data.totalSignals),
          label: "signals streamed",
          sub: "all-time · every Buy / Sell",
        },
        {
          // Signed: + when whales are net-buying, − when net-selling.
          ...formatBigUsd(data.netFlow24hUsd, { signed: true }),
          label: "net buy flow",
          sub: "last 24h · buys minus sells",
          tone: data.netFlow24hUsd >= 0 ? "pos" : "neg",
        },
        {
          // Round to a "10,000+" / "20,000+" tier so the figure feels
          // current without implying false precision (corpus shifts as
          // refresh-corpus.ts runs weekly).
          value: roundCorpusUp(data.whalesWatched),
          label: "whales watched",
          sub: "refreshed weekly · top by all-time PnL",
        },
      ]
    : PLACEHOLDER_STATS;

  return (
    <section
      style={{
        padding: "40px 24px",
        borderTop: `1px solid ${TOKENS.border}`,
        borderBottom: `1px solid ${TOKENS.border}`,
        background: "linear-gradient(180deg, rgba(22,27,34,0) 0%, rgba(22,27,34,0.55) 50%, rgba(22,27,34,0) 100%)",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
            marginBottom: 26,
            fontSize: 10,
            letterSpacing: 1.6,
            textTransform: "uppercase",
            color: TOKENS.textMuted,
            fontFamily: TOKENS.mono,
            fontWeight: 700,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 7,
              height: 7,
              borderRadius: 7,
              background: TOKENS.pos,
              boxShadow: `0 0 8px ${TOKENS.pos}`,
              animation: "statsPulse 1.6s ease-in-out infinite",
            }}
          />
          <span>Live · refreshed every minute</span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 24,
          }}
          className="stats-grid"
        >
          {stats.map((s) => {
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
                    <span style={{ fontSize: 24, opacity: 0.85, marginLeft: 1 }}>{s.unit}</span>
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
                <div
                  style={{
                    fontSize: 10,
                    color: TOKENS.textMuted,
                    marginTop: 3,
                    fontFamily: TOKENS.mono,
                  }}
                >
                  {s.sub}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes statsPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.45; transform: scale(0.85); }
        }
        @media (max-width: 720px) {
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 28px !important; }
        }
      `}</style>
    </section>
  );
}

const PLACEHOLDER_STATS: ReadonlyArray<Stat> = [
  { value: "—", label: "volume tracked", sub: "all-time · all watched whales" },
  { value: "—", label: "signals streamed", sub: "all-time · every Buy / Sell" },
  { value: "—", label: "net buy flow", sub: "last 24h · buys minus sells" },
  { value: "—", label: "whales watched", sub: "refreshed weekly · top by all-time PnL" },
];

function formatBigUsd(
  n: number,
  opts: { signed: boolean } = { signed: false },
): { value: string; unit?: string } {
  const sign = opts.signed ? (n < 0 ? "-" : n > 0 ? "+" : "") : n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1e9) return { value: `${sign}$${(abs / 1e9).toFixed(1)}`, unit: "B" };
  if (abs >= 1e6) return { value: `${sign}$${(abs / 1e6).toFixed(0)}`, unit: "M" };
  if (abs >= 1e3) return { value: `${sign}$${(abs / 1e3).toFixed(0)}`, unit: "k" };
  return { value: `${sign}$${Math.round(abs)}` };
}

function formatBigCount(n: number): { value: string; unit?: string } {
  if (n >= 1e6) return { value: (n / 1e6).toFixed(1), unit: "M" };
  if (n >= 1e3) return { value: Math.round(n / 1e3).toString(), unit: "k" };
  return { value: String(n) };
}

/** Floor to the nearest 1k below — "1,847 → 1,000+", "10,426 → 10,000+",
 *  "12,500 → 10,000+". Corpus refreshes weekly so a precise number reads
 *  staler than a "10k+" floor. Returns the comma-formatted string with a
 *  trailing "+". */
function roundCorpusUp(n: number): string {
  if (n < 1000) return `${n}+`;
  const tier = Math.floor(n / 1000) * 1000;
  return `${tier.toLocaleString("en-US")}+`;
}

"use client";

import { useState } from "react";
import { TOKENS } from "@/lib/tokens";
import { SectionHeading } from "./Features";

type QA = { q: string; a: string };

const ITEMS: ReadonlyArray<QA> = [
  {
    q: "Is this financial advice?",
    a: "No. oralab displays public on-chain trade data and Polymarket's public APIs. We don't recommend trades, predict outcomes, or hold funds. Make your own decisions, or consult a qualified professional.",
  },
  {
    q: "How are the 10,426 whales picked?",
    a: "Weekly cron pulls Polymarket's official leaderboard — top 1,500 by all-time PnL across each of 9 categories (Sports, Politics, Crypto, Finance, Tech, Culture, Climate, Mentions, Economics). Dedupe across categories yields ~10,400 unique wallets. Newcomers are added; whales who fall off keep their alias for historical context but stop receiving new tracking.",
  },
  {
    q: "How fast is \"real-time\"?",
    a: "5–10 seconds, end-to-end. We subscribe to Polymarket's RTDS firehose (the same WS stream their dashboard uses), match against the watchlist in-memory, batch-insert to TimescaleDB every 5 seconds, and push to your browser via SSE.",
  },
  {
    q: "Are you affiliated with Polymarket?",
    a: "No. oralab is an independent project. We read public data through their public APIs and on-chain feeds. No partnership, no endorsement.",
  },
  {
    q: "Do you trade or custody funds?",
    a: "No. oralab is read-only. We don't execute trades, hold tokens, take deposits, or run any wallet ourselves. Sign-in with MetaMask is purely for identification — we never request signature on transactions.",
  },
  {
    q: "Will old historical data go away when whales rotate?",
    a: "No. The watchlist for new tracking changes weekly, but every signal we've ever ingested stays in the database. Balance growth charts, PATTERN cycles, and (coming) the Receipts page all run against the full history.",
  },
  {
    q: "Is there an API?",
    a: "Not publicly today. The internal /api/heatmap endpoint powers the dashboard but isn't documented or rate-limit-friendly for external use. A formal API will land alongside Pro tier.",
  },
  {
    q: "Why USDC on Polygon for Pro?",
    a: "Same chain Polymarket users already trade on. Gas is sub-cent. No chargebacks, no card-network friction. We just listen for an on-chain Paid event and flip your account flag.",
  },
];

export function Faq() {
  return (
    <section id="faq" style={{ padding: "80px 24px", background: TOKENS.panel }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <SectionHeading eyebrow="FAQ" title="Common questions, answered honestly." />
        <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 8 }}>
          {ITEMS.map((qa, i) => (
            <FaqItem key={i} qa={qa} defaultOpen={i === 0} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqItem({ qa, defaultOpen }: { qa: QA; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <div
      style={{
        background: TOKENS.panel2,
        border: `1px solid ${TOKENS.border}`,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          color: TOKENS.text,
          fontFamily: "inherit",
          fontSize: 15,
          fontWeight: 600,
          textAlign: "left",
          padding: "16px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          cursor: "pointer",
        }}
      >
        <span>{qa.q}</span>
        <span
          aria-hidden="true"
          style={{
            color: TOKENS.textMuted,
            fontSize: 18,
            fontWeight: 400,
            transition: "transform .15s",
            transform: open ? "rotate(45deg)" : "rotate(0deg)",
            display: "inline-block",
            lineHeight: 1,
          }}
        >
          +
        </span>
      </button>
      {open && (
        <div
          style={{
            padding: "0 18px 18px",
            color: TOKENS.textSec,
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          {qa.a}
        </div>
      )}
    </div>
  );
}

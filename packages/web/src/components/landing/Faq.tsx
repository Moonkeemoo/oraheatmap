"use client";

import { useState } from "react";
import { TOKENS } from "@/lib/tokens";
import { SectionHeading } from "./Features";

type QA = { q: string; a: string };

const ITEMS: ReadonlyArray<QA> = [
  {
    q: "How is this different from Nansen, Arkham, Lookonchain?",
    a: "Those are great — for DEX trades, NFT flips, on-chain transfers. None of them track Polymarket positions. Polymarket runs on a separate order book with its own conviction signal (price = implied probability), and that signal is invisible to a generic on-chain tracker. oralab is built specifically for prediction-market alpha — the same way Nansen is built for DEX alpha.",
  },
  {
    q: "Why prediction markets specifically?",
    a: "Prediction markets price events: elections, fights, fed decisions, weather, sport outcomes. Smart money moves into Polymarket positions days or weeks before mainstream coverage prices the event in. Catching that conviction early is the trade — and the only place to see it is the Polymarket order book, watched by whales who already proved they can read it.",
  },
  {
    q: "How are the 10,426 whales picked?",
    a: "Weekly cron pulls Polymarket's official leaderboard — top 1,500 by all-time PnL across each of 9 categories (Sports, Politics, Crypto, Finance, Tech, Culture, Climate, Mentions, Economics). Dedupe across categories yields ~10,400 unique wallets. Newcomers added, dropouts stop receiving new tracking but keep their alias for historical context.",
  },
  {
    q: "What's the latency, really?",
    a: "5–10 seconds, end-to-end. We subscribe to Polymarket's RTDS firehose — the same WebSocket stream their own dashboard uses — match against the watchlist in-memory (O(1) Set lookup), batch-insert to TimescaleDB every 5s, and push to your browser via SSE. There's no polling, no overnight refresh, no dealer-side bias.",
  },
  {
    q: "Can I get alerts on specific whales or convergence events?",
    a: "Coming with Pro tier — Telegram alerts when N+ tracked whales converge on the same market in a short window, plus per-whale alerts for traders you want to mirror. Whale convergence is one of the strongest signals we see and gets buried during heavy news cycles unless something pings you.",
  },
  {
    q: "Are you affiliated with Polymarket?",
    a: "No. oralab is an independent project. We read public data through Polymarket's public APIs and on-chain feeds. No partnership, no endorsement, no commercial relationship.",
  },
  {
    q: "Do you trade or custody funds?",
    a: "No. oralab is read-only. We don't execute trades, hold tokens, take deposits, or run any wallet ourselves. Sign-in with MetaMask is purely for identification — we never request signature on transactions.",
  },
  {
    q: "Is this financial advice?",
    a: "No. oralab displays public on-chain trade data and Polymarket's public APIs. We don't recommend trades, predict outcomes, or hold funds. Prediction markets are speculative — you can lose all the money you put into them. Make your own decisions, or consult a qualified professional.",
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

"use client";

import { useState } from "react";
import { TOKENS } from "@/lib/tokens";
import { SectionHeading } from "./Features";
import { FAQ_ITEMS, type QA } from "./faq-items";

export function Faq() {
  return (
    <section id="faq" style={{ padding: "80px 24px", background: TOKENS.panel }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <SectionHeading eyebrow="FAQ" title="Common questions, answered honestly." />
        <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 8 }}>
          {FAQ_ITEMS.map((qa, i) => (
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

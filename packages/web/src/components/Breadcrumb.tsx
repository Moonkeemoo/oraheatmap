"use client";

import { categoryMeta } from "@/lib/categories";
import { TOKENS } from "@/lib/tokens";
import type { Category } from "@/lib/types";

export function Breadcrumb({
  drillCategory,
  onBack,
}: {
  drillCategory: Category;
  onBack: () => void;
}) {
  const meta = categoryMeta(drillCategory);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 10,
        fontFamily: TOKENS.font,
        fontSize: 11,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        fontWeight: 700,
        color: TOKENS.textSec,
      }}
    >
      <button
        onClick={onBack}
        style={{
          background: "transparent",
          border: `1px solid ${TOKENS.border}`,
          color: TOKENS.textSec,
          fontFamily: "inherit",
          fontSize: "inherit",
          fontWeight: 700,
          letterSpacing: "inherit",
          textTransform: "inherit",
          padding: "5px 10px",
          borderRadius: 6,
          cursor: "pointer",
          transition: "all .12s",
        }}
      >
        ← All categories
      </button>
      <span style={{ color: TOKENS.borderHi }}>›</span>
      <span
        style={{
          background: meta.color,
          color: "#fff",
          padding: "4px 9px",
          borderRadius: 3,
        }}
      >
        {meta.label}
      </span>
      <span style={{ color: TOKENS.textMuted, fontWeight: 500, textTransform: "none", letterSpacing: 0.3 }}>
        — by subcategory
      </span>
    </div>
  );
}

"use client";

import { categoryMeta } from "@/lib/categories";
import { TOKENS } from "@/lib/tokens";
import type { Category } from "@/lib/types";

/** Three-level breadcrumb:
 *    [← All categories] › CRYPTO         (L2)
 *    [← All categories] › CRYPTO › Bitcoin (L3)
 *  Each crumb is clickable; clicking pops the drill stack to that level. */
export function Breadcrumb({
  drillCategory,
  drillSubcategory,
  drillSubcategoryLabel,
  onBackToTop,
  onBackToCategory,
}: {
  drillCategory: Category;
  drillSubcategory: string | null;
  drillSubcategoryLabel: string | null;
  onBackToTop: () => void;
  onBackToCategory: () => void;
}) {
  const meta = categoryMeta(drillCategory);
  const atL3 = drillSubcategory !== null;
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
        flexWrap: "wrap",
      }}
    >
      <CrumbButton onClick={onBackToTop}>← All categories</CrumbButton>
      <Sep />
      {atL3 ? (
        // L3: parent category becomes a clickable crumb that pops back to L2.
        <CrumbButton onClick={onBackToCategory} bg={meta.color} solid>
          {meta.label}
        </CrumbButton>
      ) : (
        <CrumbBadge bg={meta.color}>{meta.label}</CrumbBadge>
      )}
      {atL3 && (
        <>
          <Sep />
          <CrumbBadge bg={meta.color} dim>
            {drillSubcategoryLabel ?? drillSubcategory}
          </CrumbBadge>
        </>
      )}
      <span
        style={{
          color: TOKENS.textMuted,
          fontWeight: 500,
          textTransform: "none",
          letterSpacing: 0.3,
        }}
      >
        — {atL3 ? "by market" : "by subcategory"}
      </span>
    </div>
  );
}

function CrumbButton({
  onClick,
  bg,
  solid,
  children,
}: {
  onClick: () => void;
  bg?: string;
  solid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: solid && bg ? bg : "transparent",
        border: solid && bg ? "none" : `1px solid ${TOKENS.border}`,
        color: solid && bg ? "#fff" : TOKENS.textSec,
        fontFamily: "inherit",
        fontSize: "inherit",
        fontWeight: 700,
        letterSpacing: "inherit",
        textTransform: "inherit",
        padding: "5px 10px",
        borderRadius: solid && bg ? 3 : 6,
        cursor: "pointer",
        transition: "all .12s",
      }}
      onMouseEnter={(e) => {
        if (solid && bg) (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.15)";
      }}
      onMouseLeave={(e) => {
        if (solid && bg) (e.currentTarget as HTMLButtonElement).style.filter = "none";
      }}
    >
      {children}
    </button>
  );
}

function CrumbBadge({
  bg,
  dim,
  children,
}: {
  bg: string;
  dim?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      style={{
        background: bg,
        color: "#fff",
        padding: "4px 9px",
        borderRadius: 3,
        opacity: dim ? 0.85 : 1,
      }}
    >
      {children}
    </span>
  );
}

function Sep() {
  return <span style={{ color: TOKENS.borderHi }}>›</span>;
}

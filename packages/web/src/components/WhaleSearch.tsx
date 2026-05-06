"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { apiBase } from "@/lib/api";
import { fmtMoneyShort } from "@/lib/format";
import { TOKENS } from "@/lib/tokens";
import { WhaleAvatar } from "./WhaleAvatar";

export type WhaleSearchHit = {
  addr: string;
  alias: string;
  xHandle: string | null;
  verified: boolean;
  profileImage: string | null;
  totalPnl: number;
  totalVol: number;
  matchKind: "addr" | "alias-exact" | "alias-prefix" | "alias-substring" | "xhandle";
};

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const ADDR_RE_PARTIAL = /^0x[0-9a-fA-F]+$/;

/**
 * Whale-finder embedded inside the StatsBar Active Whales / Top Whales
 * popovers. Type by alias, X handle, or 0x address (full or partial).
 * Empty input → caller renders the original popover content via
 * `defaultContent`. Two characters or more → switch to live search
 * results from /api/whales/search. Pasting a full 0x address that's
 * NOT in the corpus shows an "Open address anyway" CTA so the user
 * can still inspect it via the whale drawer (Polymarket gamma data
 * resolves for any wallet).
 */
export function WhaleSearch({
  onPick,
  defaultContent,
}: {
  onPick: (addr: string) => void;
  defaultContent: ReactNode;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ReadonlyArray<WhaleSearchHit>>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced fetch on query change. Cancels any in-flight via
  // per-effect closure so an older response can't overwrite a newer.
  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`${apiBase()}/api/whales/search?q=${encodeURIComponent(trimmed)}&limit=10`, {
        credentials: "include",
      })
        .then((r) => (r.ok ? r.json() : { matches: [] }))
        .then((body: { matches: WhaleSearchHit[] }) => {
          if (cancelled) return;
          setHits(body.matches ?? []);
        })
        .catch(() => {
          if (cancelled) return;
          setHits([]);
        })
        .finally(() => {
          if (cancelled) return;
          setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const trimmed = q.trim();
  const showResults = trimmed.length >= 2;
  const looksLikeFullAddr = ADDR_RE.test(trimmed);
  // True when the user pasted a complete 0x... that isn't on our
  // watchlist — we still let them open the drawer for it.
  const offCorpusAddr =
    looksLikeFullAddr && !hits.some((h) => h.addr.toLowerCase() === trimmed.toLowerCase());

  return (
    <div onMouseDown={(e) => e.stopPropagation()}>
      <div
        style={{
          position: "relative",
          marginBottom: 10,
        }}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or 0x address…"
          autoComplete="off"
          spellCheck={false}
          style={{
            width: "100%",
            padding: "7px 10px 7px 30px",
            background: TOKENS.panel2,
            border: `1px solid ${TOKENS.border}`,
            borderRadius: 6,
            color: TOKENS.text,
            fontSize: 12,
            fontFamily: TOKENS.font,
            outline: "none",
            boxSizing: "border-box",
            transition: "border-color .12s",
          }}
          onFocus={(e) => {
            (e.currentTarget as HTMLInputElement).style.borderColor = TOKENS.borderHi;
          }}
          onBlur={(e) => {
            (e.currentTarget as HTMLInputElement).style.borderColor = TOKENS.border;
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setQ("");
              inputRef.current?.blur();
            } else if (e.key === "Enter") {
              if (offCorpusAddr) {
                onPick(trimmed.toLowerCase());
              } else if (hits.length > 0) {
                onPick(hits[0]!.addr);
              }
            }
          }}
        />
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 9,
            top: "50%",
            transform: "translateY(-50%)",
            color: TOKENS.textMuted,
            fontSize: 12,
            pointerEvents: "none",
          }}
        >
          🔍
        </span>
      </div>

      {!showResults && defaultContent}

      {showResults && loading && hits.length === 0 && (
        <div style={{ fontSize: 11, color: TOKENS.textMuted, padding: "6px 4px" }}>
          searching…
        </div>
      )}

      {showResults && !loading && hits.length === 0 && !offCorpusAddr && (
        <div style={{ fontSize: 11, color: TOKENS.textMuted, padding: "6px 4px", lineHeight: 1.5 }}>
          No whale on the watchlist matches{" "}
          <code style={{ background: TOKENS.panel2, padding: "1px 4px", borderRadius: 3 }}>
            {trimmed.length > 30 ? `${trimmed.slice(0, 28)}…` : trimmed}
          </code>
          .
          {ADDR_RE_PARTIAL.test(trimmed) && trimmed.length < 42 && (
            <> Type the full 42-char address to open it anyway.</>
          )}
        </div>
      )}

      {showResults && hits.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {hits.map((h, i) => (
            <ResultRow key={h.addr} hit={h} index={i} onPick={() => onPick(h.addr)} />
          ))}
        </div>
      )}

      {showResults && offCorpusAddr && (
        <button
          type="button"
          onClick={() => onPick(trimmed.toLowerCase())}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            marginTop: hits.length > 0 ? 8 : 0,
            padding: "8px 10px",
            background: TOKENS.panel2,
            border: `1px dashed ${TOKENS.borderHi}`,
            borderRadius: 6,
            color: TOKENS.text,
            fontSize: 11,
            fontFamily: TOKENS.font,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: 13 }}>↗</span>
          <span>
            Open <code style={{ fontFamily: TOKENS.mono }}>{trimmed.slice(0, 6)}…{trimmed.slice(-4)}</code>
            {hits.length > 0 ? " anyway" : " (off-watchlist)"}
          </span>
        </button>
      )}
    </div>
  );
}

function ResultRow({
  hit,
  index,
  onPick,
}: {
  hit: WhaleSearchHit;
  index: number;
  onPick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onPick();
      }}
      style={{
        display: "grid",
        gridTemplateColumns: "16px 22px 1fr auto",
        alignItems: "center",
        gap: 8,
        padding: "5px 4px",
        cursor: "pointer",
        borderRadius: 4,
        marginLeft: -4,
        marginRight: -4,
        transition: "background .12s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = TOKENS.panel2;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
      title={hit.addr}
    >
      <span
        style={{
          color: TOKENS.textMuted,
          fontFamily: TOKENS.mono,
          fontSize: 10,
          fontWeight: 700,
        }}
      >
        {index + 1}.
      </span>
      <WhaleAvatar profileImage={hit.profileImage} color="#5d6166" size={18} />
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <span
          style={{
            color: TOKENS.text,
            fontFamily: hit.alias.startsWith("0x") ? TOKENS.mono : TOKENS.font,
            fontWeight: 600,
            fontSize: 11,
          }}
        >
          {hit.alias}
        </span>
        {hit.verified && (
          <span style={{ color: TOKENS.accent, marginLeft: 4, fontSize: 10 }} title="verified">
            ✓
          </span>
        )}
        {hit.xHandle && (
          <span
            style={{
              color: TOKENS.textMuted,
              marginLeft: 6,
              fontSize: 10,
              fontFamily: TOKENS.mono,
            }}
          >
            @{hit.xHandle}
          </span>
        )}
      </span>
      <span
        style={{
          color: hit.totalPnl > 0 ? TOKENS.pos : hit.totalPnl < 0 ? TOKENS.neg : TOKENS.textSec,
          fontFamily: TOKENS.mono,
          fontSize: 10,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {hit.totalPnl >= 0 ? "+" : ""}
        {fmtMoneyShort(hit.totalPnl)}
      </span>
    </div>
  );
}

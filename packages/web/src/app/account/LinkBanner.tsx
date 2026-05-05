"use client";

import { useEffect, useState } from "react";
import { TOKENS } from "@/lib/tokens";

const PROVIDER_LABEL: Record<string, string> = {
  github: "GitHub",
  discord: "Discord",
  resend: "Email",
  siwe: "MetaMask",
  telegram: "Telegram",
};

const ERROR_COPY: Record<string, (provider: string) => string> = {
  already_on_another_account: (p) =>
    `That ${PROVIDER_LABEL[p] ?? p} identity is already linked to a different oralab account. Sign in there to disconnect it first, then link it here.`,
  db_write_failed: (p) =>
    `Couldn't write the link for ${PROVIDER_LABEL[p] ?? p}. Try again — if it keeps failing, contact hello@oralab.xyz.`,
};

/**
 * Reads ?linked / ?linkError from the URL on mount and renders a
 * dismissable banner explaining the outcome of the most recent link
 * attempt. Self-clears the query string so a refresh doesn't re-show
 * the banner forever.
 */
export function LinkBanner() {
  const [state, setState] = useState<
    | { kind: "success"; provider: string }
    | { kind: "error"; provider: string; reason: string }
    | null
  >(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const linked = params.get("linked");
    const linkError = params.get("linkError");
    const provider = params.get("provider") ?? linked ?? "";
    if (linked) {
      setState({ kind: "success", provider: linked });
    } else if (linkError) {
      setState({ kind: "error", provider, reason: linkError });
    }
    if (linked || linkError) {
      const url = new URL(window.location.href);
      url.searchParams.delete("linked");
      url.searchParams.delete("linkError");
      url.searchParams.delete("provider");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  if (!state) return null;

  const isErr = state.kind === "error";
  const label = PROVIDER_LABEL[state.provider] ?? state.provider;
  const text = isErr
    ? (ERROR_COPY[state.reason] ?? ((p: string) => `Linking ${p} failed.`))(state.provider)
    : `${label} is now connected to your account.`;

  return (
    <div
      role={isErr ? "alert" : "status"}
      style={{
        background: isErr ? "rgba(248,81,73,0.08)" : "rgba(63,185,80,0.08)",
        border: `1px solid ${isErr ? TOKENS.neg : TOKENS.pos}`,
        borderLeft: `3px solid ${isErr ? TOKENS.neg : TOKENS.pos}`,
        borderRadius: 8,
        padding: "12px 14px",
        marginBottom: 24,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 13,
        color: TOKENS.text,
        lineHeight: 1.5,
      }}
    >
      <div>
        <strong style={{ color: isErr ? TOKENS.neg : TOKENS.pos, fontWeight: 700, marginRight: 6 }}>
          {isErr ? "Couldn't link" : "Linked"}
        </strong>
        {text}
      </div>
      <button
        onClick={() => setState(null)}
        aria-label="Dismiss"
        style={{
          background: "transparent",
          border: "none",
          color: TOKENS.textMuted,
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          padding: 4,
        }}
      >
        ✕
      </button>
    </div>
  );
}

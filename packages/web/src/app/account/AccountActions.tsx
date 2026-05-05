"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";
import { TOKENS } from "@/lib/tokens";

/**
 * Interactive controls for the /account page — kept as a client island so
 * the surrounding page can stay a pure server component (it does the
 * session + DB read at request time and that's all). Three actions:
 *
 *   - Sign out          → next-auth signOut, redirect to /
 *   - Download my data  → opens /api/account/export which sends a JSON
 *                         file with the right Content-Disposition; no
 *                         JS-side blob plumbing needed
 *   - Delete my account → POST /api/account/delete, then signOut
 *                         (with a one-step "type DELETE to confirm" gate
 *                          so a misclick doesn't nuke the row)
 */
export function AccountActions() {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    if (confirmText !== "DELETE") {
      setError("Type DELETE to confirm.");
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      // Tear down the session cookie + redirect to landing.
      await signOut({ callbackUrl: "/" });
    } catch (err) {
      setDeleting(false);
      setError((err as Error).message);
    }
  }

  return (
    <>
      {/* Session control */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={SECTION_H2}>Session</h2>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          style={btnStyle({ kind: "secondary" })}
        >
          Sign out
        </button>
      </section>

      {/* GDPR */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={SECTION_H2}>Data &amp; privacy</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
          <a href="/api/account/export" style={btnStyle({ kind: "secondary" })}>
            Download my data (JSON)
          </a>
        </div>

        <div
          style={{
            background: TOKENS.panel,
            border: `1px solid ${TOKENS.border}`,
            borderLeft: `3px solid ${TOKENS.neg}`,
            borderRadius: 8,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: TOKENS.text, marginBottom: 4 }}>
            Delete account
          </div>
          <div style={{ fontSize: 12, color: TOKENS.textSec, lineHeight: 1.5, marginBottom: 12 }}>
            Removes your account row, every connected sign-in method, and all
            saved dashboard preferences. Public Polymarket trade data we display
            (which has nothing to do with your account) is unaffected. This action
            cannot be undone.
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              placeholder="Type DELETE to confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={deleting}
              style={{
                background: TOKENS.bg,
                border: `1px solid ${TOKENS.borderHi}`,
                color: TOKENS.text,
                fontFamily: TOKENS.mono,
                fontSize: 12,
                padding: "8px 10px",
                borderRadius: 6,
                outline: "none",
                width: 220,
              }}
            />
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting || confirmText !== "DELETE"}
              style={btnStyle({ kind: "danger", disabled: deleting || confirmText !== "DELETE" })}
            >
              {deleting ? "Deleting…" : "Delete account"}
            </button>
          </div>
          {error && (
            <div style={{ marginTop: 10, fontSize: 11, color: TOKENS.neg }}>{error}</div>
          )}
        </div>
      </section>
    </>
  );
}

const SECTION_H2: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: TOKENS.textMuted,
  fontWeight: 700,
  margin: "0 0 14px",
  fontFamily: TOKENS.mono,
};

function btnStyle({ kind, disabled }: { kind: "secondary" | "danger"; disabled?: boolean }): React.CSSProperties {
  if (kind === "danger") {
    return {
      background: disabled ? TOKENS.panel2 : TOKENS.neg,
      color: disabled ? TOKENS.textMuted : "#fff",
      border: `1px solid ${disabled ? TOKENS.border : TOKENS.neg}`,
      fontFamily: "inherit",
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: 0.3,
      padding: "8px 14px",
      borderRadius: 7,
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "filter .12s",
    };
  }
  return {
    background: "transparent",
    color: TOKENS.text,
    border: `1px solid ${TOKENS.borderHi}`,
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.3,
    padding: "8px 14px",
    borderRadius: 7,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-block",
    transition: "background .12s, border-color .12s",
  };
}

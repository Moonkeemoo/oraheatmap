"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { startRegistration } from "@simplewebauthn/browser";
import { TOKENS } from "@/lib/tokens";
import { PasskeyIcon } from "./ProviderIcons";

/**
 * Floating "Add a passkey?" prompt shown once after a fresh sign-in
 * (any method). Lets the user register a passkey for this device so
 * future visits are a one-tap biometric. Dismissed → never shown again
 * for this user on this browser (localStorage flag).
 *
 * The actual WebAuthn ceremony is run client-side via @simplewebauthn:
 *   1. fetch /api/auth/webauthn-options/passkey (Auth.js returns the
 *      register options because we're authed and may not have a passkey)
 *   2. startRegistration() — Touch ID / Face ID / Windows Hello / FIDO key
 *   3. POST the attestation back to /callback/passkey, Auth.js stores it
 */
export function PasskeyPrompt() {
  const { data: session, status } = useSession();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Resolve the "this user dismissed it" flag against the current session id
  // so a different account on the same browser still gets prompted.
  const userId = (session?.user?.id as string) || null;
  const lsKey = userId ? `passkey-prompt:${userId}` : null;

  useEffect(() => {
    if (status !== "authenticated" || !lsKey) {
      setVisible(false);
      return;
    }
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(lsKey) === "dismissed") return;
    // Quick probe: if Auth.js says action=register, the user has no passkey
    // yet on this account — perfect time to ask. action=authenticate means
    // they (or someone) already has at least one credential — skip the
    // prompt to avoid being annoying. WebAuthn requires a secure context;
    // bail on http://.
    if (!window.PublicKeyCredential) return;
    fetch("/api/auth/webauthn-options/passkey", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { action?: string }) => {
        if (d?.action === "register") setVisible(true);
      })
      .catch(() => {/* silent — no prompt on failure */});
  }, [status, lsKey]);

  if (!visible) return null;

  function dismiss(): void {
    if (lsKey) window.localStorage.setItem(lsKey, "dismissed");
    setVisible(false);
  }

  async function register(): Promise<void> {
    setBusy(true);
    setMsg(null);
    try {
      const optsRes = await fetch("/api/auth/webauthn-options/passkey", {
        credentials: "include",
      });
      if (!optsRes.ok) throw new Error("Couldn't get a registration challenge.");
      const { action, options } = (await optsRes.json()) as {
        action: "register" | "authenticate";
        options: Parameters<typeof startRegistration>[0]["optionsJSON"];
      };
      if (action !== "register") {
        // Already has a passkey — treat as success and dismiss.
        dismiss();
        return;
      }
      const credential = await startRegistration({ optionsJSON: options });
      const csrfRes = await fetch("/api/auth/csrf", { credentials: "include" });
      const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
      const body = new URLSearchParams();
      body.append("csrfToken", csrfToken);
      body.append("data", JSON.stringify(credential));
      body.append("action", "register");
      const cb = await fetch("/api/auth/callback/passkey", {
        method: "POST",
        body,
        credentials: "include",
        redirect: "manual",
      });
      // Auth.js answers with 302 on success.
      if (cb.type === "opaqueredirect" || cb.ok) {
        dismiss();
      } else {
        setMsg(`Registration failed (${cb.status}).`);
      }
    } catch (err) {
      const e = err as Error;
      if (e.name === "InvalidStateError") {
        // Browser already has a credential for this domain — fine, dismiss.
        dismiss();
      } else if (e.name === "NotAllowedError") {
        setMsg("Cancelled. You can add a passkey later.");
      } else {
        setMsg(e.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        right: 18,
        bottom: 18,
        width: "min(340px, 92vw)",
        background: TOKENS.panel,
        border: `1px solid ${TOKENS.borderHi}`,
        borderRadius: 10,
        padding: "14px 16px",
        boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
        zIndex: 50,
        fontFamily: TOKENS.font,
        color: TOKENS.text,
        animation: "tipIn .14s ease-out",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ color: TOKENS.accent, display: "inline-flex", flexShrink: 0 }}>
          <PasskeyIcon size={20} />
        </span>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.3 }}>
          One-tap sign-in next time?
        </div>
      </div>
      <div style={{ fontSize: 11, color: TOKENS.textSec, lineHeight: 1.45, marginBottom: 12 }}>
        Add a passkey to this device — Touch ID / Face ID / Windows Hello.
        Skips the email and OAuth dance from now on.
      </div>
      {msg && (
        <div style={{ fontSize: 11, color: TOKENS.neg, marginBottom: 8 }}>{msg}</div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={register}
          disabled={busy}
          style={{
            flex: 1,
            background: TOKENS.accent,
            border: "none",
            color: "#1a1410",
            fontFamily: "inherit",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            padding: "8px 12px",
            borderRadius: 6,
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.6 : 1,
            transition: "filter .12s",
          }}
          onMouseEnter={(e) => { if (!busy) (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.15)"; }}
          onMouseLeave={(e) => { if (!busy) (e.currentTarget as HTMLButtonElement).style.filter = "none"; }}
        >
          {busy ? "…" : "Add passkey"}
        </button>
        <button
          onClick={dismiss}
          disabled={busy}
          style={{
            background: "transparent",
            border: `1px solid ${TOKENS.border}`,
            color: TOKENS.textSec,
            fontFamily: "inherit",
            fontSize: 11,
            fontWeight: 600,
            padding: "8px 12px",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { startRegistration } from "@simplewebauthn/browser";
import { TOKENS } from "@/lib/tokens";
import { PasskeyIcon } from "./ProviderIcons";

/**
 * Top banner shown after a successful sign-in to offer registering a passkey
 * for one-tap biometric login next time. Dismissed → never shown again for
 * this user on this browser (localStorage flag keyed by user id).
 *
 * The actual WebAuthn ceremony is run client-side via @simplewebauthn:
 *   1. fetch /api/auth/webauthn-options/passkey to get the registration challenge
 *   2. startRegistration() — Touch ID / Face ID / Windows Hello / FIDO key
 *   3. POST the attestation back to /callback/passkey, Auth.js stores it
 */
export function PasskeyPrompt() {
  const { data: session, status } = useSession();
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const userId = (session?.user?.id as string) || null;
  const lsKey = userId ? `passkey-prompt:${userId}` : null;

  useEffect(() => {
    // Re-check the dismissal flag whenever the active user changes
    // (different account on the same browser → fresh prompt).
    if (typeof window === "undefined" || !lsKey) {
      setDismissed(false);
      return;
    }
    setDismissed(window.localStorage.getItem(lsKey) === "dismissed");
  }, [lsKey]);

  if (status !== "authenticated" || !lsKey || dismissed) return null;
  // WebAuthn requires a secure context; bail on http://.
  if (typeof window !== "undefined" && !window.PublicKeyCredential) return null;

  function dismiss(): void {
    if (lsKey) window.localStorage.setItem(lsKey, "dismissed");
    setDismissed(true);
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
        // User already has at least one passkey on this account — nothing to
        // do. Treat as success and dismiss the banner.
        setMsg("You already have a passkey on this account.");
        setTimeout(dismiss, 1500);
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
      if (cb.type === "opaqueredirect" || cb.ok) {
        setMsg("Passkey saved! Use it on this device next time.");
        setTimeout(dismiss, 1800);
      } else {
        setMsg(`Registration failed (${cb.status}).`);
      }
    } catch (err) {
      const e = err as Error;
      if (e.name === "InvalidStateError") {
        setMsg("This device already has a passkey for OraLab.");
        setTimeout(dismiss, 1500);
      } else if (e.name === "NotAllowedError") {
        setMsg("Cancelled. You can add a passkey later from your account.");
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
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "10px 24px",
        background: `linear-gradient(90deg, ${TOKENS.panel} 0%, rgba(240,180,41,0.08) 100%)`,
        borderBottom: `1px solid ${TOKENS.border}`,
        fontFamily: TOKENS.font,
        color: TOKENS.text,
        fontSize: 12,
        flexShrink: 0,
      }}
    >
      <span style={{ color: TOKENS.accent, display: "inline-flex", flexShrink: 0 }}>
        <PasskeyIcon size={18} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 700, marginRight: 6 }}>One-tap sign-in next time?</span>
        <span style={{ color: TOKENS.textSec }}>
          Add a passkey to this device — Touch ID / Face ID / Windows Hello.
        </span>
        {msg && (
          <span style={{ marginLeft: 8, color: msg.includes("saved") || msg.includes("already") ? TOKENS.pos : TOKENS.neg }}>
            · {msg}
          </span>
        )}
      </div>
      <button
        onClick={register}
        disabled={busy}
        style={{
          background: TOKENS.accent,
          border: "none",
          color: "#1a1410",
          fontFamily: "inherit",
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          padding: "7px 14px",
          borderRadius: 6,
          cursor: busy ? "wait" : "pointer",
          opacity: busy ? 0.6 : 1,
          transition: "filter .12s",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => { if (!busy) (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.15)"; }}
        onMouseLeave={(e) => { if (!busy) (e.currentTarget as HTMLButtonElement).style.filter = "none"; }}
      >
        {busy ? "…" : "Add passkey"}
      </button>
      <button
        onClick={dismiss}
        disabled={busy}
        title="Dismiss for this account on this browser"
        style={{
          background: "transparent",
          border: "none",
          color: TOKENS.textMuted,
          fontFamily: "inherit",
          fontSize: 14,
          fontWeight: 700,
          padding: "4px 8px",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
}

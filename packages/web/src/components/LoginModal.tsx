"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { SiweMessage } from "siwe";
import { TOKENS } from "@/lib/tokens";

/**
 * Multi-provider login modal. Shows whatever providers are wired up.
 * SIWE works out of the box; Email/Twitter/Telegram show only when their
 * env keys are configured (the API exposes that via /api/auth/providers).
 */
export function LoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [providers, setProviders] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");

  // Probe Auth.js for the configured provider list — anything not in there
  // is hidden in the UI so we never show a button that would 404.
  useEffect(() => {
    if (!open) return;
    fetch("/api/auth/providers", { credentials: "include" })
      .then((r) => r.json())
      .then((data: Record<string, { id: string }>) => {
        setProviders(new Set(Object.keys(data ?? {})));
      })
      .catch(() => {
        // Fail-open: assume only siwe is wired so the user has SOME way in.
        setProviders(new Set(["siwe"]));
      });
  }, [open]);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const has = (id: string): boolean => providers.has(id);

  async function loginSiwe(): Promise<void> {
    setBusy("siwe");
    setError(null);
    try {
      // 1. Make sure a wallet is reachable.
      const eth = (window as unknown as { ethereum?: { request: (req: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
      if (!eth) {
        setError("No browser wallet detected. Install MetaMask, Rabby, or similar.");
        return;
      }
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts[0]?.toLowerCase();
      if (!address) {
        setError("Wallet did not return an address.");
        return;
      }
      // 2. Pull a fresh nonce from our endpoint.
      const nonce = await fetch("/api/auth/siwe/nonce").then((r) => r.text());
      // 3. Build the SIWE message and ask the wallet to sign it.
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to Whale Signal Heatmap",
        uri: window.location.origin,
        version: "1",
        chainId: 1,
        nonce,
        issuedAt: new Date().toISOString(),
      });
      const prepared = message.prepareMessage();
      const signature = (await eth.request({
        method: "personal_sign",
        params: [prepared, address],
      })) as string;
      // 4. Hand both to Auth.js — its credentials provider verifies and
      //    sets the session cookie. redirect:false so we stay on the page.
      const result = await signIn("siwe", { message: prepared, signature, redirect: false });
      if (result?.error) setError(result.error);
      else onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function loginEmail(): Promise<void> {
    if (!emailInput) return;
    setBusy("email");
    setError(null);
    try {
      // Auth.js Email provider sends the magic link; on success it redirects
      // to /api/auth/verify-request. We pass redirect:false to stay on page
      // and surface a success message instead.
      const result = await signIn("resend", { email: emailInput, redirect: false });
      if (result?.error) setError(result.error);
      else setError("✉ Check your inbox for the magic link.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          zIndex: 60,
        }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(380px, 92vw)",
          background: TOKENS.panel,
          border: `1px solid ${TOKENS.borderHi}`,
          borderRadius: 10,
          padding: "20px 22px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
          zIndex: 61,
          fontFamily: TOKENS.font,
          color: TOKENS.text,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: 0.4 }}>Sign in</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: `1px solid ${TOKENS.border}`,
              color: TOKENS.textSec,
              fontSize: 14,
              fontWeight: 700,
              padding: "3px 9px",
              borderRadius: 6,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ fontSize: 11, color: TOKENS.textMuted, marginBottom: 16, lineHeight: 1.4 }}>
          Sign in to unlock filters, modes, and category drill-down. Pick any
          method — they all map to the same account if you reuse them later.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {has("siwe") && (
            <ProviderButton onClick={loginSiwe} disabled={busy !== null} loading={busy === "siwe"}>
              Connect Wallet (SIWE)
            </ProviderButton>
          )}
          {has("twitter") && (
            <ProviderButton
              onClick={() => signIn("twitter")}
              disabled={busy !== null}
              loading={busy === "twitter"}
            >
              Continue with X
            </ProviderButton>
          )}
          {has("telegram") && (
            <ProviderButton
              onClick={() => setError("Telegram login: open the widget — coming soon.")}
              disabled={busy !== null}
              loading={busy === "telegram"}
            >
              Continue with Telegram
            </ProviderButton>
          )}
          {has("resend") && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
              <input
                type="email"
                placeholder="you@example.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                disabled={busy !== null}
                style={{
                  background: TOKENS.bg,
                  border: `1px solid ${TOKENS.border}`,
                  borderRadius: 6,
                  padding: "8px 10px",
                  color: TOKENS.text,
                  fontFamily: "inherit",
                  fontSize: 12,
                  outline: "none",
                }}
              />
              <ProviderButton onClick={loginEmail} disabled={busy !== null || !emailInput} loading={busy === "email"}>
                Send magic link
              </ProviderButton>
            </div>
          )}
        </div>

        {error && (
          <div style={{ marginTop: 12, fontSize: 11, color: error.startsWith("✉") ? TOKENS.pos : TOKENS.neg }}>
            {error}
          </div>
        )}
      </div>
    </>
  );
}

function ProviderButton({
  onClick,
  disabled,
  loading,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: loading ? TOKENS.panel2 : TOKENS.panel2,
        border: `1px solid ${TOKENS.borderHi}`,
        color: TOKENS.text,
        fontFamily: "inherit",
        fontSize: 12,
        fontWeight: 600,
        padding: "10px 14px",
        borderRadius: 6,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled && !loading ? 0.5 : 1,
        transition: "filter .12s",
        textAlign: "left",
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.2)";
      }}
      onMouseLeave={(e) => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.filter = "none";
      }}
    >
      {loading ? "…" : children}
    </button>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { signIn } from "next-auth/react";
import { SiweMessage } from "siwe";
import { TOKENS } from "@/lib/tokens";
import { MailIcon, MetaMaskIcon, TelegramIcon, XIcon } from "./ProviderIcons";

/**
 * Multi-provider login modal. Layout: email at top (most universal),
 * provider buttons below in a consistent style. All buttons share the
 * same dark-pill look so the modal reads as one unified menu — including
 * Telegram, which uses our own button instead of the official blue widget.
 */
export function LoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [providers, setProviders] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");

  useEffect(() => {
    if (!open) return;
    fetch("/api/auth/providers", { credentials: "include" })
      .then((r) => r.json())
      .then((data: Record<string, { id: string }>) => {
        setProviders(new Set(Object.keys(data ?? {})));
      })
      .catch(() => setProviders(new Set(["siwe"])));
  }, [open]);

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
      const eth = (window as unknown as { ethereum?: { request: (req: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
      if (!eth) {
        setError("MetaMask (or another browser wallet) not detected. Install one and try again.");
        return;
      }
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts[0]?.toLowerCase();
      if (!address) {
        setError("Wallet did not return an address.");
        return;
      }
      const nonce = await fetch("/api/auth/siwe/nonce").then((r) => r.text());
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
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
          Pick any method — they all map to the same account if you reuse them later.
        </div>

        {/* Email is the universal entry point — surfaced first. */}
        {has("resend") && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="email"
                placeholder="you@example.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void loginEmail(); }}
                disabled={busy !== null}
                style={{
                  flex: 1,
                  background: TOKENS.bg,
                  border: `1px solid ${TOKENS.border}`,
                  borderRadius: 8,
                  padding: "10px 12px",
                  color: TOKENS.text,
                  fontFamily: "inherit",
                  fontSize: 12,
                  outline: "none",
                }}
              />
              <ProviderButton
                onClick={loginEmail}
                disabled={busy !== null || !emailInput}
                loading={busy === "email"}
                icon={<MailIcon />}
                compact
              >
                Send link
              </ProviderButton>
            </div>
          </div>
        )}

        {/* Divider only when there's email AND at least one button below. */}
        {has("resend") && (has("siwe") || has("twitter") || has("telegram")) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 9,
              letterSpacing: 0.6,
              color: TOKENS.textMuted,
              textTransform: "uppercase",
              margin: "4px 0 12px",
            }}
          >
            <div style={{ flex: 1, height: 1, background: TOKENS.border }} />
            or
            <div style={{ flex: 1, height: 1, background: TOKENS.border }} />
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {has("siwe") && (
            <ProviderButton
              onClick={loginSiwe}
              disabled={busy !== null}
              loading={busy === "siwe"}
              icon={<MetaMaskIcon />}
            >
              Connect with MetaMask
            </ProviderButton>
          )}
          {has("twitter") && (
            <ProviderButton
              onClick={() => signIn("twitter")}
              disabled={busy !== null}
              loading={busy === "twitter"}
              icon={<XIcon />}
            >
              Continue with X
            </ProviderButton>
          )}
          {has("telegram") && (
            <TelegramLoginButton
              disabled={busy !== null}
              busy={busy === "telegram"}
              setBusy={(b) => setBusy(b ? "telegram" : null)}
              setError={setError}
              onSuccess={onClose}
            />
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

/** Custom Telegram login button — same visual style as the wallet/X buttons.
 *  Uses the official Telegram.Login.auth() popup API (provided by the
 *  telegram-widget.js script) so we get the verified payload without
 *  embedding their styled blue widget directly. */
function TelegramLoginButton({
  disabled,
  busy,
  setBusy,
  setError,
  onSuccess,
}: {
  disabled: boolean;
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (msg: string | null) => void;
  onSuccess: () => void;
}) {
  const [scriptReady, setScriptReady] = useState(false);
  const botId = process.env["NEXT_PUBLIC_TG_LOGIN_BOT_ID"];

  // Load the widget script once (gives us window.Telegram.Login.auth).
  useEffect(() => {
    type TgLogin = {
      Login?: {
        auth: (
          opts: { bot_id: string; request_access?: string },
          cb: (data: Record<string, string> | false) => void,
        ) => void;
      };
    };
    const w = window as unknown as { Telegram?: TgLogin };
    if (w.Telegram?.Login?.auth) {
      setScriptReady(true);
      return;
    }
    const existing = document.getElementById("tg-widget-script");
    if (existing) {
      existing.addEventListener("load", () => setScriptReady(true), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "tg-widget-script";
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.onload = () => setScriptReady(true);
    document.head.appendChild(script);
  }, []);

  function login(): void {
    if (!botId) {
      setError("Telegram bot id not configured (NEXT_PUBLIC_TG_LOGIN_BOT_ID).");
      return;
    }
    type TgLogin = {
      Login?: {
        auth: (
          opts: { bot_id: string; request_access?: string },
          cb: (data: Record<string, string> | false) => void,
        ) => void;
      };
    };
    const tg = (window as unknown as { Telegram?: TgLogin }).Telegram?.Login;
    if (!tg) {
      setError("Telegram script not ready yet — try again in a moment.");
      return;
    }
    setBusy(true);
    setError(null);
    tg.auth({ bot_id: botId, request_access: "write" }, async (data) => {
      if (!data) {
        setBusy(false);
        setError("Telegram login was cancelled.");
        return;
      }
      try {
        const result = await signIn("telegram", {
          payload: JSON.stringify(data),
          redirect: false,
        });
        if (result?.error) setError(result.error);
        else onSuccess();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <ProviderButton
      onClick={login}
      disabled={disabled || !scriptReady || !botId}
      loading={busy}
      icon={<TelegramIcon />}
    >
      Continue with Telegram
    </ProviderButton>
  );
}

function ProviderButton({
  onClick,
  disabled,
  loading,
  icon,
  compact,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
  icon?: ReactNode;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: TOKENS.panel2,
        border: `1px solid ${TOKENS.borderHi}`,
        color: TOKENS.text,
        fontFamily: "inherit",
        fontSize: 12,
        fontWeight: 600,
        padding: compact ? "0 14px" : "10px 14px",
        height: compact ? 38 : undefined,
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled && !loading ? 0.5 : 1,
        transition: "filter .12s",
        textAlign: "left",
        display: "flex",
        alignItems: "center",
        gap: 10,
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.2)";
      }}
      onMouseLeave={(e) => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.filter = "none";
      }}
    >
      {icon && (
        <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
          {icon}
        </span>
      )}
      <span style={{ flex: 1 }}>{loading ? "…" : children}</span>
    </button>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { signIn, useSession } from "next-auth/react";
import { SiweMessage } from "siwe";
import { TOKENS } from "@/lib/tokens";

/** Stash the provider the user is about to authenticate with so the
 *  post-auth effect in Heatmap.tsx can attribute signin_completed. The
 *  flag is read once when authStatus flips to "authenticated". */
function markSigninProvider(
  provider: "siwe" | "resend" | "github" | "discord" | "telegram" | "twitter",
): void {
  if (typeof window === "undefined") return;
  (window as unknown as { __ora_lastProvider?: string }).__ora_lastProvider = provider;
}
import {
  DiscordIcon,
  GithubIcon,
  MailIcon,
  MetaMaskIcon,
  TelegramIcon,
  XIcon,
} from "./ProviderIcons";

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
  // When the user is already signed in and opens the modal (e.g. via the
  // /account → ?connect=email|telegram redirect), Credentials providers
  // (SIWE / Telegram) must NOT call signIn — that would replace the
  // active session with a fresh one, dropping every linked provider.
  // In link mode, those buttons POST to /api/account/link/* instead.
  // OAuth + Email providers go through signIn in BOTH modes; the auth.ts
  // signIn() callback detects active session there and links manually.
  const { status: sessionStatus } = useSession();
  const linkMode = sessionStatus === "authenticated";

  // Reset transient state every time the modal opens. Without this,
  // if a previous attempt got stuck (e.g. Telegram popup blocked,
  // SIWE wallet rejected silently), the busy/error state lingered
  // across opens and the buttons rendered as "..." (loading dots)
  // forever. Reset on each open is cheap and gives the user a clean
  // slate to retry.
  useEffect(() => {
    if (!open) return;
    setBusy(null);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Defensive default — show every provider we have UI for. The probe
    // narrows it to the ones the backend actually has configured. If the
    // probe fails (network, weird response), keep the full set rather than
    // collapsing to "MetaMask only", which reads as "everything is broken".
    const ALL = new Set(["siwe", "resend", "github", "discord", "telegram"]);
    setProviders(ALL);
    fetch("/api/auth/providers", { credentials: "include" })
      .then((r) => r.json())
      .then((data: Record<string, { id: string }> | unknown) => {
        if (data && typeof data === "object") {
          const keys = Object.keys(data as Record<string, unknown>);
          // Only narrow if the response looks like the providers map
          // (Auth.js sometimes 400s with an error body — don't collapse
          // the modal in that case).
          const known = keys.filter((k) => ALL.has(k));
          if (known.length > 0) setProviders(new Set(known));
        }
      })
      .catch(() => {
        // keep the optimistic ALL set
      });
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
        // No injected wallet. On mobile (no extension possible) bounce
        // the user into the MetaMask app via the universal deep-link —
        // metamask.app.link/dapp/<host> opens our site inside MetaMask's
        // in-app browser, where window.ethereum IS injected and the
        // user can complete SIWE normally. If MetaMask isn't installed,
        // the deep-link routes to the App Store / Play Store. Detection:
        // a mobile UA without window.ethereum can't have a wallet
        // extension, so the deep-link is the only path forward.
        const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
        const isMobileBrowser = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(ua);
        if (isMobileBrowser) {
          const host = window.location.host;
          // metamask.app.link strips the protocol — pass just host+path.
          const deeplink = `https://metamask.app.link/dapp/${host}`;
          window.location.href = deeplink;
          return;
        }
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
        statement: linkMode
          ? "Link this wallet to your oralab account"
          : "Sign in to oralab",
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
      if (linkMode) {
        const res = await fetch("/api/account/link/siwe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: prepared, signature }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? `link failed (${res.status})`);
        } else {
          window.location.href = "/account?linked=siwe";
        }
      } else {
        markSigninProvider("siwe");
        const result = await signIn("siwe", { message: prepared, signature, redirect: false });
        if (result?.error) setError(result.error);
        else onClose();
      }
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
      markSigninProvider("resend");
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
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: 0.4 }}>
            {linkMode ? "Link a sign-in method" : "Sign in"}
          </h2>
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
        {linkMode && (
          <div
            style={{
              marginBottom: 12,
              padding: "8px 10px",
              background: "rgba(63,185,80,0.08)",
              border: `1px solid rgba(63,185,80,0.35)`,
              borderRadius: 6,
              fontSize: 11,
              color: TOKENS.textSec,
              lineHeight: 1.45,
            }}
          >
            <strong style={{ color: TOKENS.pos }}>Linking, not signing in.</strong>{" "}
            The chosen method will attach to your current account — your existing
            session stays.
          </div>
        )}
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
          {has("github") && (
            <ProviderButton
              onClick={() => {
                markSigninProvider("github");
                void signIn("github");
              }}
              disabled={busy !== null}
              loading={busy === "github"}
              icon={<GithubIcon />}
            >
              Continue with GitHub
            </ProviderButton>
          )}
          {has("discord") && (
            <ProviderButton
              onClick={() => {
                markSigninProvider("discord");
                void signIn("discord");
              }}
              disabled={busy !== null}
              loading={busy === "discord"}
              icon={<DiscordIcon />}
            >
              Continue with Discord
            </ProviderButton>
          )}
          {has("twitter") && (
            <ProviderButton
              onClick={() => {
                markSigninProvider("twitter");
                void signIn("twitter");
              }}
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
              linkMode={linkMode}
            />
          )}
        </div>

        {error && (
          <div style={{ marginTop: 12, fontSize: 11, color: error.startsWith("✉") ? TOKENS.pos : TOKENS.neg }}>
            {error}
          </div>
        )}

        <div
          style={{
            marginTop: 16,
            paddingTop: 12,
            borderTop: `1px solid ${TOKENS.border}`,
            fontSize: 10,
            lineHeight: 1.5,
            color: TOKENS.textMuted,
            textAlign: "center",
          }}
        >
          By signing in you agree to our{" "}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: TOKENS.link, textDecoration: "none" }}
          >
            Terms
          </a>{" "}
          and{" "}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: TOKENS.link, textDecoration: "none" }}
          >
            Privacy Policy
          </a>
          .
        </div>
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
  linkMode,
}: {
  disabled: boolean;
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (msg: string | null) => void;
  onSuccess: () => void;
  /** true when an active session exists — the widget should attach the
   *  Telegram identity to the current account via the link endpoint
   *  instead of calling signIn() and replacing the session. */
  linkMode: boolean;
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

    // Mobile path — full-page redirect to oauth.telegram.org. The
    // popup-based widget (tg.auth) is silently blocked on iOS Safari,
    // so on mobile we hand control over to Telegram's hosted page and
    // come back via /auth/tg-callback. The callback route POSTs to
    // signIn("telegram") and lands the user back at /app.
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isMobileBrowser = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(ua);
    if (isMobileBrowser) {
      const origin = window.location.origin;
      const returnTo = `${origin}/auth/tg-callback${linkMode ? "?mode=link" : ""}`;
      const url = new URL("https://oauth.telegram.org/auth");
      url.searchParams.set("bot_id", botId);
      url.searchParams.set("origin", origin);
      url.searchParams.set("embed", "0");
      url.searchParams.set("request_access", "write");
      url.searchParams.set("return_to", returnTo);
      markSigninProvider("telegram");
      window.location.href = url.toString();
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
    // Defensive timeout — if the Telegram popup is blocked or the user
    // dismisses without the callback firing (common on iOS Safari where
    // tg.auth opens a popup window that the OS may swallow), reset the
    // busy flag after 60s so the button isn't stuck on "…" forever.
    let resolved = false;
    const timeoutId = window.setTimeout(() => {
      if (!resolved) {
        setBusy(false);
        setError("Telegram login timed out. Try again, or pick another method.");
      }
    }, 60_000);
    tg.auth({ bot_id: botId, request_access: "write" }, async (data) => {
      resolved = true;
      window.clearTimeout(timeoutId);
      if (!data) {
        setBusy(false);
        setError("Telegram login was cancelled.");
        return;
      }
      try {
        if (linkMode) {
          const res = await fetch("/api/account/link/telegram", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ payload: JSON.stringify(data) }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            setError(body.error ?? `link failed (${res.status})`);
          } else {
            window.location.href = "/account?linked=telegram";
          }
        } else {
          markSigninProvider("telegram");
          const result = await signIn("telegram", {
            payload: JSON.stringify(data),
            redirect: false,
          });
          if (result?.error) setError(result.error);
          else onSuccess();
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    });
  }

  // Mobile path skips the widget script entirely (full-page redirect),
  // so the button shouldn't gate on scriptReady there — that flag only
  // covers the desktop popup path.
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isMobileBrowser = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(ua);
  const widgetReady = isMobileBrowser ? true : scriptReady;
  return (
    <ProviderButton
      onClick={login}
      disabled={disabled || !widgetReady || !botId}
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

"use client";

import { signIn } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { SiweMessage } from "siwe";
import type { ReactNode } from "react";

import {
  DiscordIcon,
  GithubIcon,
  MailIcon,
  MetaMaskIcon,
  TelegramIcon,
} from "@/components/ProviderIcons";
import { TOKENS } from "@/lib/tokens";

/**
 * Real account-linking UI on /account. Three integration paths:
 *
 *   1. OAuth (GitHub, Discord) — `signIn(provider, { callbackUrl: /account })`
 *      with auth.ts' `allowDangerousEmailAccountLinking: true` already
 *      flipped, so a verified-email match attaches a row to the existing
 *      user instead of forking.
 *
 *   2. Email (Resend) — bounces through the LoginModal on /app where the
 *      email-input form already lives. Uses ?connect=email so we know to
 *      send the user back here.
 *
 *   3. SIWE (MetaMask) and Telegram — full inline flow:
 *      - SIWE: window.ethereum → personal_sign → POST /api/account/link/siwe
 *      - TG: official telegram-widget popup → POST /api/account/link/telegram
 *      Both DO NOT call signIn(); they reuse the active session and just
 *      write a row to auth_accounts. Refusal modes (already-linked /
 *      cross-account collision) come back as JSON errors.
 */

type Provider = {
  id: string;
  label: string;
  icon: ReactNode;
};

const ALL_PROVIDERS: ReadonlyArray<Provider> = [
  { id: "resend",   label: "Email",    icon: <MailIcon /> },
  { id: "github",   label: "GitHub",   icon: <GithubIcon /> },
  { id: "discord",  label: "Discord",  icon: <DiscordIcon /> },
  { id: "siwe",     label: "MetaMask", icon: <MetaMaskIcon /> },
  { id: "telegram", label: "Telegram", icon: <TelegramIcon /> },
];

export function ConnectProviders({ connectedIds }: { connectedIds: ReadonlyArray<string> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connectedSet = new Set(connectedIds);
  const available = ALL_PROVIDERS.filter((p) => !connectedSet.has(p.id));
  if (available.length === 0) {
    return (
      <div style={{ fontSize: 12, color: TOKENS.textMuted }}>
        Every supported sign-in method is already on this account.
      </div>
    );
  }

  function refresh(): void {
    // Server component reads auth_accounts on render — a hard reload picks
    // up the new row. Avoids tangling Next router refresh semantics.
    window.location.reload();
  }

  async function connectOauth(id: string): Promise<void> {
    setError(null);
    await signIn(id, { callbackUrl: "/account" });
  }

  async function connectEmail(): Promise<void> {
    // Resend wants an address — the LoginModal already has the input form.
    window.location.href = "/app?connect=email";
  }

  async function connectSiwe(): Promise<void> {
    setError(null);
    setBusy("siwe");
    try {
      const eth = (window as unknown as { ethereum?: { request: (req: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
      if (!eth) {
        setError("MetaMask (or another browser wallet) not detected.");
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
        statement: "Link this wallet to your oralab account",
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
      const res = await fetch("/api/account/link/siwe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: prepared, signature }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function connectTelegram(): void {
    window.location.href = "/app?connect=telegram";
  }

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 8,
        }}
      >
        {available.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={busy !== null}
            onClick={() => {
              if (p.id === "siwe") return void connectSiwe();
              if (p.id === "telegram") return connectTelegram();
              if (p.id === "resend") return void connectEmail();
              return void connectOauth(p.id);
            }}
            style={{
              background: TOKENS.panel,
              border: `1px solid ${TOKENS.borderHi}`,
              borderRadius: 8,
              padding: "10px 12px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: TOKENS.text,
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 600,
              cursor: busy !== null ? "wait" : "pointer",
              opacity: busy !== null && busy !== p.id ? 0.55 : 1,
              transition: "filter .12s, border-color .12s",
              textAlign: "left",
            }}
            onMouseEnter={(e) => {
              if (busy !== null) return;
              (e.currentTarget as HTMLButtonElement).style.borderColor = TOKENS.textMuted;
              (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.1)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = TOKENS.borderHi;
              (e.currentTarget as HTMLButtonElement).style.filter = "none";
            }}
          >
            <span style={{ flexShrink: 0, display: "inline-flex" }}>{p.icon}</span>
            <span style={{ flex: 1 }}>
              {busy === p.id ? `Linking ${p.label}…` : `Connect ${p.label}`}
            </span>
          </button>
        ))}
      </div>
      {error && (
        <div style={{ marginTop: 12, fontSize: 12, color: TOKENS.neg }}>
          {error}
        </div>
      )}
      <div
        style={{
          fontSize: 11,
          color: TOKENS.textMuted,
          marginTop: 12,
          lineHeight: 1.5,
        }}
      >
        Email · GitHub · Discord merge into this account when their verified
        emails match. MetaMask and Telegram are linked by signature — after
        linking, signing in with either method routes to this same account.
      </div>
    </div>
  );
}

/** Inline disconnect button rendered on each connected row. POSTs to
 *  /api/account/unlink and reloads on success. The endpoint refuses to
 *  remove the user's last sign-in method. */
export function DisconnectButton({
  provider,
  providerAccountId,
}: {
  provider: string;
  providerAccountId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errRef = useRef<HTMLDivElement | null>(null);

  // Auto-clear error after a few seconds so it doesn't pin forever.
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(id);
  }, [error]);

  async function go(): Promise<void> {
    if (!confirm(`Disconnect ${provider} from this account?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/unlink", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, providerAccountId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div ref={errRef} style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        style={{
          background: "transparent",
          border: `1px solid ${TOKENS.border}`,
          color: TOKENS.textSec,
          fontFamily: "inherit",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 0.3,
          padding: "5px 10px",
          borderRadius: 6,
          cursor: busy ? "wait" : "pointer",
          transition: "color .12s, border-color .12s",
        }}
        onMouseEnter={(e) => {
          if (busy) return;
          (e.currentTarget as HTMLButtonElement).style.color = TOKENS.neg;
          (e.currentTarget as HTMLButtonElement).style.borderColor = TOKENS.neg;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = TOKENS.textSec;
          (e.currentTarget as HTMLButtonElement).style.borderColor = TOKENS.border;
        }}
      >
        {busy ? "Disconnecting…" : "Disconnect"}
      </button>
      {error && (
        <div style={{ fontSize: 10, color: TOKENS.neg, maxWidth: 240, textAlign: "right" }}>
          {error}
        </div>
      )}
    </div>
  );
}

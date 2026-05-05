"use client";

import { signIn } from "next-auth/react";
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
 * Linking UI on /account. The page passes in which providers are already
 * attached to this user (`connected`); we render the rest as "Connect"
 * buttons that kick off `signIn(provider, { callbackUrl: "/account" })`.
 *
 * Caveats — these survive until the proper account-merge work in v1.6:
 *   - Email + GitHub + Discord with matching verified emails ARE merged
 *     server-side (`allowDangerousEmailAccountLinking: true` on those
 *     providers in auth.ts) — that's why a follow-up GitHub sign-in just
 *     attaches a new auth_accounts row instead of forking a user.
 *   - SIWE (MetaMask) and Telegram are Credentials providers — Auth.js
 *     can't merge them into another account. Signing in with one of
 *     them today still creates a SEPARATE auth_users row. We surface
 *     this in the UI so the user isn't surprised.
 */

type Provider = {
  id: string;
  label: string;
  icon: ReactNode;
  /** True if same-email merging via the adapter actually links into the
   *  current account; false means a fresh row is created (v1.6 work). */
  mergesByEmail: boolean;
};

const ALL_PROVIDERS: ReadonlyArray<Provider> = [
  { id: "resend",   label: "Email",    icon: <MailIcon />,     mergesByEmail: true },
  { id: "github",   label: "GitHub",   icon: <GithubIcon />,   mergesByEmail: true },
  { id: "discord",  label: "Discord",  icon: <DiscordIcon />,  mergesByEmail: true },
  { id: "siwe",     label: "MetaMask", icon: <MetaMaskIcon />, mergesByEmail: false },
  { id: "telegram", label: "Telegram", icon: <TelegramIcon />, mergesByEmail: false },
];

export function ConnectProviders({ connectedIds }: { connectedIds: ReadonlyArray<string> }) {
  const connectedSet = new Set(connectedIds);
  const available = ALL_PROVIDERS.filter((p) => !connectedSet.has(p.id));
  if (available.length === 0) {
    return (
      <div style={{ fontSize: 12, color: TOKENS.textMuted }}>
        Every supported sign-in method is already on this account.
      </div>
    );
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
            onClick={() => {
              if (p.id === "resend") {
                // Resend wants an email argument; the user enters it in
                // the LoginModal. From here just bounce to /app where the
                // modal opens. Cheaper than re-implementing the email
                // form on /account.
                window.location.href = "/app?connect=email";
                return;
              }
              if (p.id === "telegram") {
                // Telegram needs the widget popup that the LoginModal
                // hosts. Same redirect logic.
                window.location.href = "/app?connect=telegram";
                return;
              }
              void signIn(p.id, { callbackUrl: "/account" });
            }}
            title={
              p.mergesByEmail
                ? `Connect ${p.label} to this account (merges if email matches)`
                : `Connect ${p.label} — currently creates a separate account; full linking ships in v1.6`
            }
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
              cursor: "pointer",
              transition: "filter .12s, border-color .12s",
              textAlign: "left",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = TOKENS.textMuted;
              (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.1)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = TOKENS.borderHi;
              (e.currentTarget as HTMLButtonElement).style.filter = "none";
            }}
          >
            <span style={{ flexShrink: 0, display: "inline-flex" }}>{p.icon}</span>
            <span style={{ flex: 1 }}>Connect {p.label}</span>
            {!p.mergesByEmail && (
              <span
                title="Currently creates a separate account"
                style={{
                  fontSize: 9,
                  color: TOKENS.accent,
                  fontFamily: TOKENS.mono,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  fontWeight: 700,
                }}
              >
                v1.6
              </span>
            )}
          </button>
        ))}
      </div>
      <div
        style={{
          fontSize: 11,
          color: TOKENS.textMuted,
          marginTop: 12,
          lineHeight: 1.5,
        }}
      >
        Email · GitHub · Discord merge into this account when their verified
        emails match. MetaMask and Telegram currently create separate
        accounts — true cross-provider merging arrives in v1.6.
      </div>
    </div>
  );
}

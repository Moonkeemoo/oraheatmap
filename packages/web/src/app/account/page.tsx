import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Footer } from "@/components/Footer";
import { BrandLogo } from "@/components/BrandLogo";
import { getDb } from "@/db";
import { TOKENS } from "@/lib/tokens";
import { AccountActions } from "./AccountActions";
import { ConnectProviders, DisconnectButton } from "./ConnectProviders";
import { LinkBanner } from "./LinkBanner";

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your oralab account and connected sign-in methods.",
  // Authenticated dashboard surface — no SEO value, plus we don't want
  // the rendered email/identity content cached by crawlers if a
  // logged-out request ever reaches here.
  robots: { index: false, follow: false },
};

const PROVIDER_LABEL: Record<string, string> = {
  siwe: "MetaMask · Sign-In with Ethereum",
  resend: "Email magic link",
  github: "GitHub",
  discord: "Discord",
  twitter: "X (Twitter)",
  telegram: "Telegram",
};

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) {
    // Not authed — bounce to /app where the LoginModal can be opened.
    redirect("/app");
  }
  const userId = session.user.id;
  const sessionProvider = (session as { provider?: string }).provider ?? null;

  // The DB adapter only writes to auth_accounts for OAuth + Email providers.
  // SIWE + Telegram are Credentials providers (JWT-only) — they won't have
  // rows here, so we synthesise a "primary" entry from session.provider.
  const { sql } = getDb();
  const [accountRows, userRows] = await Promise.all([
    sql<{ provider: string; provider_account_id: string; type: string }[]>`
      SELECT provider, provider_account_id, type FROM auth_accounts WHERE user_id = ${userId}
    `,
    // Read identity from auth_users — the JWT carries whatever was set at
    // sign-in time (e.g. "Moonkee" from the Telegram username) and goes
    // stale once a user links OAuth providers that backfill richer data.
    // DB is the source of truth for /account display.
    sql<{ name: string | null; email: string | null; image: string | null }[]>`
      SELECT name, email, image FROM auth_users WHERE id = ${userId} LIMIT 1
    `,
  ]);
  const userRow = userRows[0] ?? null;

  // `linked` rows have an auth_accounts entry → can be disconnected via
  // /api/account/unlink. The synthetic primary (Credentials provider, JWT-
  // only, no DB row yet) renders without a Disconnect button — it IS the
  // current session, the only way to "remove" it is to sign out.
  type ConnectedRow = {
    provider: string;
    label: string;
    subtitle: string | null;
    linked: boolean;
    providerAccountId: string | null;
  };
  // Build the full connected list. Auth_accounts rows are always included
  // (they're the canonical record). The synthetic "primary" entry for the
  // current Credentials session is added IF that provider isn't already
  // represented in auth_accounts — covers the case where a SIWE/Telegram
  // user has linked OAuth providers (rows in auth_accounts) but their own
  // identity has no row.
  const connected: ConnectedRow[] = accountRows.map((r) => ({
    provider: r.provider,
    label: PROVIDER_LABEL[r.provider] ?? r.provider,
    subtitle: r.provider_account_id ? truncateId(r.provider_account_id) : null,
    linked: true,
    providerAccountId: r.provider_account_id,
  }));
  if (sessionProvider && !connected.some((c) => c.provider === sessionProvider)) {
    connected.push({
      provider: sessionProvider,
      label: PROVIDER_LABEL[sessionProvider] ?? sessionProvider,
      subtitle: truncateId(userId),
      linked: false,
      providerAccountId: null,
    });
  }

  // Prefer DB row over JWT (JWT is set at sign-in and lags behind link
  // backfills). Fall back to session for fresh Credentials sign-ins where
  // no auth_users row exists yet.
  const userName = userRow?.name ?? (session.user.name as string | undefined | null) ?? null;
  const userEmail = userRow?.email ?? (session.user.email as string | undefined | null) ?? null;
  const userImage = userRow?.image ?? (session.user.image as string | undefined | null) ?? null;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: TOKENS.bg,
        color: TOKENS.text,
        fontFamily: TOKENS.font,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          padding: "20px 24px",
          borderBottom: `1px solid ${TOKENS.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <Link href="/" style={{ textDecoration: "none" }}>
          <BrandLogo size="compact" />
        </Link>
        <Link
          href="/app"
          style={{
            color: TOKENS.link,
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          ← Back to heatmap
        </Link>
      </header>

      <article
        style={{
          maxWidth: 720,
          width: "100%",
          margin: "0 auto",
          padding: "40px 24px 60px",
          flex: 1,
        }}
      >
        <h1
          style={{
            fontSize: 32,
            margin: "0 0 6px",
            fontWeight: 700,
            letterSpacing: -0.5,
          }}
        >
          Account
        </h1>
        <p style={{ color: TOKENS.textMuted, fontSize: 13, margin: "0 0 24px" }}>
          Your sign-in identity, connected providers, and data controls.
        </p>

        <LinkBanner />

        {/* Identity */}
        <Section title="Identity">
          {userImage && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${TOKENS.border}` }}>
              <div style={{ color: TOKENS.textMuted, fontSize: 12, width: 160 }}>Avatar</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={userImage}
                alt=""
                width={56}
                height={56}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 56,
                  objectFit: "cover",
                  background: TOKENS.panel2,
                  border: `1px solid ${TOKENS.border}`,
                }}
              />
            </div>
          )}
          <Row label="Display name" value={userName ?? <Muted>—</Muted>} />
          <Row
            label="Email"
            value={userEmail ?? <Muted>not set on this account</Muted>}
            mono={!!userEmail}
          />
          <Row label="Account ID" value={userId} mono />
        </Section>

        {/* Connected providers */}
        <Section title={`Connected sign-in methods · ${connected.length}`}>
          {connected.length === 0 ? (
            <Muted>None recorded.</Muted>
          ) : (
            connected.map((c) => (
              <div
                key={`${c.provider}-${c.subtitle ?? ""}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  background: TOKENS.panel,
                  border: `1px solid ${TOKENS.border}`,
                  borderRadius: 8,
                  marginBottom: 8,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TOKENS.text }}>
                    {c.label}
                  </div>
                  {c.subtitle && (
                    <div
                      style={{
                        fontSize: 11,
                        color: TOKENS.textMuted,
                        fontFamily: TOKENS.mono,
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.subtitle}
                    </div>
                  )}
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: TOKENS.mono,
                      color: TOKENS.pos,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                      fontWeight: 700,
                    }}
                  >
                    Active
                  </span>
                  {c.linked && c.providerAccountId && (
                    <DisconnectButton
                      provider={c.provider}
                      providerAccountId={c.providerAccountId}
                    />
                  )}
                </div>
              </div>
            ))
          )}
        </Section>

        {/* Add another method */}
        <Section title="Add another sign-in method">
          <ConnectProviders connectedIds={connected.map((c) => c.provider)} />
        </Section>

        {/* Data & privacy + Sign out — interactive bits live in a client component. */}
        <AccountActions />
      </article>

      <Footer />
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2
        style={{
          fontSize: 11,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: TOKENS.textMuted,
          fontWeight: 700,
          margin: "0 0 14px",
          fontFamily: TOKENS.mono,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "160px 1fr",
        gap: 16,
        padding: "10px 0",
        borderBottom: `1px solid ${TOKENS.border}`,
        fontSize: 13,
      }}
    >
      <div style={{ color: TOKENS.textMuted, fontSize: 12 }}>{label}</div>
      <div
        style={{
          color: TOKENS.text,
          fontFamily: mono ? TOKENS.mono : TOKENS.font,
          overflow: "hidden",
          textOverflow: "ellipsis",
          wordBreak: mono ? "break-all" : "normal",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ color: TOKENS.textMuted }}>{children}</span>;
}

function truncateId(id: string): string {
  if (id.length <= 24) return id;
  return `${id.slice(0, 10)}…${id.slice(-6)}`;
}

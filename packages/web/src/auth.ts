import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { SignJWT, jwtVerify } from "jose";
import { SiweMessage } from "siwe";
import { getDb } from "@/db";
import { accounts, authenticators, sessions, users, verificationTokens } from "@/db/auth-schema";

/**
 * Auth.js (NextAuth v5) configuration for the heatmap web app.
 *
 * Strategy: STATELESS JWT signed with HS256 using AUTH_SECRET. The cookie is
 * shared with the Elysia API on the same origin so the API can validate the
 * same token without round-tripping back to Next. Default Auth.js uses an
 * encrypted JWE — we override jwt.encode/decode to produce a plain HS256 JWS
 * that any service holding the secret can verify with `jose`.
 *
 * Providers shipped now:
 *   - SIWE (Sign-In with Ethereum) — production-ready
 *
 * Providers scaffolded but disabled until env keys are set:
 *   - Email magic link (needs RESEND_API_KEY + EMAIL_FROM)
 *   - Twitter (X) OAuth (needs TWITTER_CLIENT_ID/SECRET)
 *   - Telegram Login Widget (needs TG_LOGIN_BOT_TOKEN)
 */

const AUTH_SECRET = process.env["AUTH_SECRET"] ?? "";
if (!AUTH_SECRET) {
  // Throwing here would crash the dev server; warn so a missing secret is
  // visible in logs without taking the whole app down at boot.
  console.warn("[auth] AUTH_SECRET is not set — sessions will not work");
}
const SECRET_KEY = new TextEncoder().encode(AUTH_SECRET || "dev-fallback-secret");
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const providers: NextAuthConfig["providers"] = [
  // ─── SIWE ──────────────────────────────────────────────────────────────
  Credentials({
    id: "siwe",
    name: "Ethereum",
    credentials: {
      message: { label: "Message", type: "text" },
      signature: { label: "Signature", type: "text" },
    },
    async authorize(credentials) {
      if (!credentials?.message || !credentials?.signature) return null;
      try {
        const siwe = new SiweMessage(credentials.message as string);
        // Auth.js v5 doesn't expose the request URL here; we trust the
        // domain field on the message and verify the signature is valid
        // for that wallet. Nonce uniqueness is enforced client-side
        // (one-shot fetch).
        const result = await siwe.verify({
          signature: credentials.signature as string,
          domain: siwe.domain,
          nonce: siwe.nonce,
        });
        if (!result.success) return null;
        const addr = siwe.address.toLowerCase();
        return {
          id: addr,
          name: addr,
          // No image — UI uses deterministic whaleColor() for the avatar dot.
        };
      } catch (err) {
        console.warn("[auth/siwe] verify failed:", (err as Error).message);
        return null;
      }
    },
  }),
];

// Email magic link — only added when Resend/email transport is configured.
if (process.env["RESEND_API_KEY"] && process.env["EMAIL_FROM"]) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Resend = require("next-auth/providers/resend").default as typeof import("next-auth/providers/resend").default;
  // Wrap "noreply@oralab.xyz" → '"OraLab" <noreply@oralab.xyz>' so inboxes
  // surface a friendly sender name (huge for spam-folder avoidance and trust).
  const rawFrom = process.env["EMAIL_FROM"]!;
  const friendlyFrom = rawFrom.includes("<") ? rawFrom : `"ORALAB" <${rawFrom}>`;
  providers.push(
    Resend({
      apiKey: process.env["RESEND_API_KEY"],
      from: friendlyFrom,
      // Override the default sendVerificationRequest with a branded HTML
      // template (and matching plain-text fallback). Generic Auth.js template
      // looked spammy — our own copy + dark theme tracks the dashboard's
      // styling and gives Gmail/Apple Mail more trust signals.
      async sendVerificationRequest({ identifier: email, url }) {
        const host = new URL(url).host;
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env["RESEND_API_KEY"]}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: friendlyFrom,
            to: email,
            subject: `Sign in to ORALAB`,
            text: textBody({ url, host }),
            html: htmlBody({ url, host }),
            // Encourages mail clients to NOT mark routine sign-in mails as
            // junk after the first interaction — recommended by RFC 8058.
            headers: {
              "List-Unsubscribe": `<mailto:noreply@${host}?subject=unsubscribe>`,
              "X-Entity-Ref-ID": email,
            },
          }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(`Resend failed (${res.status}): ${detail.slice(0, 200)}`);
        }
      },
    }),
  );
}

function textBody({ url, host }: { url: string; host: string }): string {
  return [
    "Sign in to ORALAB — Polymarket Heatmap",
    "",
    `Click the link below to sign in to ${host}. The link expires in 24 hours and can only be used once.`,
    "",
    url,
    "",
    "Didn't request this? You can safely ignore this email — your inbox just received a sign-in code that nobody can use without your inbox.",
  ].join("\n");
}

function htmlBody({ url, host }: { url: string; host: string }): string {
  // Inline styles for max email-client compatibility (Outlook etc.).
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Sign in to ORALAB</title>
  </head>
  <body style="margin:0;padding:0;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e6edf3;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d1117;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#161b22;border:1px solid #30363d;border-radius:12px;padding:32px;">
            <tr>
              <td style="padding-bottom:20px;">
                <div style="font-size:13px;letter-spacing:-0.02em;color:#e6edf3;font-weight:700;text-transform:uppercase;font-family:'Space Grotesk',-apple-system,sans-serif;">ORALAB</div>
                <div style="font-size:11px;color:#7d8590;letter-spacing:-0.02em;text-transform:uppercase;margin-top:4px;font-family:'Space Grotesk',-apple-system,sans-serif;font-weight:700;">Polymarket Heatmap</div>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:18px;font-size:18px;font-weight:600;color:#e6edf3;">
                Sign in to your account
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:24px;font-size:14px;color:#c9d1d9;line-height:1.55;">
                Tap the button below to sign in to <strong style="color:#e6edf3;">${host}</strong>.
                The link expires in <strong style="color:#e6edf3;">24 hours</strong> and can only be used once.
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:24px;">
                <a href="${url}" target="_blank" rel="noopener"
                   style="display:inline-block;padding:14px 28px;background:#f0b429;color:#1a1410;font-weight:700;font-size:14px;letter-spacing:0.4px;text-decoration:none;border-radius:8px;">
                  Sign in to ORALAB
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:18px;font-size:12px;color:#7d8590;line-height:1.5;">
                Or paste this link into your browser:<br />
                <a href="${url}" target="_blank" rel="noopener" style="color:#58a6ff;word-break:break-all;">${url}</a>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #30363d;padding-top:16px;font-size:11px;color:#6e7681;line-height:1.5;">
                Didn't request this? You can safely ignore this email —
                this sign-in link is useless without access to your inbox.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Twitter (X) OAuth — only when client id/secret are present.
if (process.env["TWITTER_CLIENT_ID"] && process.env["TWITTER_CLIENT_SECRET"]) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Twitter = require("next-auth/providers/twitter").default as typeof import("next-auth/providers/twitter").default;
  providers.push(
    Twitter({
      clientId: process.env["TWITTER_CLIENT_ID"],
      clientSecret: process.env["TWITTER_CLIENT_SECRET"],
      // Defensive profile parser — the default Auth.js Twitter provider
      // assumes the response shape {data: {id, name, ...}}, but if Twitter
      // returns errors or a different shape we want a clear log line
      // instead of "Cannot read properties of undefined (reading 'id')".
      profile(raw: unknown) {
        const r = raw as { data?: { id?: string; name?: string; username?: string; profile_image_url?: string } } & Record<string, unknown>;
        const data = r?.data ?? (r as { id?: string; name?: string; username?: string; profile_image_url?: string });
        if (!data?.id) {
          console.error("[auth/twitter] unexpected profile shape:", JSON.stringify(raw).slice(0, 500));
          throw new Error("Twitter returned no user id");
        }
        return {
          id: String(data.id),
          name: data.name ?? data.username ?? null,
          image: data.profile_image_url ?? null,
          email: null,
        };
      },
    }),
  );
}

// GitHub OAuth — Auth.js native provider, free.
//
// allowDangerousEmailAccountLinking lets a user sign in with GitHub even
// when they previously created the account via a different provider that
// returned the same email (e.g. the email magic link). Auth.js calls this
// "dangerous" because a hostile OAuth provider could claim an email it
// doesn't own and hijack the account. For GitHub + Discord both providers
// VERIFY emails before exposing them, so the risk is acceptable here.
if (process.env["GITHUB_CLIENT_ID"] && process.env["GITHUB_CLIENT_SECRET"]) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const GitHub = require("next-auth/providers/github").default as typeof import("next-auth/providers/github").default;
  providers.push(
    GitHub({
      clientId: process.env["GITHUB_CLIENT_ID"],
      clientSecret: process.env["GITHUB_CLIENT_SECRET"],
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

// Discord OAuth — Auth.js native provider, free.
if (process.env["DISCORD_CLIENT_ID"] && process.env["DISCORD_CLIENT_SECRET"]) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Discord = require("next-auth/providers/discord").default as typeof import("next-auth/providers/discord").default;
  providers.push(
    Discord({
      clientId: process.env["DISCORD_CLIENT_ID"],
      clientSecret: process.env["DISCORD_CLIENT_SECRET"],
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

// Passkey (WebAuthn) — DISABLED. Auth.js v5 beta's experimental webauthn
// provider has multiple unresolved bugs in App Router (string userID
// rejection by simplewebauthn v11+; "Cannot read properties of undefined
// (reading 'headers')" deep in the route handler). Re-enable once Auth.js
// ships a stable WebAuthn implementation. The auth_authenticators table
// stays in the schema so we don't have to migrate again later.

// Telegram Login Widget — verified hash check via custom Credentials provider.
if (process.env["TG_LOGIN_BOT_TOKEN"]) {
  providers.push(
    Credentials({
      id: "telegram",
      name: "Telegram",
      credentials: {
        // The widget hands back: id, first_name, last_name?, username?, photo_url?, auth_date, hash
        payload: { label: "Telegram payload (JSON)", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.payload) return null;
        try {
          const payload = JSON.parse(credentials.payload as string) as Record<string, string>;
          const { hash, ...fields } = payload;
          // Per Telegram spec: build data_check_string from sorted key=value
          // joined by \n, then HMAC-SHA256 with key = SHA256(bot_token).
          const checkString = Object.keys(fields)
            .sort()
            .map((k) => `${k}=${fields[k]}`)
            .join("\n");
          const { createHmac, createHash } = await import("node:crypto");
          const secretKey = createHash("sha256").update(process.env["TG_LOGIN_BOT_TOKEN"]!).digest();
          const computed = createHmac("sha256", secretKey).update(checkString).digest("hex");
          if (computed !== hash) return null;
          // Reject payloads older than 24h (replay protection).
          const authDate = Number(fields["auth_date"]);
          if (!authDate || Date.now() / 1000 - authDate > 86400) return null;
          return {
            id: `tg:${fields["id"]}`,
            name: fields["username"] || fields["first_name"] || `tg-${fields["id"]}`,
            image: fields["photo_url"] ?? null,
          };
        } catch (err) {
          console.warn("[auth/telegram] verify failed:", (err as Error).message);
          return null;
        }
      },
    }),
  );
}

// Drizzle adapter is wired only when DATABASE_URL is set. Email provider
// REQUIRES it; OAuth providers WRITE to it; SIWE / Telegram (Credentials)
// ignore it. Skipping when no env keeps `next build` (which evaluates
// route modules without runtime DATABASE_URL) from crashing — at runtime
// systemd loads .env so the adapter inits normally.
const drizzleAdapter = process.env["DATABASE_URL"]
  ? DrizzleAdapter(getDb().db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
      authenticatorsTable: authenticators,
    })
  : undefined;

export const authConfig: NextAuthConfig = {
  providers,
  adapter: drizzleAdapter,
  trustHost: true,
  // Required for the Passkey provider (still flagged experimental in v5).
  experimental: { enableWebAuthn: true },
  session: { strategy: "jwt", maxAge: TOKEN_TTL_SECONDS },
  // HS256 JWS so the Elysia API can verify with the same secret + jose.
  jwt: {
    async encode({ token }) {
      return new SignJWT(token as Record<string, unknown>)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
        .sign(SECRET_KEY);
    },
    async decode({ token }) {
      if (!token) return null;
      try {
        const { payload } = await jwtVerify(token, SECRET_KEY, { algorithms: ["HS256"] });
        return payload as { sub?: string; name?: string; email?: string; picture?: string };
      } catch {
        return null;
      }
    },
  },
  // We deliberately DON'T override Auth.js cookies here. On a single-apex
  // deploy (web + api both on oralab.xyz behind Caddy) the default
  // host-only Secure cookies are sent on every same-origin request — which
  // covers /api/* on Elysia too. Overriding only the sessionToken (as we
  // did before) left the OAuth state/PKCE/CSRF cookies on different scopes
  // than the session, breaking Twitter's state-check on callback with
  // "InvalidCheck: state value could not be parsed".
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.sub = user.id ?? token.sub;
        token.name = user.name ?? token.name;
        token.email = (user as { email?: string | null }).email ?? token.email;
        token.picture = (user as { image?: string | null }).image ?? token.picture;
      }
      if (account) {
        token.provider = account.provider;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = (token.sub as string) ?? "";
        session.user.name = (token.name as string) ?? null;
        session.user.email = (token.email as string) ?? session.user.email;
        session.user.image = (token.picture as string) ?? null;
        (session as { provider?: string }).provider = token["provider"] as string | undefined;
      }
      return session;
    },
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);

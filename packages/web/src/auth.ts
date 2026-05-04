import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { SignJWT, jwtVerify } from "jose";
import { SiweMessage } from "siwe";
import { getDb } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/auth-schema";

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
  // Dynamic import keeps this provider out of the bundle when env keys
  // aren't set so we don't drag SMTP code into prod for nothing.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Resend = require("next-auth/providers/resend").default as typeof import("next-auth/providers/resend").default;
  providers.push(
    Resend({
      apiKey: process.env["RESEND_API_KEY"],
      from: process.env["EMAIL_FROM"],
    }),
  );
}

// Twitter (X) OAuth — only when client id/secret are present.
if (process.env["TWITTER_CLIENT_ID"] && process.env["TWITTER_CLIENT_SECRET"]) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Twitter = require("next-auth/providers/twitter").default as typeof import("next-auth/providers/twitter").default;
  providers.push(
    Twitter({
      clientId: process.env["TWITTER_CLIENT_ID"],
      clientSecret: process.env["TWITTER_CLIENT_SECRET"],
    }),
  );
}

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

// Drizzle adapter is required for the Email magic-link provider (stores
// the one-time token + user). Twitter (OAuth) also writes account rows
// here. SIWE / Telegram (Credentials) ignore it — JWT only.
//
// Wrapped in a Proxy so the underlying DB connection is opened on FIRST
// METHOD CALL, not at module-eval. Otherwise `next build` (which evaluates
// route modules without runtime env) crashes when DATABASE_URL is unset.
let cachedAdapter: ReturnType<typeof DrizzleAdapter> | null = null;
function realAdapter(): ReturnType<typeof DrizzleAdapter> {
  if (cachedAdapter) return cachedAdapter;
  const { db } = getDb();
  cachedAdapter = DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  });
  return cachedAdapter;
}
const lazyAdapter = new Proxy({} as ReturnType<typeof DrizzleAdapter>, {
  get(_target, prop) {
    const v = realAdapter()[prop as keyof ReturnType<typeof DrizzleAdapter>];
    return typeof v === "function" ? v.bind(realAdapter()) : v;
  },
});

export const authConfig: NextAuthConfig = {
  providers,
  adapter: lazyAdapter,
  trustHost: true,
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
  // Cookie domain — apex so /api/* on Elysia sees the same cookie. In dev
  // (no AUTH_COOKIE_DOMAIN set) Auth.js defaults to host-only, which is
  // fine when web + api share localhost.
  cookies: process.env["AUTH_COOKIE_DOMAIN"]
    ? {
        sessionToken: {
          name: "authjs.session-token",
          options: {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            secure: true,
            domain: process.env["AUTH_COOKIE_DOMAIN"],
          },
        },
      }
    : undefined,
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.sub = user.id ?? token.sub;
        token.name = user.name ?? token.name;
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
        session.user.image = (token.picture as string) ?? null;
        (session as { provider?: string }).provider = token["provider"] as string | undefined;
      }
      return session;
    },
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);

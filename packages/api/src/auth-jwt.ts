/**
 * Verify the Auth.js session cookie. The web (Next.js) app signs HS256 JWS
 * tokens with `AUTH_SECRET`; we verify the same with `jose` here so any
 * Elysia route can know the current user without a round-trip to /api/auth/session.
 *
 * Stateless: no DB read on the hot path. The token contains:
 *   { sub: <providerSpecificId>, name, picture, provider, iat, exp }
 *
 * For SIWE the `sub` is the lowercase wallet address (so we don't need a
 * separate `users` row to start gating). For other providers (email/twitter/
 * telegram) `sub` is whatever Auth.js assigned — those are linked to a real
 * users table when we add the Drizzle adapter.
 */

import { jwtVerify } from "jose";

const SECRET = process.env["AUTH_SECRET"] ?? "";
const KEY = SECRET ? new TextEncoder().encode(SECRET) : null;

export type AuthUser = {
  id: string;
  name: string | null;
  image: string | null;
  provider: string | null;
};

/** Cookie name used by Auth.js v5 — `__Secure-` prefix in production
 *  (HTTPS), plain in dev. We try both. */
const COOKIE_NAMES = ["__Secure-authjs.session-token", "authjs.session-token"];

function readCookie(headerValue: string | null, name: string): string | null {
  if (!headerValue) return null;
  for (const part of headerValue.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

export async function readAuthFromHeaders(headers: Headers): Promise<AuthUser | null> {
  if (!KEY) return null;
  const cookieHeader = headers.get("cookie");
  let token: string | null = null;
  for (const name of COOKIE_NAMES) {
    token = readCookie(cookieHeader, name);
    if (token) break;
  }
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, KEY, { algorithms: ["HS256"] });
    return {
      id: typeof payload.sub === "string" ? payload.sub : "",
      name: typeof payload["name"] === "string" ? (payload["name"] as string) : null,
      image: typeof payload["picture"] === "string" ? (payload["picture"] as string) : null,
      provider:
        typeof payload["provider"] === "string" ? (payload["provider"] as string) : null,
    };
  } catch {
    return null;
  }
}

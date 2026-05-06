/**
 * Pure credential verifiers for the Credentials providers (SIWE +
 * Telegram). Used in two places:
 *   1. The Auth.js `authorize()` callback, where a successful verify
 *      returns the user identity for a fresh sign-in.
 *   2. The /api/account/link/* endpoints, where a successful verify
 *      attaches the credential to the CURRENT session's user instead of
 *      creating a new identity.
 *
 * Pulled out of auth.ts so both call sites stay in sync — drift between
 * "what we accept at sign-in" and "what we accept at link" is exactly the
 * kind of bug that costs users their accounts.
 */

import { SiweMessage } from "siwe";

export type SiweOk = { ok: true; address: string };
export type TelegramOk = { ok: true; telegramId: string; username: string | null; firstName: string | null; photoUrl: string | null };
export type VerifyFail = { ok: false; reason: string };

export async function verifySiwe(input: { message: string; signature: string }): Promise<SiweOk | VerifyFail> {
  if (!input.message || !input.signature) return { ok: false, reason: "missing message or signature" };
  try {
    const siwe = new SiweMessage(input.message);
    const result = await siwe.verify({
      signature: input.signature,
      domain: siwe.domain,
      nonce: siwe.nonce,
    });
    if (!result.success) return { ok: false, reason: "signature verify failed" };
    return { ok: true, address: siwe.address.toLowerCase() };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

/** 24-hour replay window — Telegram payloads include an auth_date so we
 *  reject anything old enough that the signing key may have rotated. */
const TELEGRAM_MAX_AGE_SEC = 86_400;

export async function verifyTelegram(input: { payload: string; botToken: string }): Promise<TelegramOk | VerifyFail> {
  if (!input.payload) return { ok: false, reason: "missing payload" };
  if (!input.botToken) return { ok: false, reason: "bot token not configured" };
  try {
    const payload = JSON.parse(input.payload) as Record<string, string>;
    const { hash, ...fields } = payload;
    if (!hash) return { ok: false, reason: "payload has no hash" };
    // Per Telegram spec: build data_check_string from sorted key=value
    // joined by \n, then HMAC-SHA256 with key = SHA256(bot_token).
    const checkString = Object.keys(fields)
      .sort()
      .map((k) => `${k}=${fields[k]}`)
      .join("\n");
    const { createHmac, createHash } = await import("node:crypto");
    const secretKey = createHash("sha256").update(input.botToken).digest();
    const computed = createHmac("sha256", secretKey).update(checkString).digest("hex");
    if (computed !== hash) return { ok: false, reason: "hash mismatch" };
    const authDate = Number(fields["auth_date"]);
    if (!authDate || Date.now() / 1000 - authDate > TELEGRAM_MAX_AGE_SEC) {
      return { ok: false, reason: "payload expired" };
    }
    const id = fields["id"];
    if (!id) return { ok: false, reason: "payload has no id" };
    return {
      ok: true,
      telegramId: id,
      username: fields["username"] ?? null,
      firstName: fields["first_name"] ?? null,
      photoUrl: fields["photo_url"] ?? null,
    };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

/**
 * Verifies a Telegram Mini App `initData` payload.
 *
 * Different from the Login Widget hash check (verifyTelegram above) in two
 * ways: the wire format is a URL-encoded query string (not pre-parsed
 * JSON), and the secret-key derivation is keyed differently —
 * `HMAC-SHA256("WebAppData", bot_token)` rather than `SHA256(bot_token)`.
 * Spec: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * The `user` field is itself JSON-encoded inside the query string;
 * we decode it and surface id / username / first_name / photo_url to
 * match the existing TelegramOk shape so downstream user creation in
 * auth.ts can reuse the same `tg:${telegramId}` identity.
 */
export async function verifyTelegramWebApp(input: {
  initData: string;
  botToken: string;
}): Promise<TelegramOk | VerifyFail> {
  if (!input.initData) return { ok: false, reason: "missing initData" };
  if (!input.botToken) return { ok: false, reason: "bot token not configured" };
  try {
    const params = new URLSearchParams(input.initData);
    const hash = params.get("hash");
    if (!hash) return { ok: false, reason: "initData has no hash" };
    params.delete("hash");
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    const { createHmac } = await import("node:crypto");
    const secretKey = createHmac("sha256", "WebAppData")
      .update(input.botToken)
      .digest();
    const computed = createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");
    if (computed !== hash) return { ok: false, reason: "hash mismatch" };
    const authDate = Number(params.get("auth_date"));
    if (!authDate || Date.now() / 1000 - authDate > TELEGRAM_MAX_AGE_SEC) {
      return { ok: false, reason: "initData expired" };
    }
    const userJson = params.get("user");
    if (!userJson) return { ok: false, reason: "initData has no user" };
    const user = JSON.parse(userJson) as {
      id?: number | string;
      username?: string;
      first_name?: string;
      photo_url?: string;
    };
    if (!user.id) return { ok: false, reason: "user payload missing id" };
    return {
      ok: true,
      telegramId: String(user.id),
      username: user.username ?? null,
      firstName: user.first_name ?? null,
      photoUrl: user.photo_url ?? null,
    };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

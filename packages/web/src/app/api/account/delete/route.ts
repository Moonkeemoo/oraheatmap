import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/db";

/**
 * GDPR account deletion. auth_users rows cascade to auth_accounts /
 * auth_sessions / auth_authenticators via ON DELETE CASCADE in the
 * schema. user_row_orders has no FK on auth_users by design (SIWE /
 * Telegram users persist row order without ever touching the adapter
 * tables) — we DELETE it explicitly for adapter-managed users too.
 *
 * SIWE / Telegram users (no auth_users row) won't match the DELETE on
 * auth_users; the user_row_orders cleanup is the only on-disk wipe.
 *
 * The session cookie itself is cleared client-side via NextAuth
 * `signOut()` after this endpoint succeeds.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const userId = session.user.id;

  const { sql } = getDb();
  // DELETE order matters less because of CASCADE — but explicit row_orders
  // first means even if the auth_users row doesn't exist (Credentials
  // providers), preferences are still wiped.
  await sql`DELETE FROM user_row_orders WHERE user_id = ${userId}`;
  await sql`DELETE FROM auth_users WHERE id = ${userId}`;

  return NextResponse.json({ ok: true, userId }, { status: 200 });
}

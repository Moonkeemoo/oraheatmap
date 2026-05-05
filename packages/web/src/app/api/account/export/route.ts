import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/db";

/**
 * GDPR data export — returns a JSON dump of everything we hold for the
 * current user across the auth tables + user_row_orders. SIWE / Telegram
 * users only have a session JWT (no DB rows from the adapter), so the
 * returned payload may be sparse — that's correct, not a bug.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const userId = session.user.id;

  const { sql } = getDb();
  // Run all four reads in parallel — none depend on each other.
  const [users, accounts, sessions, rowOrders] = await Promise.all([
    sql`SELECT id, name, email, email_verified, image FROM auth_users WHERE id = ${userId}`,
    sql`SELECT type, provider, provider_account_id, scope FROM auth_accounts WHERE user_id = ${userId}`,
    sql`SELECT session_token, expires FROM auth_sessions WHERE user_id = ${userId}`,
    sql`SELECT scope, ordered_keys, updated_at FROM user_row_orders WHERE user_id = ${userId}`,
  ]);

  const filename = `oralab-account-${userId.slice(0, 12)}-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        userId,
        sessionProvider: (session as { provider?: string }).provider ?? null,
        userRow: users[0] ?? null,
        connectedAccounts: accounts,
        activeSessions: sessions,
        savedRowOrders: rowOrders,
      },
      null,
      2,
    ),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    },
  );
}

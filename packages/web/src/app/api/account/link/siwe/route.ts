import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getDb } from "@/db";
import { verifySiwe } from "@/lib/credentials";

/**
 * Attach a SIWE wallet credential to the CURRENT signed-in user. Differs
 * from /api/auth/signin/siwe (which mints a fresh session keyed off the
 * wallet address) — this one writes a row into auth_accounts so future
 * MetaMask sign-ins resolve to the same user_id via auth.ts'
 * findLinkedUserId() fallback.
 *
 * Idempotent on (provider, providerAccountId) thanks to the table's
 * primary key. Refuses if the wallet is already linked to a DIFFERENT
 * account (would be a silent account-merge attempt).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = (await req.json().catch(() => null)) as { message?: string; signature?: string } | null;
  if (!body?.message || !body?.signature) {
    return NextResponse.json({ error: "missing message or signature" }, { status: 400 });
  }

  const verify = await verifySiwe({ message: body.message, signature: body.signature });
  if (!verify.ok) {
    return NextResponse.json({ error: `siwe verify failed: ${verify.reason}` }, { status: 400 });
  }
  const address = verify.address;

  const { sql } = getDb();
  const existing = await sql<{ user_id: string }[]>`
    SELECT user_id FROM auth_accounts
    WHERE provider = 'siwe' AND provider_account_id = ${address}
    LIMIT 1
  `;
  if (existing[0]) {
    if (existing[0].user_id === userId) {
      return NextResponse.json({ ok: true, alreadyLinked: true, address });
    }
    return NextResponse.json(
      { error: "this wallet is already linked to another oralab account" },
      { status: 409 },
    );
  }

  // The DB adapter creates auth_users rows for OAuth + Email providers,
  // but SIWE/Telegram users live in JWTs only. If the current session
  // belongs to one of those (no row in auth_users), we INSERT a stub so
  // the FK on auth_accounts.user_id is satisfied.
  const userRow = await sql<{ id: string }[]>`SELECT id FROM auth_users WHERE id = ${userId} LIMIT 1`;
  if (userRow.length === 0) {
    await sql`
      INSERT INTO auth_users (id, name)
      VALUES (${userId}, ${(session.user.name as string | null) ?? null})
      ON CONFLICT (id) DO NOTHING
    `;
  }

  await sql`
    INSERT INTO auth_accounts (user_id, type, provider, provider_account_id)
    VALUES (${userId}, 'credentials', 'siwe', ${address})
  `;

  return NextResponse.json({ ok: true, address });
}

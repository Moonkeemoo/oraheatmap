import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getDb } from "@/db";
import { verifyTelegram } from "@/lib/credentials";

/**
 * Attach a verified Telegram identity to the CURRENT signed-in user.
 * Mirrors /api/account/link/siwe — same idempotency rules, same
 * cross-account refusal, same auth_users-stub creation for sessions
 * that came in via a Credentials provider with no DB row yet.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = (await req.json().catch(() => null)) as { payload?: string } | null;
  if (!body?.payload) {
    return NextResponse.json({ error: "missing payload" }, { status: 400 });
  }

  const botToken = process.env["TG_LOGIN_BOT_TOKEN"];
  if (!botToken) {
    return NextResponse.json({ error: "telegram not configured" }, { status: 503 });
  }

  const verify = await verifyTelegram({ payload: body.payload, botToken });
  if (!verify.ok) {
    return NextResponse.json({ error: `telegram verify failed: ${verify.reason}` }, { status: 400 });
  }
  const tgId = verify.telegramId;

  const { sql } = getDb();
  const existing = await sql<{ user_id: string }[]>`
    SELECT user_id FROM auth_accounts
    WHERE provider = 'telegram' AND provider_account_id = ${tgId}
    LIMIT 1
  `;
  if (existing[0]) {
    if (existing[0].user_id === userId) {
      return NextResponse.json({ ok: true, alreadyLinked: true, telegramId: tgId });
    }
    return NextResponse.json(
      { error: "this Telegram account is already linked to another oralab account" },
      { status: 409 },
    );
  }

  const userRow = await sql<{ id: string }[]>`SELECT id FROM auth_users WHERE id = ${userId} LIMIT 1`;
  if (userRow.length === 0) {
    await sql`
      INSERT INTO auth_users (id, name, image)
      VALUES (${userId}, ${(session.user.name as string | null) ?? null}, ${(session.user.image as string | null) ?? null})
      ON CONFLICT (id) DO NOTHING
    `;
  }

  await sql`
    INSERT INTO auth_accounts (user_id, type, provider, provider_account_id)
    VALUES (${userId}, 'credentials', 'telegram', ${tgId})
  `;

  return NextResponse.json({ ok: true, telegramId: tgId });
}

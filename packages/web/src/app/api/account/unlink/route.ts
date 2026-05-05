import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getDb } from "@/db";

/**
 * Detach a sign-in method from the current account. Refuses if it would
 * leave the user with zero providers — that's how people permanently lock
 * themselves out. (Account-deletion is a separate, explicit endpoint.)
 *
 * Body: { provider: "siwe" | "telegram" | "github" | "discord" | "resend",
 *         providerAccountId: string }
 *   The providerAccountId is needed because a user may eventually link
 *   multiple wallets / TG accounts; we don't drop the wrong row.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = (await req.json().catch(() => null)) as
    | { provider?: string; providerAccountId?: string }
    | null;
  if (!body?.provider || !body?.providerAccountId) {
    return NextResponse.json({ error: "missing provider or providerAccountId" }, { status: 400 });
  }

  const { sql } = getDb();
  const all = await sql<{ provider: string; provider_account_id: string }[]>`
    SELECT provider, provider_account_id FROM auth_accounts WHERE user_id = ${userId}
  `;
  if (all.length === 0) {
    return NextResponse.json({ error: "no linked providers found" }, { status: 404 });
  }
  const target = all.find(
    (r) => r.provider === body.provider && r.provider_account_id === body.providerAccountId,
  );
  if (!target) {
    return NextResponse.json({ error: "that provider is not linked to your account" }, { status: 404 });
  }
  if (all.length === 1) {
    return NextResponse.json(
      { error: "can't disconnect your only sign-in method — add another first or delete the account" },
      { status: 409 },
    );
  }

  await sql`
    DELETE FROM auth_accounts
    WHERE user_id = ${userId}
      AND provider = ${body.provider}
      AND provider_account_id = ${body.providerAccountId}
  `;
  return NextResponse.json({ ok: true });
}

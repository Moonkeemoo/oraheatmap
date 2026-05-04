import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

/**
 * Postgres connection used by Auth.js Drizzle adapter. Mirrors the same
 * unix-socket detection logic as packages/api/src/db.ts so we work both
 * locally (TCP) and on the VPS (peer auth via /var/run/postgresql).
 */

let cached: { db: PostgresJsDatabase; sql: Sql } | null = null;

export function getDb(): { db: PostgresJsDatabase; sql: Sql } {
  if (cached) return cached;
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is required for the Auth.js adapter");
  let connectionString = url;
  let socketHost: string | undefined;
  try {
    const u = new URL(url);
    const hostQuery = u.searchParams.get("host");
    if (hostQuery && hostQuery.startsWith("/")) {
      socketHost = hostQuery;
      u.searchParams.delete("host");
      connectionString = u.toString();
    }
  } catch {
    // bad URL — let postgres() throw with its own message
  }
  const sql = postgres(connectionString, {
    max: 3,
    idle_timeout: 30,
    onnotice: () => {},
    ...(socketHost ? { host: socketHost } : {}),
  });
  cached = { db: drizzle(sql), sql };
  return cached;
}

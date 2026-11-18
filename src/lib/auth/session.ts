import "server-only";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { SESSION_COOKIE, SESSION_TTL_MS, hashToken, newSessionToken, sessionCookieOptions } from "./tokens";

export type SessionUser = { id: string; email: string; name: string };

export async function createSession(userId: string) {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(schema.sessions).values({ tokenHash: hashToken(token), userId, expiresAt });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(env.isProd, expiresAt));
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.tokenHash, hashToken(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, hashToken(token)));
  jar.delete(SESSION_COOKIE);
}

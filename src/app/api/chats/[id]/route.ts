import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { HttpError, assertSameOrigin, handleError, json } from "@/lib/http";

export const dynamic = "force-dynamic";
const ID = /^[A-Za-z0-9_-]{6,40}$/;

async function owner(ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "Sign in to sync chats");
  const { id } = await ctx.params;
  if (!ID.test(id)) throw new HttpError(400, "Bad chat id");
  return { user, id };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { user, id } = await owner(ctx);
    const [row] = await db.select().from(schema.chats).where(and(eq(schema.chats.id, id), eq(schema.chats.userId, user.id))).limit(1);
    if (!row) throw new HttpError(404, "Chat not found");
    return json({ chat: { id: row.id, title: row.title, at: row.updatedAt, turns: row.turns } });
  } catch (err) {
    return handleError(err);
  }
}

// Turns are what the UI rendered (picks with place snapshots); size-capped to keep rows small.
const Body = z.object({ title: z.string().trim().min(1).max(120), turns: z.array(z.record(z.string(), z.unknown())).max(40) });

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const { user, id } = await owner(ctx);
    const raw = await req.text();
    if (raw.length > 400_000) throw new HttpError(413, "Chat too large");
    const body = Body.safeParse(JSON.parse(raw || "null"));
    if (!body.success) throw new HttpError(400, "Invalid chat");
    // Upsert, but never take over another user's chat id.
    const [existing] = await db.select({ userId: schema.chats.userId }).from(schema.chats).where(eq(schema.chats.id, id)).limit(1);
    if (existing && existing.userId !== user.id) throw new HttpError(404, "Chat not found");
    await db
      .insert(schema.chats)
      .values({ id, userId: user.id, title: body.data.title, turns: body.data.turns, updatedAt: new Date() })
      .onConflictDoUpdate({ target: schema.chats.id, set: { title: body.data.title, turns: body.data.turns, updatedAt: new Date() } });
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const { user, id } = await owner(ctx);
    await db.delete(schema.chats).where(and(eq(schema.chats.id, id), eq(schema.chats.userId, user.id)));
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

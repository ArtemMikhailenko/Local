import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { summarize } from "@/lib/events";
import { HttpError, assertSameOrigin, clientIp, handleError, json } from "@/lib/http";
import { VOTER_COOKIE, newVoterId } from "@/lib/polls";
import { loadEvent } from "@/lib/events-db";
import { createRateLimiter } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
const limiter = createRateLimiter(20, 60_000);

async function state(id: string, voterId?: string) {
  const ev = await loadEvent(id);
  const rsvps = await db
    .select({ name: schema.eventRsvps.name, status: schema.eventRsvps.status, voterId: schema.eventRsvps.voterId })
    .from(schema.eventRsvps)
    .where(eq(schema.eventRsvps.eventId, id));
  const me = rsvps.find((r) => voterId && r.voterId === voterId);
  return {
    id: ev.id,
    title: ev.title,
    place: ev.place,
    startsAt: ev.startsAt,
    note: ev.note,
    past: ev.startsAt.getTime() < Date.now() - 3 * 60 * 60_000,
    ...summarize(rsvps),
    mine: me ? { name: me.name, status: me.status } : null,
  };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return json(await state(id, (await cookies()).get(VOTER_COOKIE)?.value), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return handleError(err);
  }
}

const Body = z.object({ name: z.string().trim().min(1).max(30), status: z.enum(["going", "maybe", "no"]) });

/** RSVP: one answer per browser (anonymous cookie), can be changed any time. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    if (!limiter.check(`rsvp:${clientIp(req)}`).ok) throw new HttpError(429, "Slow down a little");
    const { id } = await ctx.params;
    const body = Body.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new HttpError(400, "Add your name and an answer");
    await loadEvent(id);
    const jar = await cookies();
    let voterId = jar.get(VOTER_COOKIE)?.value;
    if (!voterId || !/^[\w-]{20,}$/.test(voterId)) {
      voterId = newVoterId();
      jar.set(VOTER_COOKIE, voterId, { httpOnly: true, secure: env.isProd, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90 });
    }
    await db
      .insert(schema.eventRsvps)
      .values({ eventId: id, voterId, name: body.data.name, status: body.data.status })
      .onConflictDoUpdate({ target: [schema.eventRsvps.eventId, schema.eventRsvps.voterId], set: { name: body.data.name, status: body.data.status, updatedAt: new Date() } });
    return json(await state(id, voterId));
  } catch (err) {
    return handleError(err);
  }
}

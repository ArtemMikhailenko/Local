import { cookies } from "next/headers";
import { desc, eq, inArray, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { summarize } from "@/lib/events";
import { handleError, json } from "@/lib/http";
import { POLL_ID_RE, VOTER_COOKIE } from "@/lib/polls";

export const dynamic = "force-dynamic";

/** Events this person created (account or this browser) or answered. Nothing else is listable. */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const voterId = (await cookies()).get(VOTER_COOKIE)?.value;
    const created = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter((id) => POLL_ID_RE.test(id)).slice(0, 30);
    const answered = voterId
      ? (await db.select({ id: schema.eventRsvps.eventId }).from(schema.eventRsvps).where(eq(schema.eventRsvps.voterId, voterId)).limit(50)).map((r) => r.id)
      : [];
    const ids = [...new Set([...created, ...answered])];
    const conds = [ids.length ? inArray(schema.events.id, ids) : undefined, user ? eq(schema.events.ownerId, user.id) : undefined].filter(Boolean);
    if (!conds.length) return json({ events: [] });
    const rows = await db
      .select()
      .from(schema.events)
      .where(or(...(conds as NonNullable<(typeof conds)[number]>[])))
      .orderBy(desc(schema.events.startsAt))
      .limit(30);
    const rsvps = rows.length
      ? await db.select({ eventId: schema.eventRsvps.eventId, name: schema.eventRsvps.name, status: schema.eventRsvps.status }).from(schema.eventRsvps).where(inArray(schema.eventRsvps.eventId, rows.map((r) => r.id)))
      : [];
    return json({
      events: rows.map((e) => ({
        id: e.id,
        title: e.title,
        startsAt: e.startsAt,
        place: { name: e.place.name, photo: e.place.photos[0] ?? null, type: e.place.type },
        going: summarize(rsvps.filter((r) => r.eventId === e.id)).going.length,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

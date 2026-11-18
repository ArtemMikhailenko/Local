import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { PUBLIC_WINDOW, nearbyEvents } from "@/lib/events";
import { parseLatLng } from "@/lib/geo";
import { clientIp, handleError, HttpError, json } from "@/lib/http";
import { createRateLimiter } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
const limiter = createRateLimiter(60, 60_000);

/** Public events near a point for the map. Only public ones; private events are never listed. */
export async function GET(req: Request) {
  try {
    if (!limiter.check(`evp:${clientIp(req)}`).ok) throw new HttpError(429, "Slow down a little");
    const url = new URL(req.url);
    const at = parseLatLng(url.searchParams.get("lat"), url.searchParams.get("lng"));
    if (!at) throw new HttpError(400, "lat and lng are required");
    const now = Date.now();
    const rows = await db
      .select({ id: schema.events.id, title: schema.events.title, startsAt: schema.events.startsAt, place: schema.events.place })
      .from(schema.events)
      .where(
        and(
          eq(schema.events.visibility, "public"),
          gte(schema.events.startsAt, new Date(now - PUBLIC_WINDOW.pastMs)),
          lte(schema.events.startsAt, new Date(now + PUBLIC_WINDOW.aheadMs)),
        ),
      )
      .limit(300);
    const near = nearbyEvents(rows, at, now).slice(0, 40);
    const going = near.length
      ? await db
          .select({ eventId: schema.eventRsvps.eventId })
          .from(schema.eventRsvps)
          .where(and(inArray(schema.eventRsvps.eventId, near.map((e) => e.id)), eq(schema.eventRsvps.status, "going")))
      : [];
    return json(
      {
        events: near.map((e) => ({
          id: e.id,
          title: e.title,
          startsAt: e.startsAt,
          going: going.filter((g) => g.eventId === e.id).length,
          place: { id: e.place.id, name: e.place.name, type: e.place.type, location: e.place.location, photo: e.place.photos[0] ?? null },
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return handleError(err);
  }
}

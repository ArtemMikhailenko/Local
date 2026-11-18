import { z } from "zod";
import { db, schema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { HttpError, assertSameOrigin, clientIp, handleError, json } from "@/lib/http";
import { places } from "@/lib/places";
import { newPollId } from "@/lib/polls";
import { createRateLimiter } from "@/lib/ratelimit";

const limiter = createRateLimiter(10, 60_000);
const Body = z.object({
  placeId: z.string().min(1).max(200),
  title: z.string().trim().min(1).max(100),
  startsAt: z.string().datetime({ offset: true }),
  note: z.string().trim().max(400).optional(),
});

/** Create a meetup at a place. The place snapshot is fetched server-side, never trusted from the client. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    if (!limiter.check(`ev:${clientIp(req)}`).ok) throw new HttpError(429, "Too many events, try again in a minute");
    const body = Body.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new HttpError(400, "Add a title, date and time");
    const startsAt = new Date(body.data.startsAt);
    if (startsAt.getTime() < Date.now() - 60 * 60_000) throw new HttpError(400, "That time is in the past");
    if (startsAt.getTime() > Date.now() + 365 * 24 * 60 * 60_000) throw new HttpError(400, "Pick a date within a year");
    const place = await places.details(body.data.placeId);
    if (!place) throw new HttpError(404, "Place not found");
    const user = await getSessionUser();
    const id = newPollId();
    await db.insert(schema.events).values({
      id,
      ownerId: user?.id ?? null,
      title: body.data.title,
      place: { ...place, reviews: [] },
      startsAt,
      note: body.data.note || null,
    });
    return json({ id }, 201);
  } catch (err) {
    return handleError(err);
  }
}

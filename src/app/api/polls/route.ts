import { z } from "zod";
import { db, schema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { HttpError, assertSameOrigin, clientIp, handleError, json } from "@/lib/http";
import { places } from "@/lib/places";
import { POLL_TTL_MS, newPollId } from "@/lib/polls";
import { createRateLimiter } from "@/lib/ratelimit";

const limiter = createRateLimiter(10, 60_000);
const Body = z.object({
  title: z.string().trim().min(1).max(80),
  placeIds: z.array(z.string().min(1).max(200)).min(2).max(4),
});

/** Creates a shortlist to vote on. Place data is fetched server-side, never trusted from the client. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    if (!limiter.check(`poll:${clientIp(req)}`).ok) throw new HttpError(429, "Too many polls, try again in a minute");
    const body = Body.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new HttpError(400, "Pick 2–4 places to vote on");
    const found = (await Promise.all([...new Set(body.data.placeIds)].map((id) => places.details(id)))).filter((p) => p !== null);
    if (found.length < 2) throw new HttpError(404, "Places not found");
    const user = await getSessionUser();
    const id = newPollId();
    await db.insert(schema.polls).values({
      id,
      ownerId: user?.id ?? null,
      title: body.data.title,
      places: found.map((p) => ({ ...p, reviews: [] })), // keep the snapshot small
      expiresAt: new Date(Date.now() + POLL_TTL_MS),
    });
    return json({ id }, 201);
  } catch (err) {
    return handleError(err);
  }
}

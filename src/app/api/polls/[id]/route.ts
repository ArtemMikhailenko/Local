import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError, assertSameOrigin, clientIp, handleError, json } from "@/lib/http";
import { POLL_ID_RE, VOTER_COOKIE, newVoterId, tally } from "@/lib/polls";
import { createRateLimiter } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
const voteLimiter = createRateLimiter(20, 60_000);

async function loadPoll(id: string) {
  if (!POLL_ID_RE.test(id)) throw new HttpError(404, "This vote does not exist");
  const [poll] = await db
    .select()
    .from(schema.polls)
    .where(and(eq(schema.polls.id, id), gt(schema.polls.expiresAt, new Date())))
    .limit(1);
  if (!poll) throw new HttpError(404, "This vote has ended or does not exist");
  return poll;
}

async function state(id: string, voterId: string | undefined) {
  const poll = await loadPoll(id);
  const votes = await db
    .select({ placeId: schema.pollVotes.placeId, name: schema.pollVotes.name, voterId: schema.pollVotes.voterId })
    .from(schema.pollVotes)
    .where(eq(schema.pollVotes.pollId, id));
  const { rows, leader } = tally(
    poll.places.map((p) => p.id),
    votes,
  );
  return {
    id: poll.id,
    title: poll.title,
    places: poll.places,
    tally: rows,
    leader,
    total: votes.length,
    myVote: votes.find((v) => voterId && v.voterId === voterId)?.placeId ?? null,
    expiresAt: poll.expiresAt,
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

const VoteBody = z.object({ placeId: z.string().min(1).max(200), name: z.string().trim().min(1).max(30) });

/** One vote per browser (random httpOnly cookie id); voting again changes your vote. No account needed. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    if (!voteLimiter.check(`vote:${clientIp(req)}`).ok) throw new HttpError(429, "Slow down a little");
    const { id } = await ctx.params;
    const body = VoteBody.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new HttpError(400, "Add your name and pick a place");
    const poll = await loadPoll(id);
    if (!poll.places.some((p) => p.id === body.data.placeId)) throw new HttpError(400, "That place is not in this vote");

    const jar = await cookies();
    let voterId = jar.get(VOTER_COOKIE)?.value;
    if (!voterId || !/^[\w-]{20,}$/.test(voterId)) {
      voterId = newVoterId();
      jar.set(VOTER_COOKIE, voterId, { httpOnly: true, secure: env.isProd, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    }
    await db
      .insert(schema.pollVotes)
      .values({ pollId: id, voterId, placeId: body.data.placeId, name: body.data.name })
      .onConflictDoUpdate({ target: [schema.pollVotes.pollId, schema.pollVotes.voterId], set: { placeId: body.data.placeId, name: body.data.name } });
    return json(await state(id, voterId));
  } catch (err) {
    return handleError(err);
  }
}

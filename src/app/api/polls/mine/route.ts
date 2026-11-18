import { cookies } from "next/headers";
import { desc, eq, inArray, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { handleError, json } from "@/lib/http";
import { POLL_ID_RE, VOTER_COOKIE, tally } from "@/lib/polls";

export const dynamic = "force-dynamic";

/**
 * Votes that concern this person: ones they created (account, or ids this browser created)
 * and ones they voted in (voter cookie). Nothing else is listable, so poll links stay private.
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const voterId = (await cookies()).get(VOTER_COOKIE)?.value;
    const created = (new URL(req.url).searchParams.get("ids") ?? "")
      .split(",")
      .filter((id) => POLL_ID_RE.test(id))
      .slice(0, 30);

    const votedIn = voterId
      ? (await db.select({ id: schema.pollVotes.pollId }).from(schema.pollVotes).where(eq(schema.pollVotes.voterId, voterId)).limit(50)).map((r) => r.id)
      : [];
    const ids = [...new Set([...created, ...votedIn])];
    const conds = [ids.length ? inArray(schema.polls.id, ids) : undefined, user ? eq(schema.polls.ownerId, user.id) : undefined].filter(Boolean);
    if (!conds.length) return json({ polls: [] });

    const polls = await db
      .select()
      .from(schema.polls)
      .where(or(...(conds as NonNullable<(typeof conds)[number]>[])))
      .orderBy(desc(schema.polls.createdAt))
      .limit(30);
    const votes = polls.length
      ? await db.select({ pollId: schema.pollVotes.pollId, placeId: schema.pollVotes.placeId, name: schema.pollVotes.name }).from(schema.pollVotes).where(inArray(schema.pollVotes.pollId, polls.map((p) => p.id)))
      : [];

    return json({
      polls: polls.map((p) => {
        const mine = votes.filter((v) => v.pollId === p.id);
        const { leader } = tally(p.places.map((x) => x.id), mine);
        const lead = p.places.find((x) => x.id === leader);
        return {
          id: p.id,
          title: p.title,
          createdAt: p.createdAt,
          active: p.expiresAt > new Date(),
          total: mine.length,
          leader: lead ? { name: lead.name, photo: lead.photos[0] ?? null } : null,
          options: p.places.map((x) => ({ name: x.name, photo: x.photos[0] ?? null })),
        };
      }),
    });
  } catch (err) {
    return handleError(err);
  }
}

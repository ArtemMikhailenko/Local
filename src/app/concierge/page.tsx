import type { Metadata } from "next";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { POLL_ID_RE } from "@/lib/polls";
import { ConciergeClient } from "./concierge-client";

/** Vote links get a proper preview in messengers: title, the options and the first venue photo. */
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ poll?: string; event?: string }> }): Promise<Metadata> {
  const { poll, event } = await searchParams;
  if (event && POLL_ID_RE.test(event)) {
    try {
      const [ev] = await db.select().from(schema.events).where(eq(schema.events.id, event)).limit(1);
      if (ev) {
        const when = ev.startsAt.toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
        const image = ev.place.photos[0];
        return {
          title: `🗓 ${ev.title}`,
          description: `${ev.place.name} · ${when}. Tap to answer: going, maybe or can't.`,
          openGraph: { title: `🗓 ${ev.title}`, description: `${ev.place.name} · ${when}`, images: image ? [image] : undefined },
        };
      }
    } catch {}
  }
  if (!poll || !POLL_ID_RE.test(poll)) return { title: "Lumi · your concierge" };
  try {
    const [row] = await db
      .select({ title: schema.polls.title, places: schema.polls.places })
      .from(schema.polls)
      .where(and(eq(schema.polls.id, poll), gt(schema.polls.expiresAt, new Date())))
      .limit(1);
    if (!row) return { title: "Locali" };
    const names = row.places.map((p) => p.name).join(" · ");
    const image = row.places.find((p) => p.photos[0])?.photos[0];
    return {
      title: `🗳 ${row.title}`,
      description: `${names}. Tap to vote, no sign-up needed.`,
      openGraph: { title: `🗳 ${row.title}`, description: names, images: image ? [image] : undefined },
    };
  } catch {
    return { title: "Locali" };
  }
}

export default function ConciergePage() {
  return <ConciergeClient />;
}

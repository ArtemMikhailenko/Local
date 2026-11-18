import { toIcs } from "@/lib/events";
import { handleError } from "@/lib/http";
import { loadEvent } from "@/lib/events-db";

/** "Add to calendar": downloads an .ics file the phone opens in its calendar app. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const ev = await loadEvent(id);
    const url = `${new URL(req.url).origin}/concierge?event=${ev.id}`;
    const ics = toIcs({ id: ev.id, title: ev.title, place: ev.place, startsAt: ev.startsAt, note: ev.note, url });
    return new Response(ics, {
      headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="locali-${ev.id}.ics"` },
    });
  } catch (err) {
    return handleError(err);
  }
}

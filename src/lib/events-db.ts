import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { POLL_ID_RE } from "@/lib/polls";

export async function loadEvent(id: string) {
  if (!POLL_ID_RE.test(id)) throw new HttpError(404, "This event does not exist");
  const [ev] = await db.select().from(schema.events).where(eq(schema.events.id, id)).limit(1);
  if (!ev) throw new HttpError(404, "This event does not exist");
  return ev;
}

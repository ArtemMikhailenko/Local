import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { HttpError, assertSameOrigin, handleError, json } from "@/lib/http";
import { places } from "@/lib/places";

export const dynamic = "force-dynamic";

async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "Sign in to save places");
  return user;
}

/** Every query is scoped by the session user's id: there is no way to read or change another user's list. */
export async function GET() {
  try {
    const user = await requireUser();
    const rows = await db
      .select({ place: schema.savedPlaces.snapshot, note: schema.savedPlaces.note, savedAt: schema.savedPlaces.createdAt })
      .from(schema.savedPlaces)
      .where(eq(schema.savedPlaces.userId, user.id))
      .orderBy(desc(schema.savedPlaces.createdAt));
    return json({ saved: rows });
  } catch (err) {
    return handleError(err);
  }
}

const SaveBody = z.object({ placeId: z.string().min(1).max(200), note: z.string().trim().max(280).optional() });

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const body = SaveBody.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new HttpError(400, "Invalid place");
    // The snapshot is fetched server-side from the provider, never taken from the client body.
    const place = await places.details(body.data.placeId);
    if (!place) throw new HttpError(404, "Place not found");
    await db
      .insert(schema.savedPlaces)
      .values({ userId: user.id, placeId: place.id, snapshot: place, note: body.data.note ?? null })
      .onConflictDoUpdate({
        target: [schema.savedPlaces.userId, schema.savedPlaces.placeId],
        set: { snapshot: place, ...(body.data.note !== undefined ? { note: body.data.note } : {}) },
      });
    return json({ ok: true }, 201);
  } catch (err) {
    return handleError(err);
  }
}

const NoteBody = z.object({ placeId: z.string().min(1).max(200), note: z.string().trim().max(280) });

/** Private note on a saved place ("ask for the window table"). */
export async function PATCH(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const body = NoteBody.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new HttpError(400, "Note is too long (280 characters max)");
    const updated = await db
      .update(schema.savedPlaces)
      .set({ note: body.data.note || null })
      .where(and(eq(schema.savedPlaces.userId, user.id), eq(schema.savedPlaces.placeId, body.data.placeId)))
      .returning({ placeId: schema.savedPlaces.placeId });
    if (!updated.length) throw new HttpError(404, "Save the place first");
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const placeId = new URL(req.url).searchParams.get("placeId");
    if (!placeId) throw new HttpError(400, "placeId is required");
    await db
      .delete(schema.savedPlaces)
      .where(and(eq(schema.savedPlaces.userId, user.id), eq(schema.savedPlaces.placeId, placeId)));
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

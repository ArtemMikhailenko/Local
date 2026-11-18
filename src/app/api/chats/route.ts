import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { HttpError, handleError, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** The signed-in user's conversations with Lumi (titles only; turns are loaded per chat). */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Sign in to sync chats");
    const rows = await db
      .select({ id: schema.chats.id, title: schema.chats.title, updatedAt: schema.chats.updatedAt, turns: schema.chats.turns })
      .from(schema.chats)
      .where(eq(schema.chats.userId, user.id))
      .orderBy(desc(schema.chats.updatedAt))
      .limit(30);
    return json({ chats: rows.map((r) => ({ id: r.id, title: r.title, at: r.updatedAt, count: Array.isArray(r.turns) ? r.turns.length : 0 })) });
  } catch (err) {
    return handleError(err);
  }
}

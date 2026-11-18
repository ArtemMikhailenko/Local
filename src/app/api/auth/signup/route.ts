import { z } from "zod";
import { db, schema } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { HttpError, assertSameOrigin, clientIp, handleError, json } from "@/lib/http";
import { authLimiter } from "@/lib/ratelimit";

const Body = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    if (!authLimiter.check(`auth:${clientIp(req)}`).ok) throw new HttpError(429, "Too many attempts, try again in a minute");
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    const { name, email, password } = parsed.data;
    const [user] = await db
      .insert(schema.users)
      .values({ name, email, passwordHash: await hashPassword(password) })
      .onConflictDoNothing({ target: schema.users.email })
      .returning({ id: schema.users.id, name: schema.users.name, email: schema.users.email });
    if (!user) throw new HttpError(409, "An account with this email already exists");
    await createSession(user.id);
    return json({ user }, 201);
  } catch (err) {
    return handleError(err);
  }
}

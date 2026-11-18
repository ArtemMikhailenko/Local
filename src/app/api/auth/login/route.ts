import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { HttpError, assertSameOrigin, clientIp, handleError, json } from "@/lib/http";
import { authLimiter } from "@/lib/ratelimit";

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

// Hash compared against when the email is unknown, so response time does not reveal which emails exist.
const dummyHash = hashPassword("timing-equalizer");

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    if (!authLimiter.check(`auth:${clientIp(req)}`).ok) throw new HttpError(429, "Too many attempts, try again in a minute");
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Enter your email and password");
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, parsed.data.email)).limit(1);
    const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? (await dummyHash));
    if (!user || !ok) throw new HttpError(401, "Wrong email or password");
    await createSession(user.id);
    return json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    return handleError(err);
  }
}

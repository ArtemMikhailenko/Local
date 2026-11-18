import { destroySession } from "@/lib/auth/session";
import { assertSameOrigin, handleError, json } from "@/lib/http";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await destroySession();
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

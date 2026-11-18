import { getSessionUser } from "@/lib/auth/session";
import { placesMode } from "@/lib/env";
import { handleError, json } from "@/lib/http";
import { DEFAULT_CENTER } from "@/lib/geo";
import { places } from "@/lib/places";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Warm the venue cache for the default area so the first search is fast (fire-and-forget).
    places.search({ query: "restaurant", center: DEFAULT_CENTER }).catch(() => {});
    return json({ user: await getSessionUser(), mode: placesMode() });
  } catch (err) {
    return handleError(err);
  }
}

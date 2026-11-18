import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { PHOTO_REF_RE } from "@/lib/places/google";

const KEEP_MS = 3 * 24 * 60 * 60_000;
const redirect = (uri: string) => new Response(null, { status: 302, headers: { Location: uri, "Cache-Control": "public, max-age=21600, s-maxage=21600" } });

/**
 * Photo proxy: the browser asks us, we ask Google with the server-side key and redirect to the
 * googleusercontent URL. The API key never appears in the page, and the strict ref pattern
 * prevents using this endpoint to fetch arbitrary URLs (SSRF).
 *
 * The resulting URL is kept for 3 days per place photo (keyed by place id + position, because
 * Google issues new photo names on every search). When the daily photo quota is used up, an
 * older stored URL is still served rather than nothing.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ref = url.searchParams.get("ref") ?? "";
  const i = Math.min(Math.max(Number(url.searchParams.get("i")) || 0, 0), 9);
  if (!PHOTO_REF_RE.test(ref) || !env.googlePlacesKey) return new Response("Not found", { status: 404 });
  const key = `${ref.split("/")[1]}:${i}`;

  let stored: { uri: string; fetchedAt: Date } | undefined;
  try {
    [stored] = await db.select({ uri: schema.googlePhotos.uri, fetchedAt: schema.googlePhotos.fetchedAt }).from(schema.googlePhotos).where(eq(schema.googlePhotos.key, key)).limit(1);
  } catch {}
  if (stored && Date.now() - stored.fetchedAt.getTime() < KEEP_MS) return redirect(stored.uri);

  try {
    const res = await fetch(`https://places.googleapis.com/v1/${ref}/media?maxWidthPx=1200&skipHttpRedirect=true`, {
      headers: { "X-Goog-Api-Key": env.googlePlacesKey },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const { photoUri } = (await res.json()) as { photoUri?: string };
      if (photoUri?.startsWith("https://")) {
        await db
          .insert(schema.googlePhotos)
          .values({ key, uri: photoUri, fetchedAt: new Date() })
          .onConflictDoUpdate({ target: schema.googlePhotos.key, set: { uri: photoUri, fetchedAt: new Date() } })
          .catch(() => {});
        return redirect(photoUri);
      }
    }
  } catch {}
  // Quota used up or Google down: an older URL is better than no photo (it may still load).
  if (stored) return redirect(stored.uri);
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

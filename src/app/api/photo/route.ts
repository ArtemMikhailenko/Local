import { env } from "@/lib/env";
import { PHOTO_REF_RE } from "@/lib/places/google";

/**
 * Photo proxy: the browser asks us, we ask Google with the server-side key and redirect to the
 * short-lived googleusercontent URL. The API key never appears in the page, and the strict
 * ref pattern prevents using this endpoint to fetch arbitrary URLs (SSRF).
 */
export async function GET(req: Request) {
  const ref = new URL(req.url).searchParams.get("ref") ?? "";
  if (!PHOTO_REF_RE.test(ref) || !env.googlePlacesKey) return new Response("Not found", { status: 404 });
  const res = await fetch(
    `https://places.googleapis.com/v1/${ref}/media?maxWidthPx=1200&skipHttpRedirect=true`,
    // Shared caches (Vercel data cache + CDN for the redirect): one quota hit per photo, not per viewer.
    { headers: { "X-Goog-Api-Key": env.googlePlacesKey }, next: { revalidate: 86_400 } },
  );
  if (!res.ok) return new Response("Not found", { status: 404 });
  const { photoUri } = (await res.json()) as { photoUri?: string };
  if (!photoUri?.startsWith("https://")) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 302, headers: { Location: photoUri, "Cache-Control": "public, max-age=21600, s-maxage=21600" } });
}

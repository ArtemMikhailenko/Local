import sharp from "sharp";
import { count, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { PHOTO_REF_RE } from "@/lib/places/google";

const URI_KEEP_MS = 3 * 24 * 60 * 60_000;
const MAX_BYTES = 1_500_000; // downloaded original, before compression
const MAX_FILES = 6_000; // ~60 KB each as WebP: well inside the free Neon storage

const image = (data: Buffer, mime: string) =>
  new Response(new Uint8Array(data), { headers: { "Content-Type": mime, "Cache-Control": "public, max-age=2592000, s-maxage=2592000, immutable" } });

/** Download a googleusercontent image (not a Places API call, so it does not use the quota). */
async function download(uri: string): Promise<{ data: Buffer; mime: string } | null> {
  try {
    const res = await fetch(uri, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    const mime = res.headers.get("content-type") ?? "";
    if (!res.ok || !mime.startsWith("image/")) return null;
    const data = Buffer.from(await res.arrayBuffer());
    return data.length && data.length <= MAX_BYTES ? { data, mime } : null;
  } catch {
    return null;
  }
}

/**
 * Re-encode for storage: at most 900 px wide, WebP quality 80 (visually close to the original,
 * usually half the size of Google's JPEG). Falls back to the original bytes if encoding fails.
 */
export async function compress(file: { data: Buffer; mime: string }): Promise<{ data: Buffer; mime: string }> {
  try {
    const data = await sharp(file.data).rotate().resize({ width: 900, withoutEnlargement: true }).webp({ quality: 80, effort: 4 }).toBuffer();
    return data.length < file.data.length ? { data, mime: "image/webp" } : file;
  } catch {
    return file;
  }
}

/**
 * Venue photo from Google, kept in our own database after the first fetch, so each photo costs
 * one Places request ever and loads from us afterwards (fast, no quota). The API key never
 * reaches the browser, and the strict ref pattern blocks fetching arbitrary URLs (SSRF).
 * Photos are keyed by place id + position because Google issues new photo names on every search.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ref = url.searchParams.get("ref") ?? "";
  const i = Math.min(Math.max(Number(url.searchParams.get("i")) || 0, 0), 9);
  if (!PHOTO_REF_RE.test(ref) || !env.googlePlacesKey) return new Response("Not found", { status: 404 });
  const key = `${ref.split("/")[1]}:${i}`;

  // 1. Already copied: serve our file.
  try {
    const [file] = await db.select({ mime: schema.photoFiles.mime, data: schema.photoFiles.data }).from(schema.photoFiles).where(eq(schema.photoFiles.key, key)).limit(1);
    if (file) return image(file.data, file.mime);
  } catch {}

  // 2. A photo URL: stored recently, or a fresh one from the Places API.
  let stored: { uri: string; fetchedAt: Date } | undefined;
  try {
    [stored] = await db.select({ uri: schema.googlePhotos.uri, fetchedAt: schema.googlePhotos.fetchedAt }).from(schema.googlePhotos).where(eq(schema.googlePhotos.key, key)).limit(1);
  } catch {}
  let uri = stored && Date.now() - stored.fetchedAt.getTime() < URI_KEEP_MS ? stored.uri : null;
  if (!uri) {
    try {
      const res = await fetch(`https://places.googleapis.com/v1/${ref}/media?maxWidthPx=900&skipHttpRedirect=true`, {
        headers: { "X-Goog-Api-Key": env.googlePlacesKey },
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const { photoUri } = (await res.json()) as { photoUri?: string };
        if (photoUri?.startsWith("https://")) {
          uri = photoUri;
          await db
            .insert(schema.googlePhotos)
            .values({ key, uri, fetchedAt: new Date() })
            .onConflictDoUpdate({ target: schema.googlePhotos.key, set: { uri, fetchedAt: new Date() } })
            .catch(() => {});
        }
      }
    } catch {}
  }
  uri ??= stored?.uri ?? null; // quota used up: an older URL may still work
  if (!uri) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

  // 3. Copy the file, then serve it.
  const original = await download(uri);
  const file = original && (await compress(original));
  if (!file) return new Response(null, { status: 302, headers: { Location: uri, "Cache-Control": "no-store" } });
  try {
    const [{ n }] = await db.select({ n: count() }).from(schema.photoFiles);
    if (n < MAX_FILES) await db.insert(schema.photoFiles).values({ key, mime: file.mime, data: file.data }).onConflictDoNothing();
  } catch {}
  return image(file.data, file.mime);
}

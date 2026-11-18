import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { parseLatLng } from "@/lib/geo";
import { clientIp } from "@/lib/http";
import { createRateLimiter } from "@/lib/ratelimit";
import { NONE_RETRY_MS, PANO_ID_RE, bearing, viewKey } from "@/lib/street-view";

export const runtime = "nodejs";

const limiter = createRateLimiter(120, 60_000);
/** Static Street View: 10,000 free images a month. Stay well under it per day. */
const DAILY_LIMIT = Number(process.env.STREETVIEW_DAILY_LIMIT) || 300;

const notFound = (reason: string, maxAge = 600) =>
  new Response("Not found", { status: 404, headers: { "Cache-Control": `public, max-age=${maxAge}`, "X-Reason": reason } });

/** Find the outdoor panorama closest to the venue (free metadata call) and remember it. */
async function lookup(at: { lat: number; lng: number }) {
  const key = viewKey(at);
  const [row] = await db.select().from(schema.streetViews).where(eq(schema.streetViews.key, key)).limit(1);
  if (row && (row.status === "ok" || Date.now() - row.checkedAt.getTime() < NONE_RETRY_MS)) return row;

  const res = await fetch(
    `https://maps.googleapis.com/maps/api/streetview/metadata?location=${at.lat},${at.lng}&radius=60&source=outdoor&key=${env.googlePlacesKey}`,
    { cache: "no-store", signal: AbortSignal.timeout(6000) },
  );
  const meta = (await res.json().catch(() => ({}))) as { status?: string; pano_id?: string; location?: { lat: number; lng: number } };
  // Anything other than OK / ZERO_RESULTS (e.g. the API is not enabled) is not remembered.
  if (meta.status !== "OK" && meta.status !== "ZERO_RESULTS") throw new Error(`meta-${meta.status ?? res.status}`);
  const ok = meta.status === "OK" && meta.pano_id && PANO_ID_RE.test(meta.pano_id) && meta.location;
  const value = {
    key,
    panoId: ok ? meta.pano_id! : null,
    heading: ok ? bearing(meta.location!, at) : null, // turn the camera from the car towards the venue
    status: (ok ? "ok" : "none") as "ok" | "none",
    checkedAt: new Date(),
  };
  await db.insert(schema.streetViews).values(value).onConflictDoUpdate({ target: schema.streetViews.key, set: value });
  return value;
}

/** Atomically count one paid image for today; false once the daily cap is reached. */
async function takeQuota() {
  const day = new Date().toISOString().slice(0, 10);
  const [row] = await db
    .insert(schema.apiUsage)
    .values({ day, api: "streetview", count: 1 })
    .onConflictDoUpdate({ target: [schema.apiUsage.day, schema.apiUsage.api], set: { count: sql`${schema.apiUsage.count} + 1` } })
    .returning({ count: schema.apiUsage.count });
  if (row.count <= DAILY_LIMIT) return true;
  await db.update(schema.apiUsage).set({ count: sql`${schema.apiUsage.count} - 1` }).where(and(eq(schema.apiUsage.day, day), eq(schema.apiUsage.api, "streetview")));
  return false;
}

/**
 * Street-level photo of a venue from Google Street View, used only when the venue has no photo
 * of its own. The image is fetched server-side (the key never reaches the browser) and the CDN
 * keeps it for a week, so each venue costs at most one paid request per week.
 */
export async function GET(req: Request) {
  if (!env.googlePlacesKey) return notFound("no-key");
  if (!limiter.check(`sp:${clientIp(req)}`).ok) return notFound("rate-limit", 60);
  const url = new URL(req.url);
  const at = parseLatLng(url.searchParams.get("lat"), url.searchParams.get("lng"));
  if (!at) return notFound("bad-coords");

  try {
    const view = await lookup(at);
    if (view.status !== "ok" || !view.panoId) return notFound("no-pano", 86_400);
    if (!(await takeQuota())) return notFound("daily-limit", 600);
    const img = await fetch(
      `https://maps.googleapis.com/maps/api/streetview?size=640x480&pano=${view.panoId}&heading=${view.heading ?? 0}&fov=80&pitch=5&return_error_code=true&key=${env.googlePlacesKey}`,
      { cache: "no-store", signal: AbortSignal.timeout(8000) },
    );
    const type = img.headers.get("content-type") ?? "";
    if (!img.ok || !type.startsWith("image/")) return notFound(`image-${img.status}`);
    return new Response(await img.arrayBuffer(), {
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400" },
    });
  } catch (e) {
    return notFound(`error-${e instanceof Error ? e.message.replace(/[^\w-]/g, "").slice(0, 40) : "unknown"}`, 300);
  }
}

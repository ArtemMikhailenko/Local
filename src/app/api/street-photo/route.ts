import { distanceMeters, parseLatLng } from "@/lib/geo";
import { clientIp } from "@/lib/http";
import { createRateLimiter } from "@/lib/ratelimit";

const limiter = createRateLimiter(120, 60_000);
const notFound = (reason: string) => new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=600", "X-Reason": reason } });

type MlyImage = { id: string; thumb_1024_url?: string; thumb_original_url?: string; computed_geometry?: { coordinates: [number, number] }; geometry?: { coordinates: [number, number] }; is_pano?: boolean };

/**
 * Street-level photo near a venue from Mapillary (free, open imagery). We look ~45 m around the
 * point, prefer the closest non-panorama shot, and redirect to its thumbnail. Mapillary thumbnail
 * URLs are signed and expire, so the lookup is cached briefly rather than the URL stored forever.
 */
export async function GET(req: Request) {
  const token = process.env.MAPILLARY_TOKEN;
  if (!token) return notFound("no-token");
  if (!limiter.check(`sp:${clientIp(req)}`).ok) return notFound("rate-limit");
  const url = new URL(req.url);
  const at = parseLatLng(url.searchParams.get("lat"), url.searchParams.get("lng"));
  if (!at) return notFound("bad-coords");

  const d = 0.0004; // ~45 m
  const bbox = [at.lng - d, at.lat - d, at.lng + d, at.lat + d].map((n) => n.toFixed(6)).join(",");
  try {
    const res = await fetch(
      `https://graph.mapillary.com/images?access_token=${encodeURIComponent(token)}&fields=id,computed_geometry,geometry,is_pano&bbox=${bbox}&limit=20`,
      { next: { revalidate: 3_600 }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return notFound(`mapillary-${res.status}`);
    const { data } = (await res.json()) as { data?: MlyImage[] };
    // The bbox search returns positions only; thumbnails come from a per-image lookup.
    const best = (data ?? [])
      .map((i) => ({ i, geo: (i.computed_geometry ?? i.geometry)?.coordinates }))
      .filter((x) => x.geo)
      .map((x) => ({ ...x, dist: distanceMeters(at, { lng: x.geo![0], lat: x.geo![1] }) + (x.i.is_pano ? 30 : 0) }))
      .sort((a, b) => a.dist - b.dist)[0];
    if (!best) return notFound(`no-images-${(data ?? []).length}`);
    const one = await fetch(`https://graph.mapillary.com/${best.i.id}?access_token=${encodeURIComponent(token)}&fields=thumb_1024_url,thumb_original_url`, {
      next: { revalidate: 1_800 },
      signal: AbortSignal.timeout(8000),
    });
    if (!one.ok) return notFound(`thumb-${one.status}`);
    const img = (await one.json()) as { thumb_1024_url?: string; thumb_original_url?: string };
    const thumb = img.thumb_1024_url ?? img.thumb_original_url;
    if (!thumb?.startsWith("https://")) return notFound("no-thumb");
    return new Response(null, { status: 302, headers: { Location: thumb, "Cache-Control": "public, max-age=1800" } });
  } catch (e) {
    return notFound(`error-${e instanceof Error ? e.name : "unknown"}`);
  }
}

export const runtime = "nodejs";

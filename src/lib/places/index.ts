import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { distanceMeters, type LatLng } from "@/lib/geo";
import { env, placesMode } from "@/lib/env";
import { createOsmProvider, geoapifyTransport, overpassTransport, type FetchArea, type OsmVenue } from "./osm";
import { createDemoProvider } from "./demo";
import { fetchSitePhoto, isUsableShareImage } from "./site-photo";
import { createGoogleProvider } from "./google";
import type { Place, PlacesProvider, SearchParams } from "./types";

/** Small TTL cache: keeps Google quota low and makes back-navigation instant. */
function cached(inner: PlacesProvider, ttlMs = 10 * 60_000): PlacesProvider {
  const store = new Map<string, { at: number; value: unknown }>();
  const get = async <T,>(key: string, load: () => Promise<T>): Promise<T> => {
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
    const value = await load();
    store.set(key, { at: Date.now(), value });
    if (store.size > 500) store.delete(store.keys().next().value!);
    return value;
  };
  return {
    search: (p: SearchParams) =>
      get(`s:${p.query}|${p.center.lat.toFixed(3)},${p.center.lng.toFixed(3)}|${p.radiusM}|${p.openNow}|${p.maxPrice}|${p.limit}`, () => inner.search(p)),
    details: (id: string) => get<Place | null>(`d:${id}`, () => inner.details(id)),
  };
}

/** Postgres-backed area cache (24 h) in front of the network fetch. */
function withDbCache(fetchArea: FetchArea): FetchArea {
  return async (center: LatLng, radiusM: number) => {
    // "v2": bump when the stored venue shape changes (v2 adds Geoapify street addresses).
    const cell = `v2:${center.lat.toFixed(2)},${center.lng.toFixed(2)},${radiusM}`;
    try {
      const [row] = await db.select().from(schema.areaCache).where(eq(schema.areaCache.cell, cell)).limit(1);
      if (row && Date.now() - row.fetchedAt.getTime() < 24 * 60 * 60_000) return row.venues as OsmVenue[];
    } catch {}
    const venues = await fetchArea(center, radiusM);
    await db
      .insert(schema.areaCache)
      .values({ cell, venues, fetchedAt: new Date() })
      .onConflictDoUpdate({ target: schema.areaCache.cell, set: { venues, fetchedAt: new Date() } })
      .catch(() => {});
    return venues;
  };
}

/**
 * Real photos for OSM venues from their own website. Search results use what is already known
 * (and look up the rest in the background); the place page waits for it.
 */
function withSitePhotos(inner: PlacesProvider): PlacesProvider {
  const known = new Map<string, string | null>();
  const pending = new Map<string, Promise<string | null>>();
  let active = 0;

  // The venue's own photo goes first: it is free, while each Google photo costs quota.
  const apply = (p: Place): Place => {
    const url = known.get(p.id);
    if (!url) return p;
    const rest = p.photosIllustrative ? p.photos.slice(1) : p.photos.filter((x) => x !== url);
    return { ...p, photos: [url, ...rest].slice(0, 3), photosIllustrative: false };
  };
  const lookupOne = (p: Place): Promise<string | null> => {
    if (known.has(p.id)) return Promise.resolve(known.get(p.id)!);
    if (pending.has(p.id)) return pending.get(p.id)!;
    const job = (async () => {
      active++;
      try {
        const url = p.website ? await fetchSitePhoto(p.website) : null;
        known.set(p.id, url);
        await db.insert(schema.sitePhotos).values({ placeId: p.id, url }).onConflictDoUpdate({ target: schema.sitePhotos.placeId, set: { url, fetchedAt: new Date() } }).catch(() => {});
        return url;
      } finally {
        active--;
        pending.delete(p.id);
      }
    })();
    pending.set(p.id, job);
    return job;
  };
  const queue: Place[] = [];
  const pump = () => {
    while (active < 4 && queue.length) {
      const next = queue.shift()!;
      if (!known.has(next.id)) lookupOne(next).catch(() => {}).finally(pump);
    }
  };
  const loadKnown = async (ids: string[]) => {
    const missing = ids.filter((id) => !known.has(id));
    if (!missing.length) return;
    try {
      const rows = await db.select().from(schema.sitePhotos).where(inArray(schema.sitePhotos.placeId, missing));
      // Re-check stored URLs: rows saved before the avatar/logo filter existed may hold bad images.
      rows.forEach((r) => known.set(r.placeId, r.url && isUsableShareImage(r.url) ? r.url : null));
    } catch {}
  };

  return {
    async search(params) {
      const results = await inner.search(params);
      const withSite = results.filter((p) => p.website);
      await loadKnown(withSite.map((p) => p.id));
      // Queue background lookups (4 at a time) so the next view has real photos.
      for (const p of withSite) if (!known.has(p.id) && !pending.has(p.id) && !queue.some((q) => q.id === p.id)) queue.push(p);
      pump();
      return results.map(apply);
    },
    async details(id) {
      const p = await inner.details(id);
      if (!p?.website) return p;
      await loadKnown([p.id]);
      // Wait briefly for the website photo; if the site is slow, answer now and it lands next time.
      await Promise.race([lookupOne(p).catch(() => null), new Promise((r) => setTimeout(r, 2500))]);
      return apply(p);
    },
  };
}

const g = globalThis as unknown as { placesProvider?: PlacesProvider; osmProvider?: PlacesProvider; googleProvider?: PlacesProvider };
function osmShared(): PlacesProvider {
  return g.osmProvider ?? (g.osmProvider = buildOsm());
}
function googleShared(): PlacesProvider | null {
  if (placesMode() !== "google") return null;
  return g.googleProvider ?? (g.googleProvider = withSitePhotos(cached(createGoogleProvider(env.googlePlacesKey))));
}
function build(): PlacesProvider {
  const mode = placesMode();
  if (mode === "demo") return createDemoProvider();
  const osm = osmShared();
  // Google first (ratings, real photos); if it fails or its daily quota is used up, fall back to OpenStreetMap.
  const google = googleShared();
  if (google) return withFallback(google, osm);
  return osm;
}

function withFallback(primary: PlacesProvider, backup: PlacesProvider): PlacesProvider {
  return {
    search: (p) => primary.search(p).catch((e) => (console.warn("primary places provider failed, using backup", e), backup.search(p))),
    details: (id) => (id.startsWith("osm_") ? backup.details(id) : primary.details(id).catch(() => null)),
  };
}

function buildOsm(): PlacesProvider {
  const overpass = overpassTransport();
  // Find a venue in the Postgres area cache first: instant on cold serverless instances.
  const one = async (id: string): Promise<OsmVenue | null> => {
    try {
      const rows = await db.execute(
        sql`select v from ${schema.areaCache}, jsonb_array_elements(${schema.areaCache.venues}) v where v->>'id' = ${id} limit 1`,
      );
      const hit = (rows as unknown as Array<{ v: OsmVenue }>)[0]?.v;
      if (hit) return hit;
    } catch {}
    return overpass.one(id);
  };
  return withSitePhotos(createOsmProvider({
    area: withDbCache(env.geoapifyKey ? geoapifyTransport(env.geoapifyKey).area : overpass.area),
    one,
    timeZone: env.timeZone,
  }));
}

/** Search APIs only "bias" towards the area; drop results that are clearly too far to walk. */
export function withinReach(inner: PlacesProvider): PlacesProvider {
  return {
    async search(p) {
      const max = Math.max(3500, (p.radiusM ?? 2500) * 1.6);
      const results = await inner.search(p);
      return results.filter((r) => distanceMeters(p.center, r.location) <= max);
    },
    details: (id) => inner.details(id),
  };
}

export const places: PlacesProvider = g.placesProvider ?? (g.placesProvider = withinReach(build()));

/**
 * What the concierge searches with. Lumi runs many searches per request (5-8), which would burn
 * the Google daily quota by lunch, so it searches OpenStreetMap (free, cached, and with
 * machine-readable opening hours for plan checks). Only its final 2-3 picks go to Google
 * (see enrichWithGoogle) for ratings, photos and reviews.
 */
export const conciergePlaces: PlacesProvider = placesMode() === "google" ? withinReach(osmShared()) : places;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Same venue? Names overlap (either contains the other, or share a 4+ letter word) and are close. */
export function sameVenue(a: Pick<Place, "name" | "location">, b: Pick<Place, "name" | "location">, maxM = 150): boolean {
  if (distanceMeters(a.location, b.location) > maxM) return false;
  const x = norm(a.name), y = norm(b.name);
  if (!x || !y) return false;
  if (x.includes(y) || y.includes(x)) return true;
  const words = new Set(x.split(" ").filter((w) => w.length >= 4));
  return y.split(" ").some((w) => w.length >= 4 && words.has(w));
}

/**
 * Swap an OpenStreetMap pick for the same venue on Google (rating, real photos, reviews), one
 * small search per pick. Keeps the OSM version when Google has no match or is out of quota.
 */
export async function enrichWithGoogle(place: Place): Promise<Place> {
  const google = googleShared();
  if (!google || !place.id.startsWith("osm_")) return place;
  try {
    const hits = await google.search({ query: place.name, center: place.location, radiusM: 200, limit: 3 });
    const hit = hits.find((h) => sameVenue(place, h));
    if (!hit) return place;
    // Google's hours are free text; keep OSM's machine-readable ones when Google has none.
    return { ...hit, hours: hit.hours.length ? hit.hours : place.hours, summary: hit.summary ?? place.summary };
  } catch {
    return place;
  }
}

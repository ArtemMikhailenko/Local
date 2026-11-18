import "server-only";
import { and, between, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { distanceMeters } from "@/lib/geo";
import type { Place, PlacesProvider, SearchParams } from "./types";

const DETAILS_FRESH_MS = 24 * 60 * 60_000;
const OPEN_NOW_FRESH_MS = 60 * 60_000;

/** Merge a fresh search result into what we stored: searches carry no reviews, details do. */
export function mergePlace(stored: Place | undefined, fresh: Place): Place {
  if (!stored) return fresh;
  return {
    ...stored,
    ...fresh,
    reviews: fresh.reviews.length ? fresh.reviews : stored.reviews,
    summary: fresh.summary ?? stored.summary,
    hours: fresh.hours.length ? fresh.hours : stored.hours,
    photos: fresh.photos.length ? fresh.photos : stored.photos,
    website: fresh.website ?? stored.website,
    phone: fresh.phone ?? stored.phone,
  };
}

/** "Open now" is only trusted while recent; older stored values become unknown. */
const withAge = (place: Place, updatedAt: Date): Place => (Date.now() - updatedAt.getTime() < OPEN_NOW_FRESH_MS ? place : { ...place, openNow: null });

/** Search stored venues: near the point, any query word in the name, type or description. */
export function matchStored(rows: Array<{ place: Place; updatedAt: Date }>, p: SearchParams): Place[] {
  const words = p.query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);
  const max = Math.max(3500, (p.radiusM ?? 2500) * 1.6);
  return rows
    .map((r) => ({ ...r, d: distanceMeters(p.center, r.place.location) }))
    .filter((r) => r.d <= max)
    .map((r) => {
      const hay = `${r.place.name} ${r.place.type} ${r.place.summary ?? ""}`.toLowerCase();
      const score = words.length ? words.filter((w) => hay.includes(w)).length : 1;
      return { ...r, score };
    })
    .filter((r) => r.score > 0 && (p.maxPrice == null || r.place.priceLevel == null || r.place.priceLevel <= p.maxPrice))
    .sort((a, b) => b.score - a.score || (b.place.rating ?? 0) - (a.place.rating ?? 0) || a.d - b.d)
    .slice(0, p.limit ?? 12)
    .map((r) => withAge(r.place, r.updatedAt));
}

async function save(places: Place[], details: boolean) {
  if (!places.length) return;
  try {
    const existing = await db.select().from(schema.googlePlaces).where(inArray(schema.googlePlaces.id, places.map((p) => p.id)));
    const byId = new Map(existing.map((r) => [r.id, r]));
    for (const p of places) {
      const old = byId.get(p.id);
      const place = mergePlace(old?.place, p);
      const values = { id: p.id, lat: p.location.lat, lng: p.location.lng, place, hasDetails: details || !!old?.hasDetails, updatedAt: new Date() };
      await db.insert(schema.googlePlaces).values(values).onConflictDoUpdate({ target: schema.googlePlaces.id, set: values });
    }
  } catch (e) {
    console.warn("google place store failed", e);
  }
}

/**
 * Keeps every Google venue in Postgres. Place pages are served from it while under a day old
 * (no Google call); when Google fails or is out of quota, place pages use the stored copy and
 * searches use stored venues (with ratings, reviews and photos) before falling back further.
 */
export function withPlaceStore(google: PlacesProvider): PlacesProvider {
  return {
    async search(p) {
      try {
        const results = await google.search(p);
        void save(results, false);
        return results;
      } catch (err) {
        const d = Math.max(3500, (p.radiusM ?? 2500) * 1.6) / 111_000;
        const rows = await db
          .select({ place: schema.googlePlaces.place, updatedAt: schema.googlePlaces.updatedAt })
          .from(schema.googlePlaces)
          .where(and(between(schema.googlePlaces.lat, p.center.lat - d, p.center.lat + d), between(schema.googlePlaces.lng, p.center.lng - d * 1.6, p.center.lng + d * 1.6)))
          .limit(2000)
          .catch(() => []);
        const hits = matchStored(rows, p);
        if (hits.length >= 3) return hits;
        throw err; // too little stored here: let the caller fall back to OpenStreetMap
      }
    },
    async details(id) {
      const [row] = await db.select().from(schema.googlePlaces).where(eq(schema.googlePlaces.id, id)).limit(1).catch(() => []);
      if (row?.hasDetails && Date.now() - row.updatedAt.getTime() < DETAILS_FRESH_MS) return withAge(row.place, row.updatedAt);
      try {
        const place = await google.details(id);
        if (place) await save([place], true);
        return place ?? (row ? withAge(row.place, row.updatedAt) : null);
      } catch (err) {
        if (row) return withAge(row.place, row.updatedAt);
        throw err;
      }
    },
  };
}

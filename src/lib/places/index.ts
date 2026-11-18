import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { LatLng } from "@/lib/geo";
import { env, placesMode } from "@/lib/env";
import { createOsmProvider, geoapifyTransport, overpassTransport, type FetchArea, type OsmVenue } from "./osm";
import { createDemoProvider } from "./demo";
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
    const cell = `${center.lat.toFixed(2)},${center.lng.toFixed(2)},${radiusM}`;
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

const g = globalThis as unknown as { placesProvider?: PlacesProvider };
function build(): PlacesProvider {
  const mode = placesMode();
  if (mode === "demo") return createDemoProvider();
  if (mode === "google") return cached(createGoogleProvider(env.googlePlacesKey));
  const overpass = overpassTransport();
  return createOsmProvider({
    area: withDbCache(env.geoapifyKey ? geoapifyTransport(env.geoapifyKey).area : overpass.area),
    one: overpass.one,
    timeZone: env.timeZone,
  });
}

export const places: PlacesProvider = g.placesProvider ?? (g.placesProvider = build());

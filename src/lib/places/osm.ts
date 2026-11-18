import OpeningHours from "opening_hours";
import { distanceMeters, type LatLng } from "@/lib/geo";
import type { Place, PlacesProvider } from "./types";

/**
 * Real venues from OpenStreetMap. Two transports share one normalizer (OSM tags → Place):
 *  - Geoapify Places API (fast, free key, no card) when GEOAPIFY_API_KEY is set;
 *  - the public Overpass API otherwise (no key, slower, so results are cached per area).
 * OSM has no ratings or venue photos: rating stays null and cards use category photos
 * that are clearly marked as illustrative.
 */

export type OsmTags = Record<string, string>;
export type OsmVenue = { id: string; lat: number; lng: number; tags: OsmTags };

const img = (id: string) => `https://images.unsplash.com/photo-${id}?w=1200&q=70&auto=format&fit=crop`;
const CATEGORY_PHOTOS: Record<string, string[]> = {
  cafe: ["1554118811-1e0d58224f24", "1501339847302-ac426a4a7cbb", "1495474472287-4d71bcdd2085", "1509042239860-f550ce710b93", "1442512595331-e89e73853f31"],
  restaurant: ["1414235077428-338989a2e8c0", "1517248135467-4c7edcad34c4", "1555396273-367ea4eb4db5", "1559339352-11d035aa65de", "1424847651672-bf20a4b0982b"],
  bar: ["1514933651103-005eec06c04b", "1470337458703-46ad1756a187", "1572116469696-31de0f17cc34", "1510812431401-41d2bd2722f3"],
  pub: ["1436076863939-06870fe779c2", "1518176258769-f227c798150e"],
  ice_cream: ["1551024601-bec78aea704b", "1488477181946-6428a0291777"],
  museum: ["1518998053901-5348d3961a04", "1566127444979-b3d2b654e3d7"],
  gallery: ["1554907984-15263bfd63bd", "1536924940846-227afb31e2a5"],
};

const KIND_LABEL: Record<string, string> = {
  cafe: "Café",
  restaurant: "Restaurant",
  bar: "Bar",
  pub: "Pub",
  biergarten: "Beer garden",
  ice_cream: "Ice cream",
  museum: "Museum",
  gallery: "Art gallery",
};

/** Words people type → words that appear in the searchable text we build from tags. */
const SYNONYMS: Record<string, string[]> = {
  coffee: ["cafe", "coffee"],
  cafe: ["cafe", "coffee"],
  brunch: ["breakfast", "brunch", "cafe"],
  breakfast: ["breakfast", "brunch", "cafe"],
  dinner: ["restaurant"],
  lunch: ["restaurant", "cafe"],
  restaurant: ["restaurant"],
  bar: ["bar", "pub"],
  bars: ["bar", "pub"],
  cocktail: ["cocktail", "bar"],
  drinks: ["bar", "pub", "cocktail", "wine"],
  wine: ["wine"],
  beer: ["pub", "beer", "biergarten", "brewery"],
  craft: ["pub", "beer", "brewery"],
  museum: ["museum"],
  gallery: ["gallery", "art"],
  art: ["gallery", "art"],
  culture: ["museum", "gallery"],
  dessert: ["ice_cream", "dessert", "cake", "pastry"],
  sweet: ["ice_cream", "dessert", "cake"],
  vegan: ["vegan"],
  vegetarian: ["vegetarian", "vegan"],
  laptop: ["wifi"],
  wifi: ["wifi"],
  work: ["wifi"],
  terrace: ["outdoor"],
  outdoor: ["outdoor"],
  rooftop: ["rooftop", "roof", "view"],
  kids: ["kids", "child"],
  family: ["kids", "child"],
  pizza: ["pizza"],
  sushi: ["sushi", "japanese"],
  ramen: ["ramen", "japanese", "noodle"],
  steak: ["steak", "grill", "burger"],
  burger: ["burger"],
  ukrainian: ["ukrainian"],
  italian: ["italian", "pizza", "pasta"],
  georgian: ["georgian"],
  seafood: ["seafood", "fish"],
  fish: ["seafood", "fish"],
};

export function kindOf(tags: OsmTags): string {
  return tags.amenity ?? tags.tourism ?? "place";
}

/** Everything a search can match on: names, kind, cuisine, diet and facility hints. */
export function searchableText(tags: OsmTags): string {
  const bits = [tags.name, tags["name:en"], tags["name:uk"], kindOf(tags), tags.cuisine?.replace(/[;_]/g, " "), tags.description];
  if (tags["diet:vegan"] === "yes" || tags["diet:vegan"] === "only") bits.push("vegan");
  if (tags["diet:vegetarian"] === "yes" || tags["diet:vegetarian"] === "only") bits.push("vegetarian");
  if (tags.outdoor_seating === "yes") bits.push("outdoor terrace");
  if (tags.internet_access && tags.internet_access !== "no") bits.push("wifi");
  if (tags.breakfast === "yes" || /breakfast|brunch/i.test(tags.cuisine ?? "")) bits.push("breakfast brunch");
  if (tags.kids_area === "yes" || tags.changing_table === "yes" || tags.highchair === "yes") bits.push("kids");
  if (/wine/i.test(`${tags.name} ${tags.drink ?? ""} ${tags["drink:wine"] ?? ""}`)) bits.push("wine");
  if (/cocktail/i.test(`${tags.name} ${tags.drink ?? ""}`)) bits.push("cocktail");
  if (tags.microbrewery === "yes" || tags.craft === "brewery") bits.push("brewery beer");
  return bits.filter(Boolean).join(" ").toLowerCase();
}

export function scoreVenue(text: string, query: string): number {
  const words = query.toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter((w) => w.length > 2);
  let score = 0;
  for (const w of words) {
    const alts = SYNONYMS[w] ?? SYNONYMS[w.replace(/s$/, "")] ?? [w];
    if (alts.some((a) => text.includes(a))) score += 1;
  }
  return score;
}

/** Open/closed right now in the venue's local time zone, from the OSM opening_hours syntax. */
export function openNowFromHours(spec: string | undefined, now: Date, timeZone: string): boolean | null {
  if (!spec) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    // opening_hours evaluates in the Date's local fields, so build a Date with the venue's wall-clock time.
    const local = new Date(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    return new OpeningHours(spec).getState(local);
  } catch {
    return null; // unparseable hours: unknown rather than wrong
  }
}

/** Is the venue open at a given local time today (dayOffset 0) or on a following day? null when hours are unknown. */
export function openAtFromHours(spec: string | undefined, now: Date, timeZone: string, minutesOfDay: number, dayOffset = 0): boolean | null {
  if (!spec) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const local = new Date(get("year"), get("month") - 1, get("day") + dayOffset, Math.floor(minutesOfDay / 60), minutesOfDay % 60);
    return new OpeningHours(spec).getState(local);
  } catch {
    return null;
  }
}

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export function normalizeOsm(v: OsmVenue, now: Date, timeZone: string): Place {
  const t = v.tags;
  const kind = kindOf(t);
  // OSM cuisine values are English keywords; skip free-text values in other languages.
  const rawCuisine = t.cuisine?.split(";")[0]?.trim() ?? "";
  const cuisine = /^[a-z_ ]+$/.test(rawCuisine) ? rawCuisine.replace(/_/g, " ") : undefined;
  const type = cuisine && kind === "restaurant" ? `${cuisine[0].toUpperCase()}${cuisine.slice(1)} restaurant` : KIND_LABEL[kind] ?? "Place";
  const photos = CATEGORY_PHOTOS[kind] ?? CATEGORY_PHOTOS.restaurant;
  const start = hash(v.id) % photos.length;
  const facts = [
    t.outdoor_seating === "yes" && "outdoor seating",
    t.internet_access && t.internet_access !== "no" && "Wi-Fi",
    (t["diet:vegan"] === "yes" || t["diet:vegan"] === "only") && "vegan options",
    t.wheelchair === "yes" && "wheelchair accessible",
    t.takeaway === "yes" && "takeaway",
  ].filter(Boolean);
  const summary = [cuisine && `${cuisine[0].toUpperCase()}${cuisine.slice(1)}`, facts.length ? facts.join(", ") : null].filter(Boolean).join(" · ") || null;
  const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(", ");
  const website = t.website ?? t["contact:website"];
  return {
    id: v.id,
    name: t["name:en"] || t.name,
    type,
    rating: null,
    ratingCount: null,
    priceLevel: null,
    address: street || t["addr:full"] || "",
    location: { lat: v.lat, lng: v.lng },
    openNow: openNowFromHours(t.opening_hours, now, timeZone),
    hours: t.opening_hours ? t.opening_hours.split(/\s*;\s*/) : [],
    photos: [photos[start], photos[(start + 1) % photos.length]].map(img),
    photosIllustrative: true,
    summary,
    website: website && /^https?:\/\//i.test(website) ? website : null,
    phone: t.phone ?? t["contact:phone"] ?? null,
    mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}&travelmode=walking`,
    reviews: [],
  };
}

export type FetchArea = (center: LatLng, radiusM: number) => Promise<OsmVenue[]>;
export type FetchOne = (id: string) => Promise<OsmVenue | null>;

const OSM_ID = /^osm_(node|way|relation)_(\d+)$/;

/** Overpass transport: one query per ~1 km area cell, cached for 6 hours (Overpass can take 10–40 s). */
export function overpassTransport(fetchImpl: typeof fetch = fetch, endpoint = "https://overpass-api.de/api/interpreter") {
  const query = async (body: string) => {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Locali/1.0 (demo app)" },
      body: `data=${encodeURIComponent(body)}`,
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    const data = (await res.json()) as { elements: Array<{ type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: OsmTags }> };
    return data.elements
      .filter((e) => e.tags?.name && (e.lat ?? e.center?.lat) != null)
      .map((e) => ({ id: `osm_${e.type}_${e.id}`, lat: e.lat ?? e.center!.lat, lng: e.lon ?? e.center!.lon, tags: e.tags! }));
  };
  const area: FetchArea = (c, r) =>
    query(
      `[out:json][timeout:40];(nwr["amenity"~"^(restaurant|cafe|bar|pub|biergarten|ice_cream)$"]["name"](around:${r},${c.lat},${c.lng});nwr["tourism"~"^(museum|gallery)$"]["name"](around:${r},${c.lat},${c.lng}););out tags center qt;`,
    );
  const one: FetchOne = async (id) => {
    const m = OSM_ID.exec(id);
    if (!m) return null;
    const [first] = await query(`[out:json][timeout:25];${m[1]}(${m[2]});out tags center;`);
    return first ?? null;
  };
  return { area, one };
}

/** Geoapify transport: same OSM data, served fast. Uses the raw OSM tags Geoapify passes through. */
export function geoapifyTransport(apiKey: string, fetchImpl: typeof fetch = fetch) {
  const CATS = "catering.restaurant,catering.cafe,catering.bar,catering.pub,catering.biergarten,catering.ice_cream,entertainment.museum,entertainment.culture.gallery";
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const toVenue = (f: any): OsmVenue | null => {
    const p = f?.properties ?? {};
    const raw = p.datasource?.raw ?? {};
    const osmType = raw.osm_type === "w" ? "way" : raw.osm_type === "r" ? "relation" : "node";
    if (!p.name || raw.osm_id == null) return null;
    const tags: OsmTags = Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string" || typeof v === "number").map(([k, v]) => [k, String(v)]));
    tags.name ??= p.name;
    if (!tags.amenity && !tags.tourism) {
      const c: string = (p.categories ?? []).find((x: string) => x.startsWith("catering.") || x.startsWith("entertainment.")) ?? "";
      if (c.startsWith("catering.")) tags.amenity = c.split(".")[1];
      else if (c.includes("museum")) tags.tourism = "museum";
      else if (c.includes("gallery")) tags.tourism = "gallery";
    }
    // Many venues have no addr:* tags; Geoapify fills street and house number from nearby data.
    if (!tags["addr:street"] && typeof p.street === "string") tags["addr:street"] = p.street;
    if (!tags["addr:housenumber"] && (typeof p.housenumber === "string" || typeof p.housenumber === "number")) tags["addr:housenumber"] = String(p.housenumber);
    return { id: `osm_${osmType}_${String(raw.osm_id).replace(/^-/, "")}`, lat: p.lat, lng: p.lon, tags };
  };
  const area: FetchArea = async (c, r) => {
    const url = `https://api.geoapify.com/v2/places?categories=${CATS}&filter=circle:${c.lng},${c.lat},${r}&bias=proximity:${c.lng},${c.lat}&limit=500&apiKey=${encodeURIComponent(apiKey)}`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Geoapify ${res.status}`);
    const data = await res.json();
    return (data.features ?? []).map(toVenue).filter(Boolean) as OsmVenue[];
  };
  return { area };
}

/**
 * Provider over an area pool: venues for a ~1 km grid cell are fetched once and cached,
 * then every search is scored locally (fast, and cheap on the free API quotas).
 */
export function createOsmProvider(opts: { area: FetchArea; one?: FetchOne; timeZone?: string; now?: () => Date; ttlMs?: number }): PlacesProvider {
  const { area, one, timeZone = "Europe/Kyiv", now = () => new Date(), ttlMs = 6 * 60 * 60_000 } = opts;
  const pools = new Map<string, { at: number; venues: Promise<OsmVenue[]> }>();
  const byId = new Map<string, OsmVenue>();

  const pool = (c: LatLng, radiusM: number) => {
    const cell = `${c.lat.toFixed(2)},${c.lng.toFixed(2)},${radiusM}`; // ~1 km cells
    const hit = pools.get(cell);
    if (hit && Date.now() - hit.at < ttlMs) return hit.venues;
    const center = { lat: Number(c.lat.toFixed(2)), lng: Number(c.lng.toFixed(2)) };
    const venues = area(center, radiusM).then((list) => {
      list.forEach((v) => byId.set(v.id, v));
      return list;
    });
    venues.catch(() => pools.delete(cell)); // do not cache failures
    pools.set(cell, { at: Date.now(), venues });
    return venues;
  };

  return {
    async search({ query, center, openNow, limit = 12, radiusM = 2500 }) {
      const venues = await pool(center, Math.min(Math.max(radiusM, 1500), 3000));
      const t = now();
      return venues
        .map((v) => ({ v, s: scoreVenue(searchableText(v.tags), query), d: distanceMeters(center, { lat: v.lat, lng: v.lng }) }))
        .filter((x) => x.s > 0)
        .map((x) => ({ ...x, p: normalizeOsm(x.v, t, timeZone) }))
        .filter((x) => !openNow || x.p.openNow !== false)
        // Relevance first, then venues with richer data (hours, website), then distance.
        .sort((a, b) => b.s - a.s || richness(b.v) - richness(a.v) || a.d - b.d)
        .slice(0, limit)
        .map((x) => x.p);
    },
    async details(id) {
      if (!OSM_ID.test(id)) return null;
      const v = byId.get(id) ?? (one ? await one(id) : null);
      return v ? normalizeOsm(v, now(), timeZone) : null;
    },
  };
}

function richness(v: OsmVenue): number {
  const t = v.tags;
  return (t.opening_hours ? 1 : 0) + (t.website || t["contact:website"] ? 1 : 0) + (t.cuisine ? 1 : 0);
}

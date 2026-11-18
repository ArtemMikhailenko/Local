import type { Place, PlacesProvider, SearchParams } from "./types";

const BASE = "https://places.googleapis.com/v1";

const SEARCH_FIELDS = [
  "places.id",
  "places.displayName",
  "places.primaryTypeDisplayName",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.shortFormattedAddress",
  "places.location",
  "places.currentOpeningHours.openNow",
  "places.photos",
  "places.editorialSummary",
].join(",");

const DETAIL_FIELDS = [
  "id",
  "displayName",
  "primaryTypeDisplayName",
  "rating",
  "userRatingCount",
  "priceLevel",
  "formattedAddress",
  "location",
  "currentOpeningHours",
  "regularOpeningHours.weekdayDescriptions",
  "photos",
  "editorialSummary",
  "websiteUri",
  "nationalPhoneNumber",
  "googleMapsUri",
  "reviews",
].join(",");

const PRICE: Record<string, number> = {
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};
const PRICE_ENUM = ["", "PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"];

/** Photo names look like places/{placeId}/photos/{photoId}; we proxy them so the API key never reaches the browser. */
export const PHOTO_REF_RE = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
export const photoUrl = (ref: string) => `/api/photo?ref=${encodeURIComponent(ref)}`;

const httpUrl = (u: unknown) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : null);

/* eslint-disable @typescript-eslint/no-explicit-any */
export function normalizeGooglePlace(p: any): Place {
  return {
    id: String(p.id),
    name: p.displayName?.text ?? "Unnamed place",
    type: p.primaryTypeDisplayName?.text ?? "Place",
    rating: typeof p.rating === "number" ? p.rating : null,
    ratingCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
    priceLevel: PRICE[p.priceLevel as string] ?? null,
    address: p.formattedAddress ?? p.shortFormattedAddress ?? "",
    location: { lat: p.location?.latitude ?? 0, lng: p.location?.longitude ?? 0 },
    openNow: typeof p.currentOpeningHours?.openNow === "boolean" ? p.currentOpeningHours.openNow : null,
    hours: p.regularOpeningHours?.weekdayDescriptions ?? p.currentOpeningHours?.weekdayDescriptions ?? [],
    photos: (p.photos ?? [])
      .map((ph: any) => ph?.name)
      .filter((n: unknown): n is string => typeof n === "string" && PHOTO_REF_RE.test(n))
      .slice(0, 3) // each photo costs a Places API request: keep it to three
      .map(photoUrl),
    summary: p.editorialSummary?.text ?? null,
    website: httpUrl(p.websiteUri),
    phone: p.nationalPhoneNumber ?? null,
    mapsUrl: httpUrl(p.googleMapsUri),
    reviews: (p.reviews ?? []).slice(0, 5).map((r: any) => ({
      author: r.authorAttribution?.displayName ?? "Guest",
      rating: r.rating ?? 0,
      text: r.text?.text ?? r.originalText?.text ?? "",
      when: r.relativePublishTimeDescription ?? "",
    })),
  };
}

export function buildSearchBody(params: SearchParams) {
  const body: Record<string, unknown> = {
    textQuery: params.query,
    pageSize: Math.min(params.limit ?? 12, 20),
    locationBias: {
      circle: {
        center: { latitude: params.center.lat, longitude: params.center.lng },
        radius: Math.min(params.radiusM ?? 3000, 50_000),
      },
    },
  };
  if (params.openNow) body.openNow = true;
  if (params.maxPrice && params.maxPrice >= 1 && params.maxPrice <= 4) {
    body.priceLevels = PRICE_ENUM.slice(1, params.maxPrice + 1);
  }
  return body;
}

export function createGoogleProvider(apiKey: string, fetchImpl: typeof fetch = fetch): PlacesProvider {
  const headers = (mask: string) => ({
    "Content-Type": "application/json",
    "X-Goog-Api-Key": apiKey,
    "X-Goog-FieldMask": mask,
  });
  return {
    async search(params) {
      const res = await fetchImpl(`${BASE}/places:searchText`, {
        method: "POST",
        headers: headers(SEARCH_FIELDS),
        body: JSON.stringify(buildSearchBody(params)),
      });
      if (!res.ok) throw new Error(`Places search failed: ${res.status}`);
      const data = await res.json();
      return (data.places ?? []).map(normalizeGooglePlace);
    },
    async details(id) {
      if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) return null;
      const res = await fetchImpl(`${BASE}/places/${id}`, { headers: headers(DETAIL_FIELDS) });
      if (res.status === 404 || res.status === 400) return null;
      if (!res.ok) throw new Error(`Place details failed: ${res.status}`);
      return normalizeGooglePlace(await res.json());
    },
  };
}

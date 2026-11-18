import { describe, expect, it, vi } from "vitest";
import { distanceMeters, formatDistance, parseLatLng, walkingMinutes } from "@/lib/geo";
import { buildSearchBody, createGoogleProvider, normalizeGooglePlace, PHOTO_REF_RE } from "@/lib/places/google";
import { createDemoProvider, isOpenAt } from "@/lib/places/demo";

const KYIV = { lat: 50.4651, lng: 30.5155 };

describe("Google Places normalization", () => {
  const raw = {
    id: "ChIJabc123xyz",
    displayName: { text: "Kanapa" },
    primaryTypeDisplayName: { text: "Restaurant" },
    rating: 4.7,
    userRatingCount: 2310,
    priceLevel: "PRICE_LEVEL_EXPENSIVE",
    formattedAddress: "Andriivs'kyi descent, 19, Kyiv",
    location: { latitude: 50.459, longitude: 30.517 },
    currentOpeningHours: { openNow: true },
    regularOpeningHours: { weekdayDescriptions: ["Monday: 10:00 AM – 11:00 PM"] },
    photos: [{ name: "places/ChIJabc123xyz/photos/AbC-1_2" }, { name: "https://evil.example/x.jpg" }],
    reviews: [{ authorAttribution: { displayName: "Ira" }, rating: 5, text: { text: "Great" }, relativePublishTimeDescription: "a week ago" }],
  };

  it("maps the API shape into our Place model", () => {
    const p = normalizeGooglePlace(raw);
    expect(p).toMatchObject({
      id: "ChIJabc123xyz",
      name: "Kanapa",
      type: "Restaurant",
      rating: 4.7,
      ratingCount: 2310,
      priceLevel: 3,
      location: { lat: 50.459, lng: 30.517 },
      openNow: true,
      hours: ["Monday: 10:00 AM – 11:00 PM"],
      reviews: [{ author: "Ira", rating: 5, text: "Great", when: "a week ago" }],
    });
  });

  it("routes photos through our proxy and drops anything that is not a Places photo ref", () => {
    const p = normalizeGooglePlace(raw);
    expect(p.photos).toEqual(["/api/photo?ref=places%2FChIJabc123xyz%2Fphotos%2FAbC-1_2&i=0"]);
    expect(PHOTO_REF_RE.test("places/a/photos/b")).toBe(true);
    expect(PHOTO_REF_RE.test("places/a/photos/b/../../x")).toBe(false);
  });

  it("tolerates missing optional fields", () => {
    const p = normalizeGooglePlace({ id: "x" });
    expect(p).toMatchObject({ name: "Unnamed place", rating: null, priceLevel: null, openNow: null, photos: [], reviews: [] });
  });

  it("builds a search request with location bias, open-now and price ceiling", () => {
    const body = buildSearchBody({ query: "wine bar", center: KYIV, openNow: true, maxPrice: 2, radiusM: 999_999 });
    expect(body).toMatchObject({
      textQuery: "wine bar",
      openNow: true,
      priceLevels: ["PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE"],
      locationBias: { circle: { center: { latitude: KYIV.lat, longitude: KYIV.lng }, radius: 50_000 } },
    });
  });

  it("sends the key in a header (never the URL) and rejects malformed ids without a network call", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ places: [raw] })));
    const provider = createGoogleProvider("SECRET", fetchMock as unknown as typeof fetch);
    const [first] = await provider.search({ query: "pasta", center: KYIV });
    expect(first.name).toBe("Kanapa");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain("SECRET");
    expect(init.headers["X-Goog-Api-Key"]).toBe("SECRET");
    expect(await provider.details("../../admin")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("demo provider", () => {
  it("handles opening hours that run past midnight", () => {
    expect(isOpenAt("18:00–03:00", 23 * 60)).toBe(true);
    expect(isOpenAt("18:00–03:00", 2 * 60)).toBe(true);
    expect(isOpenAt("18:00–03:00", 12 * 60)).toBe(false);
    expect(isOpenAt("08:00–20:00", 20 * 60)).toBe(false);
  });

  it("matches by keywords and applies the price filter", async () => {
    const demo = createDemoProvider(() => new Date("2026-11-20T18:00:00Z"));
    const wine = await demo.search({ query: "wine", center: KYIV });
    expect(wine.map((p) => p.name)).toContain("Vino Vino");
    const cheap = await demo.search({ query: "dinner", center: KYIV, maxPrice: 2 });
    expect(cheap.length).toBeGreaterThan(0);
    expect(cheap.every((p) => (p.priceLevel ?? 0) <= 2)).toBe(true);
  });
});

describe("geo helpers", () => {
  it("computes distances and walking time", () => {
    const d = distanceMeters(KYIV, { lat: 50.4501, lng: 30.5234 }); // Podil → Maidan
    expect(d).toBeGreaterThan(1600);
    expect(d).toBeLessThan(1900);
    expect(walkingMinutes(d)).toBeGreaterThanOrEqual(20);
    expect(formatDistance(850)).toBe("850 m");
    expect(formatDistance(12_400)).toBe("12 km");
  });

  it("rejects invalid coordinates from query strings", () => {
    expect(parseLatLng("50.4", "30.5")).toEqual({ lat: 50.4, lng: 30.5 });
    expect(parseLatLng("abc", "30")).toBeNull();
    expect(parseLatLng("91", "30")).toBeNull();
    expect(parseLatLng(null, "30")).toBeNull();
  });
});

import { orderStops, walkingRouteUrl } from "@/lib/route";

describe("evening route planner", () => {
  const A = { name: "A", location: { lat: 50.4651, lng: 30.5160 } }; // closest to start
  const B = { name: "B", location: { lat: 50.4600, lng: 30.5200 } };
  const C = { name: "C", location: { lat: 50.4500, lng: 30.5240 } }; // furthest

  it("orders stops nearest-first so the walk does not zig-zag", () => {
    expect(orderStops(KYIV, [C, A, B]).map((s) => s.name)).toEqual(["A", "B", "C"]);
  });

  it("builds a Google Maps walking link with waypoints and the last stop as destination", () => {
    const url = new URL(walkingRouteUrl(KYIV, [C, A, B])!);
    expect(url.searchParams.get("travelmode")).toBe("walking");
    expect(url.searchParams.get("destination")).toBe("50.450000,30.524000");
    expect(url.searchParams.get("waypoints")).toBe("50.465100,30.516000|50.460000,30.520000");
    expect(walkingRouteUrl(KYIV, [])).toBeNull();
  });
});

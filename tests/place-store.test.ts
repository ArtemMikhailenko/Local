import { describe, expect, it, vi } from "vitest";
import type { Place } from "@/lib/places/types";

vi.mock("@/lib/db", () => ({ db: {}, schema: {} }));
const { matchStored, mergePlace } = await import("@/lib/places/store");

const place = (over: Partial<Place>): Place => ({
  id: "x", name: "X", type: "Bar", rating: 4.5, ratingCount: 10, priceLevel: 2, address: "", location: { lat: 50.4651, lng: 30.5155 },
  openNow: true, hours: [], photos: [], summary: null, website: null, phone: null, mapsUrl: null, reviews: [], ...over,
});
const center = { lat: 50.4651, lng: 30.5155 };

describe("stored Google venues", () => {
  it("keeps reviews and description from an earlier details call when a search result has none", () => {
    const stored = place({ reviews: [{ author: "A", rating: 5, text: "Great", when: "1 week ago" }], summary: "Cozy bar" });
    const merged = mergePlace(stored, place({ rating: 4.7 }));
    expect(merged.rating).toBe(4.7);
    expect(merged.reviews).toHaveLength(1);
    expect(merged.summary).toBe("Cozy bar");
  });

  it("finds stored venues by query words nearby, best rated first", () => {
    const now = new Date();
    const rows = [
      { place: place({ id: "a", name: "Wine Hut", type: "Wine bar", rating: 4.2 }), updatedAt: now },
      { place: place({ id: "b", name: "Vino e Pasta", type: "Wine bar", rating: 4.8 }), updatedAt: now },
      { place: place({ id: "c", name: "Coffee Lab", type: "Cafe" }), updatedAt: now },
      { place: place({ id: "d", name: "Far Wine", type: "Wine bar", location: { lat: 50.6, lng: 30.5 } }), updatedAt: now },
    ];
    expect(matchStored(rows, { query: "wine bar", center }).map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("does not trust an old 'open now'", () => {
    const old = new Date(Date.now() - 3 * 60 * 60_000);
    const [p] = matchStored([{ place: place({ name: "Wine Hut", openNow: true }), updatedAt: old }], { query: "wine", center });
    expect(p.openNow).toBeNull();
  });
});

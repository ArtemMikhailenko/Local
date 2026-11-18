import { describe, expect, it, vi } from "vitest";
import { createOsmProvider, geoapifyTransport, normalizeOsm, openNowFromHours, scoreVenue, searchableText, type OsmVenue } from "@/lib/places/osm";

const KYIV = { lat: 50.4651, lng: 30.5155 };
const venue = (id: string, tags: Record<string, string>, lat = 50.4652, lng = 30.5156): OsmVenue => ({ id, lat, lng, tags });

const wineBar = venue("osm_node_1", { amenity: "bar", name: "Винна Хата", "name:en": "Wine Hut", opening_hours: "Mo-Su 16:00-02:00", outdoor_seating: "yes", website: "https://winehut.ua" });
const pizza = venue("osm_node_2", { amenity: "restaurant", name: "Pizza Napoli", cuisine: "pizza;italian", "diet:vegan": "yes", opening_hours: "Mo-Su 11:00-23:00" }, 50.47, 30.52);
const museum = venue("osm_way_3", { tourism: "museum", name: "Museum of Kyiv History" }, 50.45, 30.52);

describe("OSM normalization", () => {
  it("builds a Place from OSM tags, preferring the English name and marking photos as illustrative", () => {
    const p = normalizeOsm(pizza, new Date("2026-11-18T12:00:00Z"), "Europe/Kyiv");
    expect(p).toMatchObject({
      id: "osm_node_2",
      name: "Pizza Napoli",
      type: "Pizza restaurant",
      rating: null,
      openNow: true,
      photosIllustrative: true,
      hours: ["Mo-Su 11:00-23:00"],
    });
    expect(p.summary).toContain("vegan options");
    expect(normalizeOsm(wineBar, new Date(), "Europe/Kyiv").name).toBe("Wine Hut");
  });

  it("drops non-http website values", () => {
    const p = normalizeOsm(venue("osm_node_9", { amenity: "cafe", name: "X", website: "javascript:alert(1)" }), new Date(), "Europe/Kyiv");
    expect(p.website).toBeNull();
  });

  it("evaluates opening hours in the venue's time zone, including past midnight", () => {
    // 22:30 UTC = 00:30 in Kyiv (UTC+2 in November)
    expect(openNowFromHours("Mo-Su 16:00-02:00", new Date("2026-11-18T22:30:00Z"), "Europe/Kyiv")).toBe(true);
    // 08:00 UTC = 10:00 Kyiv
    expect(openNowFromHours("Mo-Su 16:00-02:00", new Date("2026-11-18T08:00:00Z"), "Europe/Kyiv")).toBe(false);
    expect(openNowFromHours(undefined, new Date(), "Europe/Kyiv")).toBeNull();
    expect(openNowFromHours("not a schedule", new Date(), "Europe/Kyiv")).toBeNull();
  });
});

describe("OSM search scoring", () => {
  it("understands everyday words via synonyms and tags", () => {
    expect(scoreVenue(searchableText(wineBar.tags), "cozy wine bar with terrace")).toBe(3);
    expect(scoreVenue(searchableText(pizza.tags), "vegan pizza")).toBe(2);
    expect(scoreVenue(searchableText(museum.tags), "rainy day culture")).toBe(1);
    expect(scoreVenue(searchableText(museum.tags), "pizza")).toBe(0);
  });
});

describe("OSM provider", () => {
  it("fetches an area once, then answers searches from the cached pool", async () => {
    const area = vi.fn().mockResolvedValue([wineBar, pizza, museum]);
    const provider = createOsmProvider({ area, now: () => new Date("2026-11-18T18:00:00Z") });
    const wine = await provider.search({ query: "wine", center: KYIV });
    const food = await provider.search({ query: "pizza", center: KYIV });
    expect(wine.map((p) => p.name)).toEqual(["Wine Hut"]);
    expect(food.map((p) => p.name)).toEqual(["Pizza Napoli"]);
    expect(area).toHaveBeenCalledTimes(1);
    expect((await provider.details("osm_node_1"))?.name).toBe("Wine Hut");
    expect(await provider.details("../../etc")).toBeNull();
  });

  it("does not cache a failed fetch", async () => {
    const area = vi.fn().mockRejectedValueOnce(new Error("Overpass 504")).mockResolvedValue([pizza]);
    const provider = createOsmProvider({ area });
    await expect(provider.search({ query: "pizza", center: KYIV })).rejects.toThrow("504");
    expect((await provider.search({ query: "pizza", center: KYIV })).length).toBe(1);
  });

  it("open-now filter keeps unknown hours but drops venues known to be closed", async () => {
    const closed = venue("osm_node_4", { amenity: "cafe", name: "Morning Only", opening_hours: "Mo-Su 07:00-10:00" });
    const unknown = venue("osm_node_5", { amenity: "cafe", name: "No Hours Cafe" });
    const provider = createOsmProvider({ area: async () => [closed, unknown], now: () => new Date("2026-11-18T18:00:00Z") });
    expect((await provider.search({ query: "coffee", center: KYIV, openNow: true })).map((p) => p.name)).toEqual(["No Hours Cafe"]);
  });
});

describe("Geoapify transport", () => {
  it("maps features to OSM venues using the raw tags and keeps the key out of logs-friendly ids", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          features: [
            { properties: { name: "Kava", lat: 50.46, lon: 30.51, categories: ["catering.cafe"], datasource: { raw: { osm_id: 42, osm_type: "n", opening_hours: "Mo-Su 08:00-20:00" } } } },
            { properties: { lat: 1, lon: 1, datasource: { raw: {} } } },
          ],
        }),
      ),
    );
    const { area } = geoapifyTransport("KEY", fetchMock as unknown as typeof fetch);
    const venues = await area(KYIV, 2000);
    expect(venues).toEqual([{ id: "osm_node_42", lat: 50.46, lng: 30.51, tags: { osm_id: "42", osm_type: "n", opening_hours: "Mo-Su 08:00-20:00", name: "Kava", amenity: "cafe" } }]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("filter=circle:30.5155,50.4651,2000");
  });

  it("fills a missing address from Geoapify so routes can name the venue", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ features: [{ properties: { name: "Lemongrass", lat: 50.46, lon: 30.51, street: "Межигірська вулиця", housenumber: "3", datasource: { raw: { osm_id: 7, osm_type: "n" } } } }] })),
    );
    const [v] = await geoapifyTransport("KEY", fetchMock as unknown as typeof fetch).area(KYIV, 2000);
    expect(v.tags["addr:street"]).toBe("Межигірська вулиця");
    expect(normalizeOsm(v, new Date(), "Europe/Kyiv").address).toBe("Межигірська вулиця, 3");
  });
});

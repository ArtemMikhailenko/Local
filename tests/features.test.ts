import { describe, expect, it, vi } from "vitest";
import { validatePlan } from "@/lib/concierge/picks";
import { openAtFromHours } from "@/lib/places/osm";
import { POLL_ID_RE, newPollId, tally } from "@/lib/polls";
import { describeCode, getWeather, parseOpenMeteo, weatherHint } from "@/lib/weather";

const stop = (id: string, time: string, duration_min = 60) => ({ place_id: id, time, duration_min, what: "Dinner", why: "Because" });
const seen = new Set(["a", "b", "c"]);

describe("evening plan validation", () => {
  it("accepts a forward-moving plan that crosses midnight", () => {
    const r = validatePlan({ intro: "Go", stops: [stop("a", "21:00", 90), stop("b", "22:45"), stop("c", "00:00", 45)] }, seen, 20 * 60 + 30);
    expect(r.ok).toBe(true);
  });

  it("rejects unknown places, duplicates and overlapping stops", () => {
    expect(validatePlan({ intro: "", stops: [stop("a", "19:00"), stop("zzz", "20:30")] }, seen, 18 * 60).ok).toBe(false);
    expect(validatePlan({ intro: "", stops: [stop("a", "19:00"), stop("a", "20:30")] }, seen, 18 * 60).ok).toBe(false);
    const overlap = validatePlan({ intro: "", stops: [stop("a", "19:00", 120), stop("b", "20:00")] }, seen, 18 * 60);
    expect(!overlap.ok && overlap.error).toContain("before the previous one ends");
  });

  it("rejects a stop that is closed at its planned time, with a message the model can act on", () => {
    const openAt = (id: string, minutes: number) => (id === "b" ? minutes < 21 * 60 : null);
    const r = validatePlan({ intro: "", stops: [stop("a", "19:00"), stop("b", "21:30")] }, seen, 18 * 60, openAt);
    expect(!r.ok && r.error).toContain("b is closed at 21:30");
  });

  it("checks real OSM hours on the right day after midnight", () => {
    const now = new Date("2026-11-20T18:00:00Z"); // Friday 20:00 in Kyiv
    expect(openAtFromHours("Mo-Th 18:00-23:00; Fr-Sa 18:00-03:00", now, "Europe/Kyiv", 60, 1)).toBe(true); // Sat 01:00
    expect(openAtFromHours("Mo-Su 10:00-22:00", now, "Europe/Kyiv", 23 * 60, 0)).toBe(false);
  });
});

describe("group vote", () => {
  it("creates unguessable 12-char ids", () => {
    const ids = new Set(Array.from({ length: 200 }, newPollId));
    expect(ids.size).toBe(200);
    expect([...ids].every((id) => POLL_ID_RE.test(id))).toBe(true);
  });

  it("tallies votes and reports a single leader, or none on a tie", () => {
    const votes = [
      { placeId: "x", name: "Ann" },
      { placeId: "y", name: "Bo" },
      { placeId: "x", name: "Cy" },
    ];
    const { rows, leader } = tally(["x", "y", "z"], votes);
    expect(rows).toEqual([
      { placeId: "x", votes: 2, voters: ["Ann", "Cy"] },
      { placeId: "y", votes: 1, voters: ["Bo"] },
      { placeId: "z", votes: 0, voters: [] },
    ]);
    expect(leader).toBe("x");
    expect(tally(["x", "y"], [votes[0], votes[1]]).leader).toBeNull();
    expect(tally(["x"], []).leader).toBeNull();
  });
});

describe("weather", () => {
  const sample = {
    current: { temperature_2m: 3.6, apparent_temperature: 0.4, precipitation: 0.6, weather_code: 63, is_day: 0 },
    hourly: { precipitation_probability: [80, 70, 40] },
  };

  it("maps Open-Meteo data and WMO codes", () => {
    expect(parseOpenMeteo(sample)).toMatchObject({ tempC: 4, feelsC: 0, label: "Rain", isRainy: true, isCold: true, isNice: false, rainSoonPct: 80 });
    expect(describeCode(0, false).emoji).toBe("🌙");
    expect(describeCode(95, true).label).toBe("Thunderstorm");
  });

  it("turns weather into an instruction the concierge can follow", () => {
    expect(weatherHint(parseOpenMeteo(sample))).toContain("prefer indoor places");
    const nice = parseOpenMeteo({ current: { temperature_2m: 22, apparent_temperature: 22, precipitation: 0, weather_code: 1, is_day: 1 }, hourly: { precipitation_probability: [0] } });
    expect(weatherHint(nice)).toContain("terraces");
  });

  it("never throws: a failing weather API just means no weather", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await getWeather({ lat: 1.23, lng: 4.56 }, fetchMock as unknown as typeof fetch)).toBeNull();
  });
});

import { walkingRouteUrl } from "@/lib/route";

describe("realistic evening plans", () => {
  it("rejects a plan with a long walk between stops, naming both places", () => {
    const walk = (a: string, b: string) => (a === "a" && b === "b" ? 299 : 8);
    const r = validatePlan({ intro: "", stops: [stop("a", "17:30", 120), stop("b", "19:35")] }, seen, 17 * 60, () => null, walk);
    expect(!r.ok && r.error).toContain("299 min walk");
  });

  it("switches the route to public transport when a leg is too long to walk", () => {
    const start = { lat: 50.4651, lng: 30.5155 };
    const near = { location: { lat: 50.466, lng: 30.517 } };
    const far = { location: { lat: 50.36, lng: 30.33 } };
    expect(new URL(walkingRouteUrl(start, [near])!).searchParams.get("travelmode")).toBe("walking");
    expect(new URL(walkingRouteUrl(start, [near, far])!).searchParams.get("travelmode")).toBe("transit");
  });
});

import { summarize, toIcs } from "@/lib/events";

describe("events", () => {
  it("groups RSVPs by answer", () => {
    expect(summarize([{ name: "Ann", status: "going" }, { name: "Bo", status: "maybe" }, { name: "Cy", status: "going" }])).toEqual({ going: ["Ann", "Cy"], maybe: ["Bo"], no: [] });
  });

  it("builds a valid calendar file with escaped text and the venue location", () => {
    const place = { id: "x", name: "Café, Kyiv; Podil", address: "Sahaidachnoho 1", location: { lat: 50.46, lng: 30.51 } } as never;
    const ics = toIcs({ id: "abc123def456", title: "Dinner", place, startsAt: new Date("2026-11-20T18:00:00Z"), note: "Book a table\nnear the window", url: "https://x.app/e" });
    expect(ics).toContain("DTSTART:20261120T180000Z");
    expect(ics).toContain("DTEND:20261120T200000Z");
    expect(ics).toContain("LOCATION:Café\\, Kyiv\\; Podil\\, Sahaidachnoho 1");
    expect(ics).toContain("DESCRIPTION:Book a table\\nnear the window\\nhttps://x.app/e");
    expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
  });
});

import { directionsUrl, stopTarget } from "@/lib/route";

describe("named route stops", () => {
  const loc = { lat: 50.45, lng: 30.52 };
  it("uses the Google place id so Maps shows the venue name", () => {
    const u = new URL(directionsUrl({ id: "ChIJabcdefghijklmnop", name: "Veranda", location: loc }));
    expect(u.searchParams.get("destination")).toBe("Veranda");
    expect(u.searchParams.get("destination_place_id")).toBe("ChIJabcdefghijklmnop");
  });
  it("uses name and address for OpenStreetMap venues, coordinates only as a last resort", () => {
    expect(stopTarget({ id: "osm_node_1", name: "Open Coffee", address: "Мала Житомирська вулиця", location: loc }).text).toBe("Open Coffee, Мала Житомирська вулиця");
    expect(stopTarget({ id: "osm_node_1", name: "Open Coffee", address: "", location: loc }).text).toBe("50.450000,30.520000");
  });
});

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

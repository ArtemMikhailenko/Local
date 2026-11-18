import { describe, expect, it } from "vitest";
import { PUBLIC_RADIUS_M, nearbyEvents } from "@/lib/events";

const now = Date.parse("2026-11-18T18:00:00Z");
const at = { lat: 50.45, lng: 30.52 };
const ev = (id: string, hoursFromNow: number, lat = 50.452, lng = 30.521) => ({ id, startsAt: new Date(now + hoursFromNow * 3_600_000), place: { location: { lat, lng } } });

describe("nearbyEvents", () => {
  it("keeps upcoming events nearby, soonest first", () => {
    const out = nearbyEvents([ev("later", 48), ev("soon", 2), ev("started", -1)], at, now);
    expect(out.map((e) => e.id)).toEqual(["started", "soon", "later"]);
  });
  it("drops events that ended long ago or are more than two weeks away", () => {
    const out = nearbyEvents([ev("old", -5), ev("far-future", 24 * 15)], at, now);
    expect(out).toEqual([]);
  });
  it("drops events outside the radius", () => {
    // ~11 km north
    const out = nearbyEvents([ev("far", 2, 50.55, 30.52), ev("near", 2)], at, now);
    expect(out.map((e) => e.id)).toEqual(["near"]);
    expect(PUBLIC_RADIUS_M).toBeLessThan(11_000);
  });
});

import { describe, expect, it } from "vitest";
import { PANO_ID_RE, bearing, viewKey } from "@/lib/street-view";

describe("bearing", () => {
  const o = { lat: 50.45, lng: 30.52 };
  it("points north, east, south and west", () => {
    expect(bearing(o, { lat: 50.46, lng: 30.52 })).toBe(0);
    expect(bearing(o, { lat: 50.45, lng: 30.53 })).toBe(90);
    expect(bearing(o, { lat: 50.44, lng: 30.52 })).toBe(180);
    expect(bearing(o, { lat: 50.45, lng: 30.51 })).toBe(270);
  });
  it("stays within 0..359", () => {
    const b = bearing(o, { lat: 50.4501, lng: 30.5199 });
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });
});

describe("viewKey", () => {
  it("rounds to about a metre so nearby requests share one lookup", () => {
    expect(viewKey({ lat: 50.4651234, lng: 30.5155111 })).toBe("50.46512,30.51551");
    expect(viewKey({ lat: 50.4651201, lng: 30.5155149 })).toBe(viewKey({ lat: 50.4651234, lng: 30.5155111 }));
  });
});

describe("PANO_ID_RE", () => {
  it("accepts Google pano ids and rejects anything that could change the request", () => {
    expect(PANO_ID_RE.test("CAoSLEFGMVFpcE1abc_-xyz")).toBe(true);
    expect(PANO_ID_RE.test("abc&key=evil")).toBe(false);
    expect(PANO_ID_RE.test("")).toBe(false);
  });
});

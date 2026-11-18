import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {}, schema: {} }));
const { sameVenue } = await import("@/lib/places");

const at = (lat: number, lng: number) => ({ lat, lng });

describe("matching an OpenStreetMap pick to the same venue on Google", () => {
  it("matches the same name nearby, ignoring case and punctuation", () => {
    expect(sameVenue({ name: "Pink Freud", location: at(50.4651, 30.5155) }, { name: "PINK FREUD bar", location: at(50.4655, 30.5158) })).toBe(true);
    expect(sameVenue({ name: "Реберня на Узвозі", location: at(50.46, 30.51) }, { name: "Реберня", location: at(50.4601, 30.5102) })).toBe(true);
  });
  it("rejects a different venue or the same name across town", () => {
    expect(sameVenue({ name: "Pink Freud", location: at(50.4651, 30.5155) }, { name: "Barman Dictat", location: at(50.4652, 30.5156) })).toBe(false);
    expect(sameVenue({ name: "Пузата Хата", location: at(50.4651, 30.5155) }, { name: "Пузата Хата", location: at(50.43, 30.48) })).toBe(false);
  });
});

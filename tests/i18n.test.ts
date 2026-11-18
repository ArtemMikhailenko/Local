import { describe, expect, it } from "vitest";
import { detectLang, translator } from "@/lib/i18n";

describe("i18n", () => {
  it("defaults to Ukrainian for uk/ru browsers and respects a saved choice", () => {
    expect(detectLang(null, "uk-UA")).toBe("uk");
    expect(detectLang(null, "ru-RU")).toBe("uk");
    expect(detectLang(null, "en-GB")).toBe("en");
    expect(detectLang("en", "uk-UA")).toBe("en");
    expect(detectLang("garbage", "de-DE")).toBe("en");
  });

  it("translates and fills placeholders", () => {
    expect(translator("uk")("plan.walk", { n: 6 })).toBe("6 хв пішки");
    expect(translator("en")("search.count", { n: 12 })).toBe("12 places");
  });

  it("keeps list-type strings aligned between languages", () => {
    for (const key of ["c.suggestions", "c.refine", "home.prompts"] as const) {
      expect(translator("uk")(key).split("|").length).toBe(translator("en")(key).split("|").length);
    }
  });
});

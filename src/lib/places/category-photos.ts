/**
 * Last-resort cover when a venue has no photo of its own and no street view: an honest
 * illustrated tile (category icon), never a stock photo that could pass for the real place.
 */
export type PlaceholderKind = "coffee" | "bars" | "wine" | "brunch" | "culture" | "dinner";

const BY_KIND: Array<[RegExp, PlaceholderKind]> = [
  [/wine|вин/i, "wine"],
  [/caf|coffee|кав/i, "coffee"],
  [/bar|pub|cocktail|brew|бар|паб/i, "bars"],
  [/bak|dessert|ice|sweet|brunch|breakfast|пекар|десерт|сніданк/i, "brunch"],
  [/museum|gallery|art|theat|музей|галер|театр/i, "culture"],
];

export const placeholderKind = (type: string): PlaceholderKind => BY_KIND.find(([re]) => re.test(type))?.[1] ?? "dinner";

/** A pseudo-URL the Photo component renders as an illustrated tile. */
export const placeholderFor = (type: string) => `placeholder:${placeholderKind(type)}`;

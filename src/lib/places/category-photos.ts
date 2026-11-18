/** Stock photos per venue category, used when a venue has no photo or the photo quota is used up. */
const img = (id: string) => `https://images.unsplash.com/photo-${id}?w=1200&q=70&auto=format&fit=crop`;

const BY_KIND: Array<[RegExp, string[]]> = [
  [/caf|coffee|кав/i, ["1554118811-1e0d58224f24", "1501339847302-ac426a4a7cbb", "1495474472287-4d71bcdd2085"]],
  [/bar|pub|wine|cocktail|brew|бар|паб/i, ["1514933651103-005eec06c04b", "1470337458703-46ad1756a187", "1510812431401-41d2bd2722f3"]],
  [/bak|dessert|ice|sweet|пекар|десерт/i, ["1481833761820-0509d3217039", "1551024601-bec78aea704b"]],
  [/museum|gallery|art|музей|галер/i, ["1554907984-15263bfd63bd", "1518998053901-5348d3961a04"]],
  [/brunch|breakfast|сніданк/i, ["1525610553991-2bede1a236e2", "1533089860892-a7c6f0a88666"]],
];
const DEFAULT = ["1414235077428-338989a2e8c0", "1517248135467-4c7edcad34c4", "1555396273-367ea4eb4db5"];

export function categoryPhoto(type: string, seed: string): string {
  const list = BY_KIND.find(([re]) => re.test(type))?.[1] ?? DEFAULT;
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return img(list[h % list.length]);
}

import { distanceMeters } from "@/lib/geo";
import type { Place, PlacesProvider } from "./types";

/**
 * Demo mode dataset: fictional venues around central Kyiv with stock photos.
 * Used when GOOGLE_PLACES_API_KEY is not set and in unit tests. Names are invented on purpose.
 */
const img = (id: string) => `https://images.unsplash.com/photo-${id}?w=1200&q=70&auto=format&fit=crop`;

type Seed = [id: string, name: string, type: string, tags: string, rating: number, count: number, price: number, lat: number, lng: number, photos: string[], summary: string, hours: string];

const SEEDS: Seed[] = [
  ["demo_kava_lab", "Kava Lab", "Coffee shop", "coffee specialty laptop quiet", 4.8, 1240, 1, 50.4659, 30.5163, ["1554118811-1e0d58224f24", "1495474472287-4d71bcdd2085"], "Tiny third-wave roastery with a window bar, filter flights and the best flat white on Podil.", "08:00–20:00"],
  ["demo_dim_kavy", "Dim Kavy", "Café", "coffee cake cozy brunch", 4.6, 860, 1, 50.4625, 30.5191, ["1501339847302-ac426a4a7cbb", "1509042239860-f550ce710b93"], "Warm brick café with homemade cheesecake and long tables for slow mornings.", "08:00–21:00"],
  ["demo_sunny_side", "Sunny Side", "Brunch restaurant", "brunch eggs pancakes family kids", 4.7, 2100, 2, 50.4512, 30.5203, ["1525610553991-2bede1a236e2", "1533089860892-a7c6f0a88666"], "All-day brunch: shakshuka, ricotta pancakes and a sunny terrace with a kids corner.", "08:00–17:00"],
  ["demo_pantry", "The Pantry", "Bakery", "bakery croissant coffee breakfast", 4.7, 1530, 1, 50.4471, 30.5089, ["1481833761820-0509d3217039", "1497935586351-b67a49e012bf"], "Sourdough and laminated pastry bakery; croissants usually sell out by noon.", "07:30–19:00"],
  ["demo_osteria_luce", "Osteria Luce", "Italian restaurant", "italian pasta dinner date romantic wine", 4.8, 1780, 3, 50.4498, 30.5142, ["1414235077428-338989a2e8c0", "1551024709-8f23befc6f87"], "Hand-rolled pasta, candlelight and a short Italian wine list. Book for weekends.", "12:00–23:00"],
  ["demo_borsch_bar", "Borsch & Co", "Ukrainian restaurant", "ukrainian traditional borscht varenyky dinner tourists", 4.6, 3400, 2, 50.4589, 30.5221, ["1555396273-367ea4eb4db5", "1504754524776-8f4f37790ca0"], "Modern Ukrainian kitchen: smoked-pear borscht, varenyky and house nalyvky.", "11:00–23:00"],
  ["demo_ember", "Ember", "Steak house", "steak grill meat dinner business", 4.5, 940, 4, 50.4441, 30.5217, ["1544145945-f90425340c7e", "1424847651672-bf20a4b0982b"], "Open-fire grill with dry-aged steaks and a serious red list. Good for business dinners.", "13:00–00:00"],
  ["demo_green_room", "Green Room", "Vegan restaurant", "vegan vegetarian healthy lunch bowls", 4.6, 720, 2, 50.4553, 30.5068, ["1512621776951-a57141f2eefd", "1565299624946-b28f40a0ae38"], "Plant-based bowls, fermented drinks and a bright green interior.", "10:00–22:00"],
  ["demo_nori", "Nori Nori", "Japanese restaurant", "sushi japanese ramen dinner", 4.7, 1310, 3, 50.4467, 30.5251, ["1553621042-f6e147245754", "1466978913421-dad2ebd01d17"], "Twelve-seat omakase counter plus a ramen menu at lunch.", "12:00–23:00"],
  ["demo_backyard", "Backyard Pizza", "Pizza restaurant", "pizza kids family casual friends group", 4.5, 2650, 2, 50.4607, 30.5121, ["1565299624946-b28f40a0ae38", "1513104890138-7c749659a591"], "Neapolitan pizza oven in a leafy courtyard; big tables, great for groups and kids.", "11:00–23:00"],
  ["demo_alchemist", "Alchemist", "Cocktail bar", "cocktail bar date night speakeasy", 4.8, 1980, 3, 50.4486, 30.5195, ["1514933651103-005eec06c04b", "1470337458703-46ad1756a187"], "Hidden speakeasy behind a bookshelf. Seasonal cocktails, vinyl after 22:00.", "18:00–03:00"],
  ["demo_rooftop", "Skyline 21", "Rooftop bar", "rooftop view sunset bar date drinks", 4.6, 1460, 3, 50.4502, 30.5236, ["1572116469696-31de0f17cc34", "1566073771259-6a8506099945"], "21st-floor terrace with the best sunset over the Dnipro. Blankets when it gets cold.", "16:00–02:00"],
  ["demo_vino_vino", "Vino Vino", "Wine bar", "wine natural bar date cheese", 4.7, 830, 3, 50.4636, 30.5178, ["1510812431401-41d2bd2722f3", "1506377247377-2a5b3b417ebb"], "Natural wine shop and bar with Ukrainian producers and a cheese board to share.", "15:00–00:00"],
  ["demo_craft_corner", "Craft Corner", "Pub", "beer craft pub football friends group", 4.4, 1720, 2, 50.4573, 30.5102, ["1436076863939-06870fe779c2", "1518176258769-f227c798150e"], "Twenty craft taps, burgers and football on the big screen.", "14:00–02:00"],
  ["demo_jazz_cellar", "Blue Cellar", "Jazz club", "jazz live music bar night date", 4.7, 690, 3, 50.4652, 30.5139, ["1415201364774-f6f0bb35f28f", "1511192336575-5a79af67a629"], "Live jazz every night in a vaulted cellar; cover after 20:00.", "19:00–02:00"],
  ["demo_modern_art", "Riverside Contemporary", "Art gallery", "art gallery culture exhibition rainy day", 4.6, 1210, 1, 50.4612, 30.5262, ["1554907984-15263bfd63bd", "1536924940846-227afb31e2a5"], "Contemporary Ukrainian art across three floors, with a design shop and café.", "11:00–20:00"],
  ["demo_history", "City History Museum", "Museum", "museum history culture tourists rainy day kids", 4.5, 2890, 1, 50.4519, 30.5149, ["1518998053901-5348d3961a04", "1566127444979-b3d2b654e3d7"], "Interactive history of the city from Kyivan Rus to today. Audio guide in English.", "10:00–18:00"],
  ["demo_book_cafe", "Chapters", "Book café", "books coffee quiet work laptop", 4.7, 540, 1, 50.4433, 30.5110, ["1521017432531-fbd92d768814", "1442512595331-e89e73853f31"], "Bookshop with a reading room café, sockets everywhere and no music.", "09:00–21:00"],
  ["demo_garden", "Botanic Terrace", "Garden café", "garden terrace outdoor nature lunch", 4.5, 980, 2, 50.4412, 30.5306, ["1600093463592-8e36ae95ef56", "1578474846511-04ba529f0b88"], "Café in a greenhouse at the edge of the botanical garden. Best in spring.", "10:00–20:00"],
  ["demo_dessert", "Sugar Studio", "Dessert shop", "dessert cake sweet kids gelato", 4.8, 1150, 2, 50.4544, 30.5175, ["1551024601-bec78aea704b", "1488477181946-6428a0291777"], "Gelato and plated desserts; the honey cake is famous.", "10:00–22:00"],
];

const STORE: Place[] = SEEDS.map(([id, name, type, , rating, count, price, lat, lng, photos, summary, hours]) => ({
  id,
  name,
  type,
  rating,
  ratingCount: count,
  priceLevel: price,
  address: "Kyiv, Ukraine",
  location: { lat, lng },
  openNow: null,
  hours: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d) => `${d}: ${hours}`),
  photos: photos.map(img),
  summary,
  website: null,
  phone: null,
  mapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
  reviews: [
    { author: "Olena", rating: 5, text: "Exactly what we hoped for. Staff were lovely and fast.", when: "2 weeks ago" },
    { author: "Mark", rating: 4, text: "Great place, a bit busy in the evening, so come early.", when: "a month ago" },
  ],
}));
const TAGS = new Map(SEEDS.map((s) => [s[0], `${s[1]} ${s[2]} ${s[3]}`.toLowerCase()]));
const HOURS = new Map(SEEDS.map((s) => [s[0], s[11]]));

/** Open status from "HH:MM–HH:MM" in Kyiv local time; handles past-midnight closing. */
export function isOpenAt(range: string, minutesOfDay: number): boolean {
  const [a, b] = range.split("–").map((t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  });
  return b > a ? minutesOfDay >= a && minutesOfDay < b : minutesOfDay >= a || minutesOfDay < b;
}

function kyivMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

export function createDemoProvider(now: () => Date = () => new Date()): PlacesProvider {
  const withStatus = (p: Place): Place => ({ ...p, openNow: isOpenAt(HOURS.get(p.id)!, kyivMinutes(now())) });
  return {
    async search({ query, center, openNow, maxPrice, limit = 12 }) {
      const words = query.toLowerCase().split(/[^a-z0-9а-яіїєґ]+/i).filter((w) => w.length > 2);
      const scored = STORE.map(withStatus)
        .map((p) => {
          const tags = TAGS.get(p.id)!;
          const hits = words.filter((w) => tags.includes(w) || tags.includes(w.replace(/s$/, ""))).length;
          return { p, hits };
        })
        .filter(({ p, hits }) => (words.length === 0 || hits > 0) && (!openNow || p.openNow) && (!maxPrice || (p.priceLevel ?? 0) <= maxPrice))
        .sort((a, b) => b.hits - a.hits || distanceMeters(center, a.p.location) - distanceMeters(center, b.p.location));
      return scored.slice(0, limit).map(({ p }) => p);
    },
    async details(id) {
      const p = STORE.find((x) => x.id === id);
      return p ? withStatus(p) : null;
    },
  };
}

import "server-only";

/** Server-side configuration. Secrets never leave the server: nothing here is prefixed NEXT_PUBLIC_. */
export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "postgres://localhost:5432/locali",
  googlePlacesKey: process.env.GOOGLE_PLACES_API_KEY || "",
  geoapifyKey: process.env.GEOAPIFY_API_KEY || "",
  /** "demo" forces the built-in fictional dataset (offline development). */
  placesProvider: process.env.PLACES_PROVIDER || "",
  timeZone: process.env.APP_TIMEZONE || "Europe/Kyiv",
  geminiKey: process.env.GEMINI_API_KEY || "",
  /** Optional comma list, e.g. "gemini-3.8-flash,gemini-3.5-flash-lite". Auto-detected when empty. */
  geminiModels: (process.env.GEMINI_MODELS || "").split(",").map((s) => s.trim()).filter(Boolean),
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  conciergeModel: process.env.CONCIERGE_MODEL || "claude-opus-5-5",
  isProd: process.env.NODE_ENV === "production",
};

/** Real data by default: Google Places with a key, otherwise OpenStreetMap (Geoapify or Overpass). */
export const placesMode = (): "google" | "osm" | "demo" =>
  env.placesProvider === "demo" ? "demo" : env.googlePlacesKey ? "google" : "osm";

import { DEFAULT_CENTER, parseLatLng } from "@/lib/geo";
import { HttpError, handleError, json } from "@/lib/http";
import { places } from "@/lib/places";

export const maxDuration = 60; // first OpenStreetMap fetch for a new area can be slow

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
    if (!q) throw new HttpError(400, "Query is required");
    const center = parseLatLng(url.searchParams.get("lat"), url.searchParams.get("lng")) ?? DEFAULT_CENTER;
    const maxPrice = Number(url.searchParams.get("maxPrice")) || undefined;
    const results = await places.search({
      query: q,
      center,
      openNow: url.searchParams.get("open") === "1",
      maxPrice: maxPrice && maxPrice >= 1 && maxPrice <= 4 ? maxPrice : undefined,
      radiusM: 4000,
      limit: 16,
    });
    return json({ results }, { headers: { "Cache-Control": "private, max-age=120" } });
  } catch (err) {
    return handleError(err);
  }
}

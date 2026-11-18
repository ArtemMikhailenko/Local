import { DEFAULT_CENTER, parseLatLng } from "@/lib/geo";
import { json } from "@/lib/http";
import { getWeather } from "@/lib/weather";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const at = parseLatLng(url.searchParams.get("lat"), url.searchParams.get("lng")) ?? DEFAULT_CENTER;
  const weather = await getWeather(at);
  return json({ weather }, { headers: { "Cache-Control": "private, max-age=600" } });
}

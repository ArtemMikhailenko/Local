import { env } from "@/lib/env";
import { geocode } from "@/lib/geocode";
import { parseLatLng } from "@/lib/geo";
import { clientIp, json } from "@/lib/http";
import { createRateLimiter } from "@/lib/ratelimit";

const limiter = createRateLimiter(30, 60_000);

export async function GET(req: Request) {
  if (!limiter.check(`geo:${clientIp(req)}`).ok) return json({ results: [] }, 429);
  const url = new URL(req.url);
  const results = await geocode(url.searchParams.get("q") ?? "", {
    geoapifyKey: env.geoapifyKey || undefined,
    near: parseLatLng(url.searchParams.get("lat"), url.searchParams.get("lng")) ?? undefined,
    lang: url.searchParams.get("lang") === "en" ? "en" : "uk",
  });
  return json({ results }, { headers: { "Cache-Control": "private, max-age=3600" } });
}

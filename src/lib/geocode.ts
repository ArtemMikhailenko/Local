import type { LatLng } from "./geo";

export type GeoHit = { label: string; location: LatLng };

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Turns "Podil, Kyiv" or "Золоті ворота" into coordinates.
 * Geoapify when a key is set (fast, free tier), otherwise OpenStreetMap Nominatim (no key, 1 req/s).
 */
export async function geocode(query: string, opts: { geoapifyKey?: string; near?: LatLng; lang?: string; limit?: number; fetchImpl?: typeof fetch } = {}): Promise<GeoHit[]> {
  const q = query.trim().slice(0, 120);
  if (q.length < 2) return [];
  const { geoapifyKey, near, lang = "uk", limit = 5, fetchImpl = fetch } = opts;
  try {
    if (geoapifyKey) {
      const p = new URLSearchParams({ text: q, lang, limit: String(limit), format: "json", apiKey: geoapifyKey });
      if (near) p.set("bias", `proximity:${near.lng},${near.lat}`);
      const res = await fetchImpl(`https://api.geoapify.com/v1/geocode/search?${p}`, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(`geoapify ${res.status}`);
      const data = await res.json();
      return (data.results ?? []).map((r: any) => ({ label: shortLabel(r.formatted ?? r.name ?? q), location: { lat: r.lat, lng: r.lon } }));
    }
    const p = new URLSearchParams({ q, format: "jsonv2", limit: String(limit), "accept-language": lang });
    const res = await fetchImpl(`https://nominatim.openstreetmap.org/search?${p}`, {
      headers: { "User-Agent": "Locali/1.0 (demo app)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`nominatim ${res.status}`);
    const data = await res.json();
    return (data ?? []).map((r: any) => ({ label: shortLabel(r.display_name ?? q), location: { lat: Number(r.lat), lng: Number(r.lon) } }));
  } catch {
    return [];
  }
}

/** "вулиця Сагайдачного, Поділ, Київ, 04070, Україна" → "вулиця Сагайдачного, Поділ, Київ" */
export function shortLabel(full: string): string {
  return full
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !/^\d{4,6}$/.test(s) && !/^(Україна|Ukraine|Київська міська громада|Kyiv City)$/i.test(s))
    .slice(0, 3)
    .join(", ");
}

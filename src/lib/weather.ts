import type { LatLng } from "./geo";

export type Weather = {
  tempC: number;
  feelsC: number;
  label: string;
  emoji: string;
  /** Icon name for the UI (see components/glyph). */
  icon: string;
  isRainy: boolean;
  isCold: boolean;
  isNice: boolean;
  rainSoonPct: number; // max precipitation probability over the next 3 hours
  isDay: boolean;
};

/** WMO weather codes → short label + emoji (https://open-meteo.com/en/docs). */
export function describeCode(code: number, isDay: boolean): { label: string; emoji: string; icon: string; wet: boolean } {
  if (code === 0) return { label: isDay ? "Clear" : "Clear night", emoji: isDay ? "☀️" : "🌙", icon: isDay ? "sun" : "moon", wet: false };
  if (code <= 2) return { label: "Partly cloudy", emoji: isDay ? "⛅" : "☁️", icon: isDay ? "cloud-sun" : "cloud-moon", wet: false };
  if (code === 3) return { label: "Overcast", emoji: "☁️", icon: "cloud", wet: false };
  if (code <= 48) return { label: "Fog", emoji: "🌫️", icon: "fog", wet: false };
  if (code <= 57) return { label: "Drizzle", emoji: "🌦️", icon: "rain", wet: true };
  if (code <= 67) return { label: "Rain", emoji: "🌧️", icon: "rain", wet: true };
  if (code <= 77) return { label: "Snow", emoji: "🌨️", icon: "snow", wet: true };
  if (code <= 82) return { label: "Showers", emoji: "🌧️", icon: "rain", wet: true };
  if (code <= 86) return { label: "Snow showers", emoji: "🌨️", icon: "snow", wet: true };
  return { label: "Thunderstorm", emoji: "⛈️", icon: "storm", wet: true };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseOpenMeteo(data: any): Weather {
  const c = data.current;
  const isDay = c.is_day === 1;
  const d = describeCode(Number(c.weather_code), isDay);
  const rainSoonPct = Math.max(0, ...((data.hourly?.precipitation_probability ?? []) as number[]).slice(0, 3));
  const tempC = Math.round(c.temperature_2m);
  const feelsC = Math.round(c.apparent_temperature ?? c.temperature_2m);
  return {
    tempC,
    feelsC,
    label: d.label,
    emoji: d.emoji,
    icon: d.icon,
    isRainy: d.wet || Number(c.precipitation) > 0.2,
    isCold: feelsC < 5,
    isNice: !d.wet && feelsC >= 16 && feelsC <= 30,
    rainSoonPct,
    isDay,
  };
}

/** One sentence the concierge can act on. */
export function weatherHint(w: Weather): string {
  const parts = [`${w.label}, ${w.tempC}°C (feels like ${w.feelsC}°C)`];
  if (w.isRainy) parts.push("it is raining: prefer indoor places close by");
  else if (w.rainSoonPct >= 60) parts.push(`rain likely in the next hours (${w.rainSoonPct}%): avoid long outdoor walks`);
  if (w.isCold && !w.isRainy) parts.push("it is cold: prefer cozy indoor places and short walks");
  if (w.isNice) parts.push("pleasant weather: terraces and outdoor seating are a plus");
  return parts.join("; ");
}

/** Open-Meteo: free, no API key. Cached per ~1 km for 15 minutes. */
const cache = new Map<string, { at: number; w: Weather }>();
export async function getWeather(at: LatLng, fetchImpl: typeof fetch = fetch): Promise<Weather | null> {
  const key = `${at.lat.toFixed(2)},${at.lng.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit.w;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${at.lat}&longitude=${at.lng}&current=temperature_2m,apparent_temperature,precipitation,weather_code,is_day&hourly=precipitation_probability&forecast_hours=3&timezone=auto`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const w = parseOpenMeteo(await res.json());
    cache.set(key, { at: Date.now(), w });
    return w;
  } catch {
    return null; // weather is a nice-to-have; never block the app on it
  }
}

const EMOJI_ICON: Record<string, string> = { "☀️": "sun", "🌙": "moon", "⛅": "cloud-sun", "☁️": "cloud", "🌫️": "fog", "🌦️": "rain", "🌧️": "rain", "🌨️": "snow", "⛈️": "storm" };
/** Icon name, also for responses cached before the icon field existed. */
export const weatherIcon = (w: Pick<Weather, "emoji"> & { icon?: string }) => w.icon || EMOJI_ICON[w.emoji] || "cloud";

import type { LatLng } from "@/lib/geo";

/** Compass bearing in whole degrees from a to b (0 = north, 90 = east). */
export function bearing(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

/** Cache key for a venue position: 5 decimals is about a metre. */
export const viewKey = (p: LatLng) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;

/** A cached "no panorama here" is retried after this long, Google keeps driving new streets. */
export const NONE_RETRY_MS = 30 * 24 * 60 * 60_000;

export const PANO_ID_RE = /^[A-Za-z0-9_-]{10,80}$/;

import { distanceMeters, type LatLng } from "./geo";

/**
 * Orders stops with a nearest-neighbour walk from the start point, so a "plan my evening"
 * route does not zig-zag across town. Good enough for 2–8 stops.
 */
export function orderStops<T extends { location: LatLng }>(start: LatLng, stops: T[]): T[] {
  const left = [...stops];
  const out: T[] = [];
  let here = start;
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (distanceMeters(here, left[i].location) < distanceMeters(here, left[best].location)) best = i;
    const [next] = left.splice(best, 1);
    out.push(next);
    here = next.location;
  }
  return out;
}

/** Google Maps walking directions through every stop (opens the Maps app on phones). Max 9 waypoints. */
export function walkingRouteUrl(start: LatLng, stops: Array<{ location: LatLng }>): string | null {
  if (!stops.length) return null;
  const ordered = orderStops(start, stops).slice(0, 10);
  const fmt = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  // Walk when every leg is short; otherwise let Maps suggest public transport.
  let prev = start;
  let longest = 0;
  for (const s of ordered) {
    longest = Math.max(longest, distanceMeters(prev, s.location));
    prev = s.location;
  }
  const params = new URLSearchParams({
    api: "1",
    origin: fmt(start),
    destination: fmt(ordered[ordered.length - 1].location),
    travelmode: longest > 2500 ? "transit" : "walking",
  });
  if (ordered.length > 1) params.set("waypoints", ordered.slice(0, -1).map((s) => fmt(s.location)).join("|"));
  return `https://www.google.com/maps/dir/?${params}`;
}

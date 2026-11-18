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

type Stop = { location: LatLng; id?: string; name?: string; address?: string };

const isGoogleId = (id?: string) => !!id && /^ChIJ[\w-]{10,}$/.test(id);

/**
 * How Google Maps should name a stop. Google venues go by place id (exact, with name and photo in
 * Maps). Others go by "name, address" so Maps shows the venue instead of an unnamed dropped pin;
 * with no address we fall back to exact coordinates.
 */
export function stopTarget(s: Stop): { text: string; placeId?: string } {
  const coords = `${s.location.lat.toFixed(6)},${s.location.lng.toFixed(6)}`;
  if (isGoogleId(s.id)) return { text: s.name || coords, placeId: s.id };
  if (s.name && s.address) return { text: `${s.name}, ${s.address}` };
  return { text: coords };
}

/** Directions to one venue from the current position (walking, or transit when it is far). */
export function directionsUrl(place: Stop, from?: LatLng): string {
  const to = stopTarget(place);
  const params = new URLSearchParams({ api: "1", destination: to.text });
  if (to.placeId) params.set("destination_place_id", to.placeId);
  params.set("travelmode", from && distanceMeters(from, place.location) > 2500 ? "transit" : "walking");
  return `https://www.google.com/maps/dir/?${params}`;
}

/** Google Maps directions through every stop (opens the Maps app on phones). Max 9 waypoints. */
export function walkingRouteUrl(start: LatLng, stops: Stop[]): string | null {
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
  const last = stopTarget(ordered[ordered.length - 1]);
  const params = new URLSearchParams({
    api: "1",
    origin: fmt(start),
    destination: last.text,
    travelmode: longest > 2500 ? "transit" : "walking",
  });
  if (last.placeId) params.set("destination_place_id", last.placeId);
  const mid = ordered.slice(0, -1).map(stopTarget);
  if (mid.length) {
    params.set("waypoints", mid.map((m) => m.text).join("|"));
    // Place ids only when every waypoint has one (Maps needs the lists to line up).
    if (mid.every((m) => m.placeId)) params.set("waypoint_place_ids", mid.map((m) => m.placeId).join("|"));
  }
  return `https://www.google.com/maps/dir/?${params}`;
}

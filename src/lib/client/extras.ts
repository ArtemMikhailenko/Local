import type { Place } from "@/lib/places/types";

/** Light tap feedback on phones that support it. */
export const haptic = (ms = 12) => {
  try {
    navigator.vibrate?.(ms);
  } catch {}
};

/** Native share sheet on phones, clipboard fallback on desktop. Returns what happened for a toast. */
export async function sharePlace(place: Place): Promise<"shared" | "copied" | "cancelled"> {
  const url = `${location.origin}/place/${place.id}`;
  const text = `${place.name}${place.rating ? ` · ★ ${place.rating.toFixed(1)}` : ""} — found on Locali`;
  try {
    if (navigator.share) {
      await navigator.share({ title: place.name, text, url });
      return "shared";
    }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return "copied";
  } catch {
    return "cancelled";
  }
}

export type RecentItem = Pick<Place, "id" | "name" | "type"> & { photo?: string };
const RECENT = "locali:viewed";

export function rememberViewed(place: Place) {
  try {
    const item: RecentItem = { id: place.id, name: place.name, type: place.type, photo: place.photos[0] };
    const list = [item, ...readViewed().filter((x) => x.id !== place.id)].slice(0, 8);
    localStorage.setItem(RECENT, JSON.stringify(list));
  } catch {}
}

export function readViewed(): RecentItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

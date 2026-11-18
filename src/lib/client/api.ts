import type { Place } from "@/lib/places/types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Places already seen in lists, so a place page can render instantly while it refreshes. */
export const placeCache = new Map<string, Place>();
const remember = (list: Place[]) => {
  for (const p of list) placeCache.set(p.id, p);
  return list;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Request failed");
  return data as T;
}

export type User = { id: string; name: string; email: string };
export type SavedRow = { place: Place; note: string | null; savedAt: string };

export const api = {
  me: () => request<{ user: User | null; mode: "google" | "osm" | "demo" }>("/api/me"),
  login: (email: string, password: string) => request<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  signup: (name: string, email: string, password: string) =>
    request<{ user: User }>("/api/auth/signup", { method: "POST", body: JSON.stringify({ name, email, password }) }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  search: (q: string, lat: number, lng: number, opts: { open?: boolean; maxPrice?: number } = {}) => {
    const p = new URLSearchParams({ q, lat: String(lat), lng: String(lng) });
    if (opts.open) p.set("open", "1");
    if (opts.maxPrice) p.set("maxPrice", String(opts.maxPrice));
    return request<{ results: Place[] }>(`/api/places/search?${p}`).then((r) => ({ results: remember(r.results) }));
  },
  place: (id: string) => request<{ place: Place }>(`/api/places/${encodeURIComponent(id)}`).then((r) => (placeCache.set(r.place.id, r.place), r)),
  saved: () => request<{ saved: SavedRow[] }>("/api/saved").then((r) => (remember(r.saved.map((s) => s.place)), r)),
  save: (placeId: string) => request("/api/saved", { method: "POST", body: JSON.stringify({ placeId }) }),
  note: (placeId: string, note: string) => request("/api/saved", { method: "PATCH", body: JSON.stringify({ placeId, note }) }),
  unsave: (placeId: string) => request(`/api/saved?placeId=${encodeURIComponent(placeId)}`, { method: "DELETE" }),
};

import type { LatLng } from "@/lib/geo";

export type Review = { author: string; rating: number; text: string; when: string };

/** Provider-neutral place model. Google and demo data both normalize into this. */
export type Place = {
  id: string;
  name: string;
  type: string;
  rating: number | null;
  ratingCount: number | null;
  priceLevel: number | null; // 1..4
  address: string;
  location: LatLng;
  openNow: boolean | null;
  hours: string[];
  photos: string[]; // URLs safe to put in <img src>
  /** True when photos are category stock images, not of this venue (OSM data has no photos). */
  photosIllustrative?: boolean;
  summary: string | null;
  website: string | null;
  phone: string | null;
  mapsUrl: string | null;
  reviews: Review[];
};

export type SearchParams = {
  query: string;
  center: LatLng;
  radiusM?: number;
  openNow?: boolean;
  maxPrice?: number;
  limit?: number;
};

export interface PlacesProvider {
  search(params: SearchParams): Promise<Place[]>;
  details(id: string): Promise<Place | null>;
}

export const CATEGORIES = [
  { key: "coffee", label: "Coffee", emoji: "☕", query: "specialty coffee" },
  { key: "brunch", label: "Brunch", emoji: "🥞", query: "brunch" },
  { key: "dinner", label: "Dinner", emoji: "🍝", query: "restaurant dinner" },
  { key: "bars", label: "Bars", emoji: "🍸", query: "cocktail bar" },
  { key: "wine", label: "Wine", emoji: "🍷", query: "wine bar" },
  { key: "culture", label: "Culture", emoji: "🏛️", query: "museum gallery" },
] as const;

"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { haptic } from "@/lib/client/extras";
import { distanceMeters, formatDistance, walkingMinutes, type LatLng } from "@/lib/geo";
import { placeholderFor } from "@/lib/places/category-photos";
import { Glyph } from "./glyph";
import type { Place } from "@/lib/places/types";
import { useApp } from "./app-provider";
import { IconHeart, IconStar, IconWalk } from "./icons";

export const priceLabel = (n: number | null) => (n ? "$".repeat(n) : "");
export const pad2 = (n: number) => String(n).padStart(2, "0");

export function Rating({ place }: { place: Place }) {
  if (place.rating == null) return null;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-semibold">
      <IconStar className="h-3.5 w-3.5 text-accent" />
      {place.rating.toFixed(1)}
      {place.ratingCount ? <span className="font-normal text-muted">({place.ratingCount > 999 ? `${(place.ratingCount / 1000).toFixed(1)}k` : place.ratingCount})</span> : null}
    </span>
  );
}

export function OpenBadge({ open }: { open: boolean | null }) {
  const { t } = useApp();
  if (open == null) return null;
  return (
    <span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium", open ? "text-open" : "text-muted")}>
      <span className={clsx("h-2 w-2 rounded-full", open ? "bg-open" : "bg-line-strong")} />
      {open ? t("place.open") : t("place.closed")}
    </span>
  );
}

export function Walk({ from, to }: { from: LatLng; to: LatLng }) {
  const { t } = useApp();
  const d = distanceMeters(from, to);
  const min = walkingMinutes(d);
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] text-muted">
      <IconWalk className="h-3.5 w-3.5" />
      {min <= 30 ? t("place.min", { n: min }) : `${formatDistance(d)}`}
    </span>
  );
}

export function Meta({ place, center, className, showType = true }: { place: Place; center: LatLng; className?: string; showType?: boolean }) {
  return (
    <div className={clsx("flex flex-wrap items-center gap-x-3 gap-y-1", className)}>
      {showType && <span className="text-[13px] text-muted">{place.type}{place.priceLevel ? ` · ${priceLabel(place.priceLevel)}` : ""}</span>}
      <Rating place={place} />
      <Walk from={center} to={place.location} />
      <OpenBadge open={place.openNow} />
    </div>
  );
}

export function SaveButton({ placeId, className }: { placeId: string; className?: string }) {
  const { savedIds, toggleSave, t } = useApp();
  const on = savedIds.has(placeId);
  return (
    <button
      aria-label={on ? t("place.unsave") : t("place.save")}
      aria-pressed={on}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        haptic();
        toggleSave(placeId);
      }}
      className={clsx("grid h-9 w-9 place-items-center rounded-full bg-white/95 shadow-sm transition active:scale-90", on ? "text-accent" : "text-text hover:text-accent", className)}
    >
      <IconHeart className="h-[18px] w-[18px]" filled={on} />
    </button>
  );
}

export function IllustrativeTag({ className }: { className?: string }) {
  const { t } = useApp();
  return <span className={clsx("rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm", className)}>{t("place.illustration")}</span>;
}

/**
 * Image with graceful fallbacks, tried in order when one fails to load
 * (e.g. Google photo quota used up → street photo nearby → category photo).
 */
export function Photo({ src, alt, className, fallback }: { src?: string; alt: string; className?: string; fallback?: string | string[] }) {
  const [failed, setFailed] = useState(0);
  // Stock photos (old cached data, or a venue site using one) never stand in for the real place.
  const chain = [...new Set([src, ...(Array.isArray(fallback) ? fallback : fallback ? [fallback] : [])].filter((u): u is string => !!u && !/images\.unsplash\.com|pexels\.com/.test(u)))];
  const url = chain[failed] ?? "placeholder:dinner";
  if (url.startsWith("placeholder:")) {
    // Honest illustrated tile instead of a stock photo that could pass for the venue.
    return (
      <div role="img" aria-label={alt} className={clsx("relative grid place-items-center overflow-hidden bg-gradient-to-br from-[#ffe9e3] to-[#fbd3c8]", className)}>
        <Glyph name={url.slice(12)} className="h-[38%] max-h-24 w-[38%] max-w-24 text-accent/80" />
      </div>
    );
  }
  const street = url.startsWith("/api/street-photo");
  return (
    <div className={clsx("relative overflow-hidden", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={url} src={url} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed((f) => f + 1)} className="h-full w-full object-cover" />
      {street && <IllustrativeTag className="absolute bottom-2 left-2" />}
    </div>
  );
}

export const streetPhoto = (p: Pick<Place, "location">) => `/api/street-photo?lat=${p.location.lat.toFixed(6)}&lng=${p.location.lng.toFixed(6)}`;
/** When the venue photo fails (e.g. Google photo quota is used up): Street View of the entrance, then an illustrated tile. The venue photo stays first, so it comes back as soon as quota does. */
export const fallbackFor = (p: Pick<Place, "type" | "location">) => [streetPhoto(p), placeholderFor(p.type)];
/** For venues whose own photo is just an illustration, try the real street photo first. */
export const coverOf = (p: Place) => (p.photosIllustrative ? streetPhoto(p) : p.photos[0]);

/** Photo-first card for carousels. */
export function PlaceCard({ place, center }: { place: Place; center: LatLng; index?: number }) {
  return (
    <Link href={`/place/${place.id}`} className="group block w-[250px] shrink-0 snap-start">
      <div className="relative overflow-hidden rounded-[20px] bg-surface-2">
        <Photo src={coverOf(place)} fallback={[...fallbackFor(place), place.photos[0]]} alt={place.name} className="aspect-[4/5] w-full transition duration-500 group-hover:scale-[1.03]" />
        <SaveButton placeId={place.id} className="absolute right-3 top-3" />
      </div>
      <div className="px-1 pt-3">
        <h3 className="display-soft truncate text-[17px]">{place.name}</h3>
        <Meta place={place} center={center} className="mt-1" />
      </div>
    </Link>
  );
}

/** Compact list row. */
export function PlaceRow({ place, center, right }: { place: Place; center: LatLng; right?: React.ReactNode; index?: number }) {
  return (
    <Link href={`/place/${place.id}`} className="rise flex items-center gap-3.5 rounded-2xl p-2 transition hover:bg-canvas active:scale-[0.99]">
      <Photo src={coverOf(place)} fallback={[...fallbackFor(place), place.photos[0]]} alt={place.name} className="h-[72px] w-[72px] shrink-0 rounded-2xl" />
      <div className="min-w-0 flex-1">
        <div className="display-soft truncate text-[16px]">{place.name}</div>
        <Meta place={place} center={center} className="mt-1" />
      </div>
      {right ?? <SaveButton placeId={place.id} className="!bg-canvas !shadow-none" />}
    </Link>
  );
}

export function RowSkeleton() {
  return (
    <div className="flex items-center gap-3.5 p-2">
      <div className="skeleton h-[72px] w-[72px] !rounded-2xl" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-4 w-2/3" />
        <div className="skeleton h-3 w-1/3" />
      </div>
    </div>
  );
}

export function SectionTitle({ children, action }: { n?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between">
      <h2 className="display text-[22px]">{children}</h2>
      {action}
    </div>
  );
}

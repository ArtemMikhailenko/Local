"use client";

import Link from "next/link";
import clsx from "clsx";
import { distanceMeters, formatDistance, walkingMinutes, type LatLng } from "@/lib/geo";
import type { Place } from "@/lib/places/types";
import { haptic } from "@/lib/client/extras";
import { useApp } from "./app-provider";
import { IconHeart, IconStar, IconWalk } from "./icons";

export const priceLabel = (n: number | null) => (n ? "$".repeat(n) : "");

export function Rating({ place }: { place: Place }) {
  if (place.rating == null) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[13px] font-medium">
      <IconStar className="h-3.5 w-3.5 text-accent" />
      {place.rating.toFixed(1)}
      {place.ratingCount ? <span className="font-normal text-muted">({place.ratingCount > 999 ? `${(place.ratingCount / 1000).toFixed(1)}k` : place.ratingCount})</span> : null}
    </span>
  );
}

export function OpenBadge({ open }: { open: boolean | null }) {
  if (open == null) return null;
  return (
    <span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium", open ? "text-good" : "text-muted")}>
      <span className={clsx("h-1.5 w-1.5 rounded-full", open ? "bg-good" : "bg-muted")} />
      {open ? "Open now" : "Closed"}
    </span>
  );
}

export function Walk({ from, to }: { from: LatLng; to: LatLng }) {
  const d = distanceMeters(from, to);
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] text-muted">
      <IconWalk />
      {walkingMinutes(d) <= 30 ? `${walkingMinutes(d)} min` : formatDistance(d)}
    </span>
  );
}

export function SaveButton({ placeId, className }: { placeId: string; className?: string }) {
  const { savedIds, toggleSave } = useApp();
  const on = savedIds.has(placeId);
  return (
    <button
      aria-label={on ? "Remove from saved" : "Save"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        haptic();
        toggleSave(placeId);
      }}
      className={clsx("grid h-10 w-10 place-items-center rounded-full backdrop-blur-md transition active:scale-90", on ? "bg-accent text-black" : "bg-black/40 text-white", className)}
    >
      <IconHeart className="h-[18px] w-[18px]" filled={on} />
    </button>
  );
}

export function IllustrativeTag({ className }: { className?: string }) {
  return <span className={clsx("rounded-full bg-black/45 px-2 py-0.5 text-[10px] text-white/70 backdrop-blur-md", className)}>Illustrative photo</span>;
}

export function Photo({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  if (!src) return <div className={clsx("bg-gradient-to-br from-surface-2 to-surface", className)} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" className={clsx("object-cover", className)} />;
}

/** Big visual card for carousels. */
export function PlaceCard({ place, center, wide }: { place: Place; center: LatLng; wide?: boolean }) {
  return (
    <Link href={`/place/${place.id}`} className={clsx("group relative block shrink-0 snap-start overflow-hidden rounded-[26px] bg-surface", wide ? "w-full" : "w-[260px]")}>
      <Photo src={place.photos[0]} alt={place.name} className="h-[300px] w-full transition-transform duration-700 group-hover:scale-105" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
      <SaveButton placeId={place.id} className="absolute right-3 top-3" />
      {place.photosIllustrative && <IllustrativeTag className="absolute left-3 top-3" />}
      <div className="absolute inset-x-0 bottom-0 p-4">
        <div className="mb-1 flex items-center gap-2 text-[12px] text-white/70">
          <span>{place.type}</span>
          {place.priceLevel ? <span>· {priceLabel(place.priceLevel)}</span> : null}
        </div>
        <h3 className="font-display text-[28px] leading-[1.05]">{place.name}</h3>
        <div className="mt-2 flex items-center gap-3">
          <Rating place={place} />
          <Walk from={center} to={place.location} />
          <OpenBadge open={place.openNow} />
        </div>
      </div>
    </Link>
  );
}

/** Compact row for lists. */
export function PlaceRow({ place, center, right }: { place: Place; center: LatLng; right?: React.ReactNode }) {
  return (
    <Link href={`/place/${place.id}`} className="fade-up flex items-center gap-3 rounded-3xl p-2 transition hover:bg-white/[0.03] active:scale-[0.99]">
      <Photo src={place.photos[0]} alt={place.name} className="h-[76px] w-[76px] shrink-0 rounded-2xl" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] font-semibold">{place.name}</div>
        <div className="mt-0.5 truncate text-[13px] text-muted">
          {place.type}
          {place.priceLevel ? ` · ${priceLabel(place.priceLevel)}` : ""}
        </div>
        <div className="mt-1.5 flex items-center gap-3">
          <Rating place={place} />
          <Walk from={center} to={place.location} />
          <OpenBadge open={place.openNow} />
        </div>
      </div>
      {right ?? <SaveButton placeId={place.id} className="!bg-white/5" />}
    </Link>
  );
}

export function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 p-2">
      <div className="shimmer h-[76px] w-[76px] rounded-2xl" />
      <div className="flex-1 space-y-2">
        <div className="shimmer h-4 w-2/3 rounded-full" />
        <div className="shimmer h-3 w-1/3 rounded-full" />
      </div>
    </div>
  );
}

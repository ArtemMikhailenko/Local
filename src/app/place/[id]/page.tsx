"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { IconBack, IconShare, IconGlobe, IconPhone, IconRoute, IconSparkle, IconStar } from "@/components/icons";
import { MapView } from "@/components/map-view";
import { IllustrativeTag, OpenBadge, Photo, Rating, SaveButton, Walk, priceLabel } from "@/components/place-bits";
import { api, ApiError } from "@/lib/client/api";
import { rememberViewed, sharePlace } from "@/lib/client/extras";
import type { Place } from "@/lib/places/types";

export default function PlacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { center, toast } = useApp();
  const [place, setPlace] = useState<Place | null>(null);
  const [error, setError] = useState("");
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    let alive = true;
    api
      .place(id)
      .then((r) => {
        if (!alive) return;
        setPlace(r.place);
        rememberViewed(r.place);
      })
      .catch((e) => alive && setError(e instanceof ApiError && e.status === 404 ? "This place no longer exists." : "Could not load this place."));
    return () => {
      alive = false;
    };
  }, [id]);

  const back = () => (window.history.length > 1 ? router.back() : router.push("/"));

  if (error)
    return (
      <main className="grid min-h-dvh place-items-center px-8 text-center">
        <div>
          <p className="text-muted">{error}</p>
          <Link href="/" className="mt-4 inline-block rounded-full bg-surface-2 px-5 py-2.5">
            Back to discover
          </Link>
        </div>
      </main>
    );

  if (!place)
    return (
      <main>
        <div className="shimmer h-[420px]" />
        <div className="space-y-3 p-5">
          <div className="shimmer h-10 w-2/3 rounded-full" />
          <div className="shimmer h-4 w-1/2 rounded-full" />
        </div>
      </main>
    );

  const photos = place.photos.length ? place.photos : [undefined];
  const today = new Date().toLocaleDateString("en-US", { weekday: "long" });

  return (
    <main className="pb-10">
      <div className="relative">
        <div
          className="no-scrollbar flex h-[440px] snap-x snap-mandatory overflow-x-auto"
          onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        >
          {photos.map((src, i) => (
            <Photo key={i} src={src} alt={`${place.name} photo ${i + 1}`} className="h-full w-full shrink-0 snap-center" />
          ))}
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg via-transparent to-black/40" />
        <div className="absolute inset-x-0 top-0 flex justify-between p-4 pt-[max(env(safe-area-inset-top),16px)]">
          <button onClick={back} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-full bg-black/40 backdrop-blur-md">
            <IconBack />
          </button>
          <div className="flex gap-2">
            <button
              aria-label="Share"
              onClick={async () => {
                const r = await sharePlace(place);
                if (r === "copied") toast("Link copied");
              }}
              className="grid h-10 w-10 place-items-center rounded-full bg-black/40 backdrop-blur-md"
            >
              <IconShare />
            </button>
            <SaveButton placeId={place.id} />
          </div>
        </div>
        {place.photosIllustrative && <IllustrativeTag className="absolute bottom-24 right-4" />}
        {photos.length > 1 && (
          <div className="absolute bottom-24 left-0 right-0 flex justify-center gap-1.5">
            {photos.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === slide ? "w-5 bg-white" : "w-1.5 bg-white/40"}`} />
            ))}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 px-5 pb-2">
          <div className="text-[13px] text-white/70">
            {place.type}
            {place.priceLevel ? ` · ${priceLabel(place.priceLevel)}` : ""}
          </div>
          <h1 className="font-display text-[46px] leading-[0.95]">{place.name}</h1>
        </div>
      </div>

      <div className="fade-up px-5">
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Rating place={place} />
          <Walk from={center} to={place.location} />
          <OpenBadge open={place.openNow} />
        </div>

        {place.summary && <p className="mt-5 text-[17px] leading-relaxed text-text/90">{place.summary}</p>}

        <div className="mt-6 grid grid-cols-3 gap-2">
          {place.mapsUrl && (
            <a href={place.mapsUrl} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1.5 rounded-2xl bg-accent py-3 text-[13px] font-semibold text-black">
              <IconRoute />
              Directions
            </a>
          )}
          {place.website && (
            <a href={place.website} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface-2 py-3 text-[13px] font-medium">
              <IconGlobe />
              Website
            </a>
          )}
          {place.phone && (
            <a href={`tel:${place.phone}`} className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface-2 py-3 text-[13px] font-medium">
              <IconPhone />
              Call
            </a>
          )}
        </div>

        <Link
          href={`/concierge?q=${encodeURIComponent(`Something like ${place.name}, but different`)}`}
          className="mt-4 flex items-center gap-3 rounded-2xl border border-ai/25 bg-ai/10 p-4 text-[14px] text-ai"
        >
          <IconSparkle />
          Ask the concierge for places like this
        </Link>

        <div className="mt-7 text-[13px] text-muted">{place.address}</div>
        <div className="mt-3 overflow-hidden rounded-[24px] border border-line">
          <MapView places={[place]} center={place.location} activeId={place.id} zoom={15} className="h-[200px] w-full" />
        </div>

        {place.hours.length > 0 && (
          <section className="mt-8">
            <h2 className="font-display text-[26px]">Hours</h2>
            <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface">
              {place.hours.map((h) => {
                const [day, ...rest] = h.split(": ");
                return (
                  <li key={h} className={`flex justify-between px-4 py-2.5 text-[14px] ${day === today ? "font-semibold text-text" : "text-muted"}`}>
                    <span>{day}</span>
                    <span>{rest.join(": ")}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {place.reviews.length > 0 && (
          <section className="mt-8">
            <h2 className="font-display text-[26px]">What guests say</h2>
            <div className="no-scrollbar -mx-5 mt-3 flex snap-x gap-3 overflow-x-auto px-5">
              {place.reviews.map((r, i) => (
                <figure key={i} className="w-[280px] shrink-0 snap-start rounded-3xl border border-line bg-surface p-4">
                  <div className="flex gap-0.5 text-accent">
                    {Array.from({ length: Math.round(r.rating) }).map((_, j) => (
                      <IconStar key={j} className="h-3 w-3" />
                    ))}
                  </div>
                  <blockquote className="mt-2 line-clamp-5 text-[14px] leading-relaxed text-text/85">{r.text}</blockquote>
                  <figcaption className="mt-3 text-[12px] text-muted">
                    {r.author} · {r.when}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

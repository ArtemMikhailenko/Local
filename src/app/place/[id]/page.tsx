"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { IconArrow, IconBack, IconShare } from "@/components/icons";
import { MapView } from "@/components/map-view";
import { IllustrativeTag, OpenBadge, Photo, Rating, SaveButton, Walk, pad2, priceLabel } from "@/components/place-bits";
import { api, ApiError } from "@/lib/client/api";
import { rememberViewed, sharePlace } from "@/lib/client/extras";
import type { Place } from "@/lib/places/types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[84px_1fr] gap-3 border-b border-line py-3 last:border-0">
      <dt className="pt-0.5 text-[14px] text-muted">{label}</dt>
      <dd className="text-[15px] leading-snug">{children}</dd>
    </div>
  );
}

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
          <Link href="/" className="mt-4 inline-block font-semibold text-accent">
            Back to discover
          </Link>
        </div>
      </main>
    );

  if (!place)
    return (
      <main>
        <div className="skeleton h-[58vh]" />
        <div className="space-y-3 p-4">
          <div className="skeleton h-12 w-3/4" />
          <div className="skeleton h-4 w-1/2" />
        </div>
      </main>
    );

  const photos = place.photos.length ? place.photos : [undefined];
  const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const host = place.website ? new URL(place.website).hostname.replace(/^www\./, "") : null;

  return (
    <main className="pb-12">
      <div className="relative">
        <div className="no-scrollbar flex h-[58vh] max-h-[520px] snap-x snap-mandatory overflow-x-auto" onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
          {photos.map((src, i) => (
            <Photo key={i} src={src} alt={`${place.name}, photo ${i + 1}`} className="h-full w-full shrink-0 snap-center" />
          ))}
        </div>
        <div className="absolute inset-x-0 top-0 flex justify-between p-3 pt-[max(env(safe-area-inset-top),12px)]">
          <button onClick={back} aria-label="Back" className="grid h-9 w-9 place-items-center rounded-full bg-white/95 text-text shadow-sm">
            <IconBack className="h-5 w-5" />
          </button>
          <div className="flex gap-2">
            <button
              aria-label="Share"
              onClick={async () => {
                if ((await sharePlace(place)) === "copied") toast("Link copied");
              }}
              className="grid h-9 w-9 place-items-center rounded-full bg-white/95 text-text shadow-sm"
            >
              <IconShare />
            </button>
            <SaveButton placeId={place.id} />
          </div>
        </div>
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between">
          {place.photosIllustrative ? <IllustrativeTag /> : <span />}
          {photos.length > 1 && (
            <span className="rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-medium text-white">
              {pad2(slide + 1)} / {pad2(photos.length)}
            </span>
          )}
        </div>
      </div>

      <div className="rise px-4">
        <div className="mt-5 flex items-center gap-3 text-[14px] text-muted">
          <span>{place.type}</span>
          {place.priceLevel ? <span>{priceLabel(place.priceLevel)}</span> : null}
        </div>
        <h1 className="display mt-2 text-[32px]">{place.name}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <Rating place={place} />
          <Walk from={center} to={place.location} />
          <OpenBadge open={place.openNow} />
        </div>

        {place.summary && <p className="mt-5 text-[17px] leading-relaxed text-text/90">{place.summary}</p>}

        <div className="mt-6 grid grid-cols-[1fr_auto] gap-2">
          {place.mapsUrl && (
            <a href={place.mapsUrl} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-full bg-accent text-[16px] font-semibold text-accent-ink">
              Directions
              <IconArrow />
            </a>
          )}
          <Link
            href={`/concierge?q=${encodeURIComponent(`Something like ${place.name}, but different`)}`}
            className="flex h-12 items-center rounded-full bg-surface-2 px-5 text-[15px] font-semibold"
          >
            Similar →
          </Link>
        </div>

        <dl className="mt-8 rounded-2xl bg-canvas px-4">
          {place.address && <Row label="Address">{place.address}</Row>}
          {place.hours.length > 0 && (
            <Row label="Hours">
              <ul className="space-y-0.5">
                {place.hours.map((h) => {
                  const isToday = h.startsWith(today);
                  return (
                    <li key={h} className={isToday ? "font-semibold text-accent" : undefined}>
                      {h}
                    </li>
                  );
                })}
              </ul>
            </Row>
          )}
          {host && (
            <Row label="Website">
              <a href={place.website!} target="_blank" rel="noreferrer" className="border-b border-line-strong hover:border-text">
                {host}
              </a>
            </Row>
          )}
          {place.phone && (
            <Row label="Phone">
              <a href={`tel:${place.phone}`} className="border-b border-line-strong hover:border-text">
                {place.phone}
              </a>
            </Row>
          )}
        </dl>

        <div className="card mt-6 overflow-hidden">
          <MapView places={[place]} center={place.location} activeId={place.id} zoom={15} className="h-[200px] w-full" />
        </div>

        {place.reviews.length > 0 && (
          <section className="mt-9">
            <h2 className="display text-[22px]">What guests say</h2>
            {place.reviews.map((r, i) => (
              <figure key={i} className="mt-3 rounded-2xl bg-canvas p-4">
                <blockquote className="text-[15px] leading-relaxed text-text/90">“{r.text}”</blockquote>
                <figcaption className="mt-2 text-[13px] text-muted">
                  {"★".repeat(Math.round(r.rating))} · {r.author} · {r.when}
                </figcaption>
              </figure>
            ))}
          </section>
        )}
        {place.id.startsWith("osm_") && <p className="mt-8 text-[12px] text-muted">Data © OpenStreetMap contributors{place.photosIllustrative ? "" : " · Photo from the venue's website"}</p>}
      </div>
    </main>
  );
}

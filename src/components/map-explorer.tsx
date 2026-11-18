"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { api, type PublicEvent } from "@/lib/client/api";
import type { LatLng } from "@/lib/geo";
import { CATEGORIES, type Place } from "@/lib/places/types";
import { useApp } from "./app-provider";
import { Glyph } from "@/components/glyph";
import { IconBack } from "./icons";
import { MapView } from "./map-view";
import { Meta, Photo, SaveButton, coverOf, fallbackFor } from "./place-bits";
import { BasketButton } from "./vote-basket";

const fmtWhen = (iso: string, lang: string) =>
  new Date(iso).toLocaleString(lang === "uk" ? "uk-UA" : "en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Full-screen map: pick a category, drag anywhere to load that area, tap a pin to preview the
 * place in the strip at the bottom (and swipe the strip to move between places).
 */
export function MapExplorer({ open, onClose, initialCat = 2 }: { open: boolean; onClose: () => void; initialCat?: number }) {
  const { center, t, lang } = useApp();
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>(CATEGORIES[initialCat]);
  const [area, setArea] = useState<LatLng>(center);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<string | undefined>();
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [eventsMode, setEventsMode] = useState(false);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    api
      .search(cat.query, area.lat, area.lng)
      .then((r) => alive && (setPlaces(r.results.slice(0, 20)), setActive(r.results[0]?.id)))
      .catch(() => alive && setPlaces([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, cat, area]);

  // Public events are shown on top of any category; the "Events" chip shows only them.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    api
      .publicEvents(area.lat, area.lng)
      .then((r) => alive && setEvents(r.events))
      .catch(() => alive && setEvents([]));
    return () => {
      alive = false;
    };
  }, [open, area]);

  useEffect(() => {
    if (!active || !strip.current) return;
    strip.current.querySelector<HTMLElement>(`[data-id="${CSS.escape(active)}"]`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [active]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-[480px] flex-col bg-bg">
      <div className="absolute inset-x-0 top-0 z-10 space-y-2 p-3 pt-[max(env(safe-area-inset-top),12px)]">
        <div className="flex items-center gap-2">
          <button onClick={onClose} aria-label={t("map.close")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white shadow-md">
            <IconBack className="h-5 w-5" />
          </button>
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            <button
              onClick={() => (setEventsMode(true), setActive(events[0]?.id))}
              className={clsx("inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[14px] font-medium shadow-md", eventsMode ? "bg-accent text-accent-ink" : "bg-white text-text")}
            >
              <Glyph name="event" className="h-[18px] w-[18px]" />
              {t("map.events")}
              {events.length > 0 && <span className={clsx("rounded-full px-1.5 text-[12px]", eventsMode ? "bg-white/25" : "bg-accent text-accent-ink")}>{events.length}</span>}
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => (setEventsMode(false), setCat(c))}
                className={clsx("inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[14px] font-medium shadow-md", !eventsMode && c.key === cat.key ? "bg-text text-white" : "bg-white text-text")}
              >
                <Glyph name={c.key} className={clsx("h-[18px] w-[18px]", !eventsMode && c.key === cat.key ? "text-white" : "text-accent")} />
                {t(`cat.${c.key}`)}
              </button>
            ))}
          </div>
        </div>
        {eventsMode ? (
          <div className="w-fit max-w-full rounded-full bg-white px-3 py-1 text-[12px] font-medium shadow">{events.length ? t("map.eventsIn", { n: events.length }) : t("map.noEvents")}</div>
        ) : (
          <div className="w-fit rounded-full bg-white px-3 py-1 text-[12px] font-medium shadow">{loading ? t("map.loading") : t("map.inView", { n: places.length })}</div>
        )}
      </div>

      <MapView
        places={eventsMode ? [] : places}
        events={events}
        onSelectEvent={(id) => (setEventsMode(true), setActive(id))}
        center={center}
        activeId={active}
        onAreaChange={setArea}
        onSelect={setActive}
        quiet
        keepView
        zoom={15}
        className="h-[100dvh] w-full"
      />

      <div ref={strip} className="no-scrollbar absolute inset-x-0 bottom-0 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-2">
        {eventsMode &&
          events.map((e) => (
            <div key={e.id} data-id={e.id} onClick={() => setActive(e.id)} className={clsx("card w-[86%] shrink-0 snap-center p-3 transition", e.id === active ? "ring-2 ring-accent" : "opacity-95")}>
              <div className="flex gap-3">
                <Photo src={e.place.photo ?? undefined} fallback={fallbackFor(e.place)} alt={e.place.name} className="h-20 w-20 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-[12px] font-semibold text-accent"><Glyph name="event" className="h-4 w-4" />{fmtWhen(e.startsAt, lang)}</div>
                  <div className="display-soft truncate text-[16px]">{e.title}</div>
                  <div className="truncate text-[13px] text-muted">
                    {e.place.name}
                    {e.going > 0 && ` · ${t("ev.goingCount", { n: e.going })}`}
                  </div>
                </div>
              </div>
              <Link href={`/concierge?event=${e.id}`} className="mt-2.5 inline-flex h-10 w-full items-center justify-center rounded-full bg-accent text-[14px] font-semibold text-accent-ink">
                {lang === "uk" ? "Долучитися" : "Join"}
              </Link>
            </div>
          ))}
        {!eventsMode && places.map((p) => (
          <div
            key={p.id}
            data-id={p.id}
            onClick={() => setActive(p.id)}
            className={clsx("card w-[86%] shrink-0 snap-center p-3 transition", p.id === active ? "ring-2 ring-accent" : "opacity-95")}
          >
            <div className="flex gap-3">
              <Photo src={coverOf(p)} fallback={[...fallbackFor(p), p.photos[0]]} alt={p.name} className="h-20 w-20 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <Link href={`/place/${p.id}`} className="display-soft block truncate text-[16px] hover:text-accent">
                  {p.name}
                </Link>
                <Meta place={p} center={center} className="mt-1" />
              </div>
              <SaveButton placeId={p.id} className="!bg-canvas !shadow-none" />
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <Link href={`/place/${p.id}`} className="inline-flex h-10 items-center justify-center rounded-full bg-accent text-[14px] font-semibold text-accent-ink">
                {t("home.seeAll") === "Усі" ? "Відкрити" : "Open"}
              </Link>
              <BasketButton place={p} className="!h-10 !px-3 !text-[13px]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

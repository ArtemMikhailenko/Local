"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { api } from "@/lib/client/api";
import type { LatLng } from "@/lib/geo";
import { CATEGORIES, type Place } from "@/lib/places/types";
import { useApp } from "./app-provider";
import { IconBack } from "./icons";
import { MapView } from "./map-view";
import { Meta, Photo, SaveButton, coverOf, fallbackFor } from "./place-bits";
import { BasketButton } from "./vote-basket";

/**
 * Full-screen map: pick a category, drag anywhere to load that area, tap a pin to preview the
 * place in the strip at the bottom (and swipe the strip to move between places).
 */
export function MapExplorer({ open, onClose, initialCat = 2 }: { open: boolean; onClose: () => void; initialCat?: number }) {
  const { center, t } = useApp();
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>(CATEGORIES[initialCat]);
  const [area, setArea] = useState<LatLng>(center);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<string | undefined>();
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
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCat(c)}
                className={clsx("shrink-0 rounded-full px-3.5 py-2 text-[14px] font-medium shadow-md", c.key === cat.key ? "bg-text text-white" : "bg-white text-text")}
              >
                {c.emoji} {t(`cat.${c.key}`)}
              </button>
            ))}
          </div>
        </div>
        {!loading && <div className="w-fit rounded-full bg-white px-3 py-1 text-[12px] font-medium shadow">{t("map.inView", { n: places.length })}</div>}
      </div>

      <MapView
        places={places}
        center={center}
        activeId={active}
        onAreaChange={setArea}
        onSelect={setActive}
        loading={loading}
        keepView
        zoom={15}
        className="h-[100dvh] w-full"
      />

      <div ref={strip} className="no-scrollbar absolute inset-x-0 bottom-0 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-2">
        {places.map((p) => (
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

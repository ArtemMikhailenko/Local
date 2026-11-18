"use client";

import { useEffect, useRef, useState } from "react";
import { Glyph } from "@/components/glyph";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { useApp } from "@/components/app-provider";
import { Mascot } from "@/components/mascot";
import { IconDice, IconPin } from "@/components/icons";
import { MapView } from "@/components/map-view";
import { MapExplorer } from "@/components/map-explorer";
import { LocationSheet } from "@/components/location-sheet";
import { Photo, PlaceCard, PlaceRow, RowSkeleton, SectionTitle } from "@/components/place-bits";
import { api } from "@/lib/client/api";
import { haptic, readViewed, type RecentItem } from "@/lib/client/extras";
import { CATEGORIES, type Place } from "@/lib/places/types";
import { weatherIcon, type Weather } from "@/lib/weather";
import type { Key } from "@/lib/i18n";
import { placeholderFor } from "@/lib/places/category-photos";


const greetingKey = (h: number) => (h < 5 ? "greet.night" : h < 12 ? "greet.morning" : h < 18 ? "greet.afternoon" : "greet.evening");

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function Discover() {
  const { user, center, locationLabel, mode, ready, t, lang, setLang } = useApp();
  const PROMPTS = t("home.prompts").split("|");
  const router = useRouter();
  const now = useClock();
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>(CATEGORIES[2]);
  const [list, setList] = useState<Place[] | null>(null);
  const [viewed, setViewed] = useState<RecentItem[]>([]);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [rolling, setRolling] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  // The map can wander away from the list: venues for whatever area the user drags to.
  const [mapPlaces, setMapPlaces] = useState<Place[] | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const mapReq = useRef(0);

  async function loadArea(c: { lat: number; lng: number }) {
    const req = ++mapReq.current;
    setMapLoading(true);
    try {
      const { results } = await api.search(cat.query, c.lat, c.lng);
      if (req === mapReq.current) setMapPlaces(results.slice(0, 20));
    } catch {
    } finally {
      if (req === mapReq.current) setMapLoading(false);
    }
  }

  useEffect(() => setViewed(readViewed()), []);

  useEffect(() => {
    if (!ready) return;
    fetch(`/api/weather?lat=${center.lat}&lng=${center.lng}`)
      .then((r) => r.json())
      .then((d) => setWeather(d.weather))
      .catch(() => {});
  }, [center, ready]);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setList(null);
    setMapPlaces(null);
    api
      .search(cat.query, center.lat, center.lng)
      .then((r) => alive && setList(r.results))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [cat, center, ready]);

  /** "Surprise me": a random place that is open right now, from a random category. */
  async function surprise() {
    setRolling(true);
    haptic(20);
    try {
      const c = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
      const { results } = await api.search(c.query, center.lat, center.lng, { open: true });
      const good = results.filter((p) => (p.rating ?? 5) >= 4.4);
      const pool = good.length ? good : results;
      if (pool.length) router.push(`/place/${pool[Math.floor(Math.random() * pool.length)].id}`);
    } finally {
      setRolling(false);
    }
  }

  const time = now?.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const evening = now ? now.getHours() >= 17 || now.getHours() < 4 : true;
  const weatherPrompt = t(weather?.isRainy || weather?.isCold ? "wp.cozy" : weather?.isNice ? "wp.terrace" : "wp.any");

  return (
    <main className="px-4 pt-[max(env(safe-area-inset-top),16px)]">
      <header className="flex items-center justify-between">
        <button onClick={() => setLocOpen(true)} className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-3 py-1.5 text-[14px] font-medium transition hover:bg-surface-2 active:scale-95">
          <IconPin className="h-4 w-4 text-accent" />
          {locationLabel}
          {mode === "demo" && <span className="text-muted">· demo</span>}
          <span className="text-muted">▾</span>
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => setLang(lang === "uk" ? "en" : "uk")} aria-label="Language" className="rounded-full bg-canvas px-3 py-1.5 text-[14px] font-semibold">
            {lang === "uk" ? "EN" : "УКР"}
          </button>
          {weather && (
            <Link href={`/concierge?q=${encodeURIComponent(weatherPrompt)}`} className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-3 py-1.5 text-[14px] font-medium">
              <Glyph name={weatherIcon(weather)} className="h-[18px] w-[18px] text-accent" />
              {weather.tempC}°
            </Link>
          )}
          <Link href="/saved" aria-label="Profile" className="grid h-9 w-9 place-items-center rounded-full bg-text text-[14px] font-semibold text-white">
            {user ? user.name[0]?.toUpperCase() : "?"}
          </Link>
        </div>
      </header>

      <section className="rise pt-7">
        <p className="text-[15px] text-muted">
          {now ? t(greetingKey(now.getHours())) : t("greet.hello")}
          {user ? `, ${user.name.split(" ")[0]}` : ""}
          {time ? ` · ${time}` : ""}
        </p>
        <h1 className="display mt-1 text-[38px]">{t(evening ? "home.title.tonight" : "home.title.today")}</h1>
      </section>

      {/* Concierge entry: a friendly search-like box */}
      <section className="mt-5">
        <Link href="/concierge" className="card flex items-center gap-3 p-4 transition active:scale-[0.99]">
          <Mascot className="h-14 w-14 shrink-0" />
          <span className="min-w-0">
            <span className="block text-[16px] font-semibold">{t("home.ask")}</span>
            <span className="block truncate text-[14px] text-muted">{t("home.askHint")}</span>
          </span>
        </Link>
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          {PROMPTS.map((p) => (
            <Link key={p} href={`/concierge?q=${encodeURIComponent(p)}`} className="shrink-0 rounded-full border border-line px-3.5 py-2 text-[14px] transition hover:border-accent hover:text-accent">
              {p}
            </Link>
          ))}
        </div>
        {weather && (weather.isRainy || weather.isCold || weather.isNice) && (
          <Link href={`/concierge?q=${encodeURIComponent(weatherPrompt)}`} className="mt-3 flex items-center gap-2 rounded-2xl bg-accent-soft px-4 py-3 text-[14px] text-text">
            <Glyph name={weatherIcon(weather)} className="h-6 w-6 shrink-0 text-accent" />
            <span>
              {t(`wl.${weather.label}` as Key)}, {weather.tempC}°. {weather.isNice ? t("home.weather.nice") : t("home.weather.cozy")}
            </span>
          </Link>
        )}
      </section>

      <nav className="no-scrollbar -mx-4 mt-7 flex gap-2 overflow-x-auto px-4">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCat(c)}
            className={clsx("inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-medium transition", c.key === cat.key ? "bg-text text-white" : "bg-canvas text-text hover:bg-surface-2")}
          >
            <Glyph name={c.key} className={clsx("h-[18px] w-[18px]", c.key === cat.key ? "text-white" : "text-accent")} />
            {t(`cat.${c.key}`)}
          </button>
        ))}
      </nav>

      <section className="mt-6">
        <SectionTitle
          action={
            <Link href={`/search?q=${encodeURIComponent(cat.query)}`} className="text-[14px] font-semibold text-accent">
              {t("home.seeAll")}
            </Link>
          }
        >
          {t("home.top", { cat: t(`cat.${cat.key}`) })}
        </SectionTitle>
        <div className="no-scrollbar -mx-4 mt-3 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-2">
          {list === null
            ? [0, 1].map((i) => <div key={i} className="skeleton aspect-[4/5] w-[250px] shrink-0 !rounded-[20px]" />)
            : list.slice(0, 6).map((p) => <PlaceCard key={p.id} place={p} center={center} />)}
          {list?.length === 0 && <p className="py-10 text-muted">{t("home.empty")}</p>}
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle
          action={
            <button onClick={surprise} disabled={rolling} className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-accent disabled:opacity-50">
              <IconDice className={rolling ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              {t("home.surprise")}
            </button>
          }
        >
          {t("home.map")}
        </SectionTitle>
        <div className="card relative mt-3 overflow-hidden">
          <button onClick={() => setMapOpen(true)} className="absolute bottom-3 right-3 z-10 rounded-full bg-text px-4 py-2 text-[14px] font-semibold text-white shadow-lg">
            ⤢ {t("map.open")}
          </button>
          <MapView places={mapPlaces ?? list?.slice(0, 16) ?? []} center={center} onAreaChange={loadArea} loading={mapLoading} className="h-[320px] w-full" />
        </div>
      </section>

      {viewed.length > 0 && (
        <section className="mt-8">
          <SectionTitle>{t("home.recent")}</SectionTitle>
          <div className="no-scrollbar -mx-4 mt-3 flex gap-3 overflow-x-auto px-4">
            {viewed.map((v) => (
              <Link key={v.id} href={`/place/${v.id}`} className="w-[116px] shrink-0">
                <Photo src={v.photo} fallback={placeholderFor(v.type)} alt={v.name} className="aspect-square w-full rounded-2xl" />
                <div className="mt-2 truncate text-[14px] font-semibold">{v.name}</div>
                <div className="truncate text-[12px] text-muted">{v.type}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {(list === null || (list?.length ?? 0) > 6) && (
        <section className="mt-8">
          <SectionTitle>{t("home.more")}</SectionTitle>
          <div className="-mx-2 mt-2">{list === null ? [0, 1, 2].map((i) => <RowSkeleton key={i} />) : list.slice(6, 14).map((p) => <PlaceRow key={p.id} place={p} center={center} />)}</div>
        </section>
      )}
      <p className="py-10 text-center text-[12px] text-muted">{mode === "google" ? t("footer.dataGoogle") : t("footer.data")}</p>
      <LocationSheet open={locOpen} onClose={() => setLocOpen(false)} />
      <MapExplorer open={mapOpen} onClose={() => setMapOpen(false)} initialCat={CATEGORIES.findIndex((c) => c.key === cat.key)} />
    </main>
  );
}

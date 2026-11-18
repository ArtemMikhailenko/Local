"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { useApp } from "@/components/app-provider";
import { IconDice, IconPin, IconSparkle } from "@/components/icons";
import { MapView } from "@/components/map-view";
import { Photo, PlaceCard, PlaceRow, RowSkeleton } from "@/components/place-bits";
import { readViewed, haptic, type RecentItem } from "@/lib/client/extras";
import type { Weather } from "@/lib/weather";
import { api } from "@/lib/client/api";
import { CATEGORIES, type Place } from "@/lib/places/types";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const PROMPTS = ["Romantic dinner, not too pricey", "Rainy day with kids", "Laptop-friendly coffee", "Sunset drinks for 4"];

export default function Discover() {
  const { user, center, locationLabel, mode, ready } = useApp();
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>(CATEGORIES[2]);
  const [list, setList] = useState<Place[] | null>(null);
  const [viewed, setViewed] = useState<RecentItem[]>([]);
  const [weather, setWeather] = useState<Weather | null>(null);

  useEffect(() => {
    if (!ready) return;
    fetch(`/api/weather?lat=${center.lat}&lng=${center.lng}`)
      .then((r) => r.json())
      .then((d) => setWeather(d.weather))
      .catch(() => {});
  }, [center, ready]);
  const [rolling, setRolling] = useState(false);
  const router = useRouter();

  useEffect(() => setViewed(readViewed()), []);

  /** "Surprise me": a random well-rated place that is open right now, from a random category. */
  async function surprise() {
    setRolling(true);
    haptic(20);
    try {
      const c = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
      const { results } = await api.search(c.query, center.lat, center.lng, { open: true });
      const good = results.filter((p) => (p.rating ?? 0) >= 4.4);
      const pool = good.length ? good : results;
      if (pool.length) router.push(`/place/${pool[Math.floor(Math.random() * pool.length)].id}`);
    } finally {
      setRolling(false);
    }
  }

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setList(null);
    api
      .search(cat.query, center.lat, center.lng)
      .then((r) => alive && setList(r.results))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [cat, center, ready]);

  const top = list?.slice(0, 5) ?? [];
  const rest = list?.slice(5, 11) ?? [];

  return (
    <main className="pt-[max(env(safe-area-inset-top),20px)]">
      <header className="flex items-center justify-between px-5">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/70 px-3 py-1.5 text-[13px]">
          <IconPin className="h-3.5 w-3.5 text-accent" />
          {locationLabel}
          {mode === "demo" && <span className="ml-1 rounded-full bg-ai/15 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-ai">demo</span>}
        </div>
        <Link href="/saved" className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-sm font-semibold">
          {user ? user.name[0]?.toUpperCase() : "·"}
        </Link>
      </header>

      <section className="fade-up px-5 pt-7">
        {weather && (
          <Link
            href={`/concierge?q=${encodeURIComponent(weather.isRainy || weather.isCold ? "Somewhere cozy indoors, close by" : weather.isNice ? "A nice terrace for a drink" : "Something good nearby right now")}`}
            className="mb-3 inline-flex items-center gap-2 rounded-full bg-surface/70 py-1 pl-1.5 pr-3 text-[13px]"
          >
            <span className="text-base">{weather.emoji}</span>
            <span className="font-medium">{weather.tempC}°</span>
            <span className="text-muted">
              {weather.label}
              {weather.isRainy || weather.isCold ? " · cozy indoor picks →" : weather.isNice ? " · terrace weather →" : ""}
            </span>
          </Link>
        )}
        <p className="text-sm text-muted">
          {greeting()}
          {user ? `, ${user.name.split(" ")[0]}` : ""}
        </p>
        <h1 className="mt-1 font-display text-[44px] leading-[0.98]">
          Where to <span className="italic text-gradient">tonight?</span>
        </h1>
        <button
          onClick={surprise}
          disabled={rolling}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-4 py-2 text-sm font-medium transition hover:bg-surface-2 active:scale-95 disabled:opacity-60"
        >
          <IconDice className={rolling ? "h-4 w-4 animate-spin text-accent" : "h-4 w-4 text-accent"} />
          {rolling ? "Rolling…" : "Surprise me, something open now"}
        </button>
      </section>

      <section className="px-5 pt-5">
        <div className="group relative overflow-hidden rounded-[28px] border border-line bg-surface p-5">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-ai/25 blur-3xl transition group-hover:bg-ai/35" />
          <Link href="/concierge" className="flex items-center gap-3">
            <span className="orb orb-spin h-9 w-9 rounded-full" />
            <div>
              <div className="font-semibold">Ask the concierge</div>
              <div className="text-[13px] text-muted">Describe the vibe, get 3 hand-picked places</div>
            </div>
          </Link>
          <div className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5">
            {PROMPTS.map((p) => (
              <Link key={p} href={`/concierge?q=${encodeURIComponent(p)}`} className="shrink-0 rounded-full border border-ai/25 bg-ai/10 px-3 py-1.5 text-[13px] text-ai transition hover:bg-ai/20">
                <IconSparkle className="mr-1 inline h-3 w-3" />
                {p}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <nav className="no-scrollbar mt-6 flex gap-2 overflow-x-auto px-5">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCat(c)}
            className={clsx(
              "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition",
              c.key === cat.key ? "bg-text text-black" : "border border-line bg-surface/60 text-text/80 hover:bg-surface-2",
            )}
          >
            <span className="mr-1.5">{c.emoji}</span>
            {c.label}
          </button>
        ))}
      </nav>

      <section className="mt-5">
        <div className="flex items-baseline justify-between px-5">
          <h2 className="font-display text-[28px]">Top {cat.label.toLowerCase()} nearby</h2>
          <Link href={`/search?q=${encodeURIComponent(cat.query)}`} className="text-sm text-muted hover:text-text">
            See all
          </Link>
        </div>
        <div className="no-scrollbar mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 pb-1">
          {list === null
            ? [0, 1].map((i) => <div key={i} className="shimmer h-[300px] w-[260px] shrink-0 rounded-[26px]" />)
            : top.map((p) => <PlaceCard key={p.id} place={p} center={center} />)}
          {list?.length === 0 && <p className="py-10 text-muted">Nothing here yet. Try another category.</p>}
        </div>
      </section>

      {viewed.length > 0 && (
        <section className="mt-7">
          <h2 className="px-5 font-display text-[28px]">Recently viewed</h2>
          <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto px-5">
            {viewed.map((v) => (
              <Link key={v.id} href={`/place/${v.id}`} className="w-[120px] shrink-0">
                <Photo src={v.photo} alt={v.name} className="h-[120px] w-[120px] rounded-2xl" />
                <div className="mt-1.5 truncate text-[13px] font-medium">{v.name}</div>
                <div className="truncate text-[11px] text-muted">{v.type}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-7 px-5">
        <h2 className="font-display text-[28px]">On the map</h2>
        <div className="mt-3 overflow-hidden rounded-[26px] border border-line">
          <MapView places={list ?? []} center={center} className="h-[260px] w-full" />
        </div>
      </section>

      {(list === null || rest.length > 0) && (
        <section className="mt-7 px-3">
          <h2 className="px-2 font-display text-[28px]">More to explore</h2>
          <div className="mt-2">{list === null ? [0, 1, 2].map((i) => <RowSkeleton key={i} />) : rest.map((p) => <PlaceRow key={p.id} place={p} center={center} />)}</div>
        </section>
      )}
    </main>
  );
}

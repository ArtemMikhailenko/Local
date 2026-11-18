"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { useApp } from "@/components/app-provider";
import { IconSearch } from "@/components/icons";
import { PlaceRow, RowSkeleton } from "@/components/place-bits";
import { api } from "@/lib/client/api";
import { CATEGORIES, type Place } from "@/lib/places/types";

const RECENT_KEY = "locali:recent";
const readRecent = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
};

function SearchInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { center, ready, mode } = useApp();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const [maxPrice, setMaxPrice] = useState<number | undefined>();
  const [results, setResults] = useState<Place[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setRecent(readRecent()), []);

  useEffect(() => {
    if (!ready) return;
    const term = q.trim();
    if (term.length < 2) return setResults(null);
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .search(term, center.lat, center.lng, { open, maxPrice })
        .then((r) => {
          if (!alive) return;
          setResults(r.results);
          const next = [term, ...readRecent().filter((x) => x !== term)].slice(0, 6);
          try {
            localStorage.setItem(RECENT_KEY, JSON.stringify(next));
          } catch {}
          setRecent(next);
          router.replace(`/search?q=${encodeURIComponent(term)}`, { scroll: false });
        })
        .catch(() => alive && setResults([]))
        .finally(() => alive && setLoading(false));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open, maxPrice, center, ready]);

  const chip = (active: boolean) =>
    clsx("shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition", active ? "bg-accent text-black" : "border border-line bg-surface/60 text-text/80");

  return (
    <main className="pt-[max(env(safe-area-inset-top),20px)]">
      <div className="sticky top-0 z-20 bg-bg/80 px-5 pb-3 pt-2 backdrop-blur-xl">
        <h1 className="mb-3 font-display text-[40px] leading-none">Search</h1>
        <label className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 focus-within:border-accent/50">
          <IconSearch className="h-5 w-5 text-muted" />
          <input
            ref={input}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ramen, rooftop, bakery…"
            className="w-full bg-transparent text-[16px] outline-none placeholder:text-muted/70"
            enterKeyHint="search"
          />
          {q && (
            <button onClick={() => setQ("")} className="text-sm text-muted">
              Clear
            </button>
          )}
        </label>
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
          <button className={chip(open)} onClick={() => setOpen(!open)}>
            Open now
          </button>
          {mode !== "osm" && [1, 2, 3].map((n) => (
            <button key={n} className={chip(maxPrice === n)} onClick={() => setMaxPrice(maxPrice === n ? undefined : n)}>
              {"Up to " + "$".repeat(n)}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3">
        {results === null && !loading && (
          <div className="px-2 pt-4">
            {recent.length > 0 && (
              <>
                <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">Recent</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {recent.map((r) => (
                    <button key={r} onClick={() => setQ(r)} className="rounded-full border border-line px-3 py-1.5 text-sm">
                      {r}
                    </button>
                  ))}
                </div>
              </>
            )}
            <h2 className="mt-7 text-[13px] font-semibold uppercase tracking-wider text-muted">Browse</h2>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {CATEGORIES.map((c) => (
                <button key={c.key} onClick={() => setQ(c.query)} className="rounded-3xl border border-line bg-surface p-4 text-left transition hover:bg-surface-2">
                  <div className="text-2xl">{c.emoji}</div>
                  <div className="mt-6 font-display text-2xl">{c.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        {loading && [0, 1, 2, 3].map((i) => <RowSkeleton key={i} />)}
        {!loading && results?.length === 0 && <p className="px-2 pt-10 text-center text-muted">No places found. Try a broader word or remove filters.</p>}
        {!loading && results && results.length > 0 && (
          <>
            <p className="px-2 pb-1 pt-2 text-[13px] text-muted">{results.length} places</p>
            {results.map((p) => (
              <PlaceRow key={p.id} place={p} center={center} />
            ))}
          </>
        )}
      </div>
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchInner />
    </Suspense>
  );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { useApp } from "@/components/app-provider";
import { IconSearch } from "@/components/icons";
import { PlaceRow, RowSkeleton, SectionTitle } from "@/components/place-bits";
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
    clsx("shrink-0 rounded-full px-3.5 py-2 text-[14px] font-medium transition", active ? "bg-text text-white" : "bg-canvas text-text hover:bg-surface-2");

  return (
    <main className="px-4 pt-[max(env(safe-area-inset-top),14px)]">
      <div className="sticky top-0 z-20 -mx-4 bg-bg px-4 pb-3 pt-2">
        <h1 className="display text-[30px]">Search</h1>
        <label className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-canvas px-4 py-3 focus-within:border-accent">
          <IconSearch className="h-5 w-5 shrink-0 text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ramen, rooftop, bakery"
            className="w-full bg-transparent text-[17px] outline-none placeholder:text-muted"
            enterKeyHint="search"
          />
          {q && (
            <button onClick={() => setQ("")} className="mono text-muted hover:text-text">
              Clear
            </button>
          )}
        </label>
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
          <button className={chip(open)} onClick={() => setOpen(!open)}>
            Open now
          </button>
          {mode !== "osm" &&
            [1, 2, 3].map((n) => (
              <button key={n} className={chip(maxPrice === n)} onClick={() => setMaxPrice(maxPrice === n ? undefined : n)}>
                {"≤ " + "$".repeat(n)}
              </button>
            ))}
        </div>
      </div>

      {results === null && !loading && (
        <div className="pt-4">
          {recent.length > 0 && (
            <section className="mb-8">
              <SectionTitle>Recent</SectionTitle>
              <ul>
                {recent.map((r) => (
                  <li key={r}>
                    <button onClick={() => setQ(r)} className="flex w-full items-center justify-between border-b border-line py-3 text-left text-[16px] hover:text-accent">
                      {r}
                      <span className="mono text-muted">↵</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <SectionTitle>Browse</SectionTitle>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {CATEGORIES.map((c) => (
              <button key={c.key} onClick={() => setQ(c.query)} className="group rounded-2xl bg-canvas p-4 text-left transition hover:bg-accent-soft">
                <span className="text-2xl">{c.emoji}</span>
                <span className="display mt-6 block text-[18px] group-hover:text-accent">{c.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && [0, 1, 2, 3].map((i) => <RowSkeleton key={i} />)}
      {!loading && results?.length === 0 && <p className="pt-10 text-center text-muted">No places found. Try a broader word or remove filters.</p>}
      {!loading && results && results.length > 0 && (
        <>
          <p className="pb-1 pt-3 text-[14px] text-muted">{results.length} places</p>
          {results.map((p, i) => (
            <PlaceRow key={p.id} place={p} center={center} index={i} />
          ))}
        </>
      )}
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

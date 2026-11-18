"use client";

import { useEffect, useState } from "react";
import type { GeoHit } from "@/lib/geocode";
import { useApp } from "./app-provider";
import { Glyph } from "@/components/glyph";
import { IconPin } from "./icons";

/** Neighbourhoods and cities to explore from, without sharing your location. */
const SPOTS = [
  { en: "Podil, Kyiv", uk: "Поділ, Київ", lat: 50.4651, lng: 30.5155 },
  { en: "Khreshchatyk, Kyiv", uk: "Хрещатик, Київ", lat: 50.4475, lng: 30.5223 },
  { en: "Pechersk, Kyiv", uk: "Печерськ, Київ", lat: 50.4268, lng: 30.5391 },
  { en: "Lukianivka, Kyiv", uk: "Лук'янівка, Київ", lat: 50.4628, lng: 30.4823 },
  { en: "Obolon, Kyiv", uk: "Оболонь, Київ", lat: 50.5017, lng: 30.4985 },
  { en: "Lviv, Old Town", uk: "Львів, центр", lat: 49.8419, lng: 24.0316 },
  { en: "Odesa, Deribasivska", uk: "Одеса, Дерибасівська", lat: 46.4843, lng: 30.7376 },
  { en: "Kharkiv, centre", uk: "Харків, центр", lat: 49.9935, lng: 36.2304 },
  { en: "Dnipro, centre", uk: "Дніпро, центр", lat: 48.4647, lng: 35.0462 },
];

export function LocationSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { setLocation, locateMe, locationLabel, lang, t, center } = useApp();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<GeoHit[]>([]);
  useEffect(() => {
    if (q.trim().length < 3) return setHits([]);
    let alive = true;
    const timer = setTimeout(() => {
      fetch(`/api/geocode?q=${encodeURIComponent(q)}&lat=${center.lat}&lng=${center.lng}&lang=${lang}`)
        .then((r) => r.json())
        .then((d) => alive && setHits(d.results ?? []))
        .catch(() => {});
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, lang, center.lat, center.lng]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="sheet-in w-full max-w-[480px] rounded-t-[28px] bg-surface px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-3">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line-strong" />
        <h2 className="display text-[24px]">{t("loc.title")}</h2>
        <p className="mt-1 text-[14px] text-muted">{t("loc.lead")}</p>
        <button
          onClick={() => {
            locateMe();
            onClose();
          }}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-accent px-4 py-3.5 text-left text-[16px] font-semibold text-accent-ink"
        >
          <IconPin className="h-5 w-5" />
          {t("loc.mine")}
        </button>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("loc.search")}
          className="mt-3 w-full rounded-xl border border-line bg-canvas px-4 py-3 text-[16px] outline-none focus:border-accent"
        />
        <ul className="mt-2 max-h-[46vh] overflow-y-auto">
          {hits.map((h) => (
            <li key={`${h.location.lat},${h.location.lng}`}>
              <button
                onClick={() => {
                  setLocation(h.location, h.label);
                  setQ("");
                  onClose();
                }}
                className="flex w-full items-center gap-2 border-b border-line py-3.5 text-left text-[16px]"
              >
                <IconPin className="h-4 w-4 shrink-0 text-accent" />
                {h.label}
              </button>
            </li>
          ))}
          {hits.length === 0 && SPOTS.map((s) => {
            const label = lang === "uk" ? s.uk : s.en;
            const active = label === locationLabel;
            return (
              <li key={s.en}>
                <button
                  onClick={() => {
                    setLocation({ lat: s.lat, lng: s.lng }, label);
                    onClose();
                  }}
                  className="flex w-full items-center justify-between border-b border-line py-3.5 text-left text-[16px]"
                >
                  {label}
                  {active && <Glyph name="check" weight="bold" className="h-4 w-4 text-accent" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

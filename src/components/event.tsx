"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { Place } from "@/lib/places/types";
import type { RsvpStatus } from "@/lib/events";
import { useApp } from "./app-provider";
import { IconShare } from "./icons";
import { Meta, Photo, coverOf, fallbackFor } from "./place-bits";

type EventState = {
  id: string;
  title: string;
  place: Place;
  startsAt: string;
  note: string | null;
  past: boolean;
  going: string[];
  maybe: string[];
  no: string[];
  mine: { name: string; status: RsvpStatus } | null;
};
const NAME_KEY = "locali:voter-name";

function rememberEvent(id: string) {
  try {
    const mine: string[] = JSON.parse(localStorage.getItem("locali:events") ?? "[]");
    localStorage.setItem("locali:events", JSON.stringify([id, ...mine.filter((x) => x !== id)].slice(0, 30)));
  } catch {}
}

export async function shareEvent(id: string, title: string, when: string, lang: "en" | "uk", toast: (m: string) => void) {
  const url = `${location.origin}/concierge?event=${id}`;
  const text = lang === "uk" ? `${title}, ${when}. Підеш? Відповідь тут 👉 ${url}` : `${title}, ${when}. Coming? Answer here 👉 ${url}`;
  try {
    if (navigator.share) await navigator.share({ title, text });
    else {
      await navigator.clipboard.writeText(text);
      toast(lang === "uk" ? "Запрошення скопійовано" : "Invite copied");
    }
  } catch {}
}

const fmtWhen = (iso: string, lang: string) =>
  new Date(iso).toLocaleString(lang === "uk" ? "uk-UA" : "en-GB", { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/** Next round hour at least an hour from now, as a value for <input type="datetime-local">. */
function defaultWhen() {
  const d = new Date(Date.now() + 90 * 60_000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

export function CreateEventButton({ place, className }: { place: Place; className?: string }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={clsx("inline-flex h-12 items-center justify-center gap-2 rounded-full bg-text px-5 text-[15px] font-semibold text-white", className)}>
        🗓 {t("ev.create")}
      </button>
      <CreateEventSheet place={place} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function CreateEventSheet({ place, open, onClose }: { place: Place; open: boolean; onClose: () => void }) {
  const { t, toast, lang } = useApp();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(defaultWhen);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const finalTitle = title.trim() || t("ev.defaultTitle", { place: place.name });
    try {
      const startsAt = new Date(when).toISOString();
      const res = await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ placeId: place.id, title: finalTitle, startsAt, note }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not create the event");
      rememberEvent(data.id);
      onClose();
      router.push(`/concierge?event=${data.id}`);
      shareEvent(data.id, finalTitle, fmtWhen(startsAt, lang), lang, toast);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  const field = "mt-3 w-full rounded-xl border border-line bg-canvas px-4 py-3 text-[16px] outline-none focus:border-accent";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={create} className="sheet-in w-full max-w-[480px] rounded-t-[28px] bg-surface px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-3">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line-strong" />
        <h2 className="display text-[24px]">{t("ev.create")}</h2>
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-canvas p-2.5">
          <Photo src={coverOf(place)} fallback={[...fallbackFor(place), place.photos[0]]} alt={place.name} className="h-12 w-12 shrink-0 rounded-xl" />
          <div className="min-w-0">
            <div className="truncate font-semibold">{place.name}</div>
            <div className="truncate text-[13px] text-muted">{place.address || place.type}</div>
          </div>
        </div>
        <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder={t("ev.defaultTitle", { place: place.name })} />
        <input className={field} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
        <textarea className={clsx(field, "resize-none")} rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} placeholder={t("ev.notePh")} />
        <button disabled={busy} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[16px] font-semibold text-accent-ink disabled:opacity-60">
          <IconShare className="h-4 w-4" />
          {t("ev.createShare")}
        </button>
      </form>
    </div>
  );
}

/** The invite: place, time, who's coming, answer buttons, add-to-calendar. Updates live. */
export function EventPanel({ eventId }: { eventId: string }) {
  const { t, lang, toast, center } = useApp();
  const [ev, setEv] = useState<EventState | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setName(localStorage.getItem(NAME_KEY) ?? "");
    } catch {}
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/${encodeURIComponent(eventId)}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? "Event not found");
    setEv(data);
  }, [eventId]);

  useEffect(() => {
    load();
    const timer = setInterval(() => document.visibilityState === "visible" && load(), 5000);
    return () => clearInterval(timer);
  }, [load]);

  async function answer(status: RsvpStatus) {
    if (!name.trim()) return toast(t("vote.name"));
    setBusy(true);
    try {
      localStorage.setItem(NAME_KEY, name.trim());
    } catch {}
    const res = await fetch(`/api/events/${encodeURIComponent(eventId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), status }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast(data.error ?? "Error");
    rememberEvent(eventId);
    setEv(data);
  }

  if (error) return <div className="card p-5 text-center text-muted">{error}</div>;
  if (!ev) return <div className="skeleton h-[420px] !rounded-[20px]" />;
  const when = fmtWhen(ev.startsAt, lang);
  const buttons: Array<[RsvpStatus, string]> = [
    ["going", t("ev.going")],
    ["maybe", t("ev.maybe")],
    ["no", t("ev.no")],
  ];

  return (
    <div className="card rise overflow-hidden">
      <div className="relative">
        <Photo src={coverOf(ev.place)} fallback={[...fallbackFor(ev.place), ev.place.photos[0]]} alt={ev.place.name} className="aspect-[16/9] w-full" />
        <span className="absolute left-3 top-3 rounded-full bg-white px-3 py-1 text-[13px] font-semibold shadow">🗓 {when}</span>
      </div>
      <div className="p-4">
        <h2 className="display text-[24px]">{ev.title}</h2>
        <Link href={`/place/${ev.place.id}`} className="mt-1 block font-semibold text-accent">
          {ev.place.name} →
        </Link>
        <Meta place={ev.place} center={center} className="mt-1" />
        {ev.note && <p className="mt-3 rounded-xl bg-canvas px-3 py-2 text-[14px]">{ev.note}</p>}

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {(["going", "maybe", "no"] as const).map((k) => (
            <div key={k} className="rounded-2xl bg-canvas p-2.5">
              <div className="text-[22px] font-bold leading-none">{ev[k].length}</div>
              <div className="mt-1 text-[12px] text-muted">{t(`ev.${k}`)}</div>
            </div>
          ))}
        </div>
        {ev.going.length > 0 && <p className="mt-2 text-[13px] text-muted">✓ {ev.going.join(", ")}</p>}

        {!ev.past && (
          <>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder={t("vote.name")} className="mt-4 w-full rounded-xl border border-line bg-canvas px-4 py-3 text-[16px] outline-none focus:border-accent" />
            <div className="mt-2 grid grid-cols-3 gap-2">
              {buttons.map(([s, label]) => (
                <button
                  key={s}
                  disabled={busy}
                  onClick={() => answer(s)}
                  className={clsx("h-11 rounded-full text-[14px] font-semibold transition", ev.mine?.status === s ? "bg-accent text-accent-ink" : "bg-surface-2 text-text")}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <a href={`/api/events/${ev.id}/ics`} className="flex h-11 items-center justify-center rounded-full bg-surface-2 text-[14px] font-semibold">
            📅 {t("ev.calendar")}
          </a>
          <button onClick={() => shareEvent(ev.id, ev.title, when, lang, toast)} className="flex h-11 items-center justify-center gap-2 rounded-full bg-accent-soft text-[14px] font-semibold text-accent">
            <IconShare className="h-4 w-4" />
            {t("ev.invite")}
          </button>
        </div>
      </div>
    </div>
  );
}

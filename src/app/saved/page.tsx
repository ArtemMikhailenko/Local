"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { IconArrow } from "@/components/icons";
import { MapView } from "@/components/map-view";
import { PlaceRow, SaveButton, SectionTitle } from "@/components/place-bits";
import { api, type SavedRow } from "@/lib/client/api";
import type { LatLng } from "@/lib/geo";
import { walkingRouteUrl } from "@/lib/route";

/** Saved place with a private note ("ask for the window table"), edited inline and saved on blur. */
function SavedItem({ row, center, index }: { row: SavedRow; center: LatLng; index: number }) {
  const { toast, refreshSaved, t } = useApp();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(row.note ?? "");
  async function save() {
    setEditing(false);
    if (note.trim() === (row.note ?? "")) return;
    try {
      await api.note(row.place.id, note.trim());
      toast("Note saved");
      refreshSaved();
    } catch {
      toast("Could not save the note");
    }
  }
  return (
    <div>
      <PlaceRow place={row.place} center={center} right={<SaveButton placeId={row.place.id} className="!bg-canvas !shadow-none" />} />
      <div className="pb-2 pl-[94px]">
        {editing ? (
          <textarea
            autoFocus
            value={note}
            maxLength={280}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
            onBlur={save}
            placeholder={t("saved.notePh")}
            className="w-full resize-none rounded-xl border border-accent bg-canvas px-3 py-2 text-[14px] outline-none"
          />
        ) : (
          <button onClick={() => setEditing(true)} className="text-left text-[14px] text-muted hover:text-text">
            {row.note ? <span className="text-text/85">“{row.note}”</span> : <span className="text-[14px] font-medium text-accent">{t("saved.addNote")}</span>}
          </button>
        )}
      </div>
    </div>
  );
}

export default function SavedPage() {
  const { user, ready, saved, center, openAuth, setUser, t, lang, setLang } = useApp();
  const router = useRouter();
  if (!ready) return null;

  if (!user)
    return (
      <main className="px-4 pt-[max(env(safe-area-inset-top),14px)]">
        
        <h1 className="display mt-10 text-[34px]">{t("saved.your")}</h1>
        <p className="mt-4 max-w-[300px] text-[15px] leading-relaxed text-muted">{t("saved.lead")}</p>
        <button onClick={openAuth} className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[16px] font-semibold text-accent-ink">
          {t("saved.signin")}
          <IconArrow />
        </button>
      </main>
    );

  async function logout() {
    await api.logout().catch(() => {});
    setUser(null);
    router.push("/");
  }

  const route = saved.length > 1 ? walkingRouteUrl(center, saved.slice(0, 9).map((s) => s.place)) : null;

  return (
    <main className="px-4 pt-[max(env(safe-area-inset-top),14px)]">
      <header className="flex items-center justify-between text-[14px]">
        <span className="truncate text-text">
          {user.name} <span className="text-muted">· {user.email}</span>
        </span>
        <button onClick={() => setLang(lang === "uk" ? "en" : "uk")} className="shrink-0 rounded-full bg-canvas px-3 py-1 font-semibold">
          {lang === "uk" ? "EN" : "УКР"}
        </button>
        <button onClick={logout} className="shrink-0 text-muted hover:text-text">
          {t("saved.signout")}
        </button>
      </header>

      <h1 className="display mt-7 text-[34px]">
        {t("saved.title")} <span className="text-muted">{saved.length}</span>
      </h1>

      {saved.length === 0 ? (
        <div className="mt-6 rounded-2xl bg-canvas p-6">
          <p className="text-muted">{t("saved.empty")}</p>
          <Link href="/concierge" className="mt-4 inline-block font-semibold text-accent">
            {t("saved.openConcierge")}
          </Link>
        </div>
      ) : (
        <>
          <div className="card mt-5 overflow-hidden">
            <MapView places={saved.map((s) => s.place)} center={center} className="h-[220px] w-full" />
          </div>
          {route && (
            <a href={route} target="_blank" rel="noreferrer" className="mt-3 flex h-11 items-center justify-center gap-2 rounded-full bg-surface-2 text-[15px] font-semibold">
              {t("saved.walk")}
              <IconArrow />
            </a>
          )}
          <div className="mt-6">
            <SectionTitle>List</SectionTitle>
            {saved.map((s, i) => (
              <SavedItem key={s.place.id} row={s} center={center} index={i} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

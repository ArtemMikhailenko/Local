"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { useState } from "react";
import { IconHeart, IconRoute } from "@/components/icons";
import { MapView } from "@/components/map-view";
import { PlaceRow, SaveButton } from "@/components/place-bits";
import { api, type SavedRow } from "@/lib/client/api";
import { walkingRouteUrl } from "@/lib/route";
import type { LatLng } from "@/lib/geo";

/** Saved place with a private note ("ask for the window table"), edited inline and saved on blur. */
function SavedItem({ row, center }: { row: SavedRow; center: LatLng }) {
  const { toast, refreshSaved } = useApp();
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
      <PlaceRow place={row.place} center={center} right={<SaveButton placeId={row.place.id} className="!bg-accent/90" />} />
      <div className="-mt-1 mb-2 pl-[92px] pr-3">
        {editing ? (
          <textarea
            autoFocus
            value={note}
            maxLength={280}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
            onBlur={save}
            placeholder="Private note: who recommended it, what to order…"
            className="w-full resize-none rounded-xl border border-line bg-surface-2 px-3 py-2 text-[13px] outline-none focus:border-accent/50"
          />
        ) : (
          <button onClick={() => setEditing(true)} className="text-left text-[13px] text-muted hover:text-text">
            {row.note ? <span className="italic text-text/80">“{row.note}”</span> : "+ Add a note"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function SavedPage() {
  const { user, ready, saved, center, openAuth, setUser } = useApp();
  const router = useRouter();

  if (!ready) return null;

  if (!user)
    return (
      <main className="flex min-h-[80dvh] flex-col items-center justify-center px-8 text-center">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-accent/15 text-accent">
          <IconHeart className="h-9 w-9" />
        </div>
        <h1 className="mt-6 font-display text-[40px] leading-none">Your places</h1>
        <p className="mt-3 text-muted">Sign in to keep a private list of spots you love. The concierge uses it to learn your taste.</p>
        <button onClick={openAuth} className="mt-7 rounded-2xl bg-accent px-8 py-4 font-semibold text-black">
          Sign in or create account
        </button>
      </main>
    );

  async function logout() {
    await api.logout().catch(() => {});
    setUser(null);
    router.push("/");
  }

  return (
    <main className="pt-[max(env(safe-area-inset-top),20px)]">
      <header className="flex items-center justify-between px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="orb shrink-0 grid h-12 w-12 place-items-center rounded-full">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-bg text-lg font-semibold">{user.name[0]?.toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold">{user.name}</div>
            <div className="truncate text-[13px] text-muted">{user.email}</div>
          </div>
        </div>
        <button onClick={logout} className="shrink-0 whitespace-nowrap rounded-full border border-line px-4 py-2 text-sm text-muted hover:text-text">
          Sign out
        </button>
      </header>

      <h1 className="mt-8 px-5 font-display text-[44px] leading-none">
        Saved <span className="italic text-muted">· {saved.length}</span>
      </h1>

      {saved.length === 0 ? (
        <div className="mx-5 mt-6 rounded-[28px] border border-dashed border-line p-8 text-center">
          <p className="text-muted">Nothing saved yet. Tap the heart on any place, or let the concierge find some.</p>
          <Link href="/concierge" className="mt-5 inline-block rounded-full bg-ai/15 px-5 py-2.5 text-sm font-medium text-ai">
            Open concierge
          </Link>
        </div>
      ) : (
        <>
          <div className="mx-5 mt-5 overflow-hidden rounded-[26px] border border-line">
            <MapView places={saved.map((s) => s.place)} center={center} className="h-[220px] w-full" />
          </div>
          {saved.length > 1 && (
            <a
              href={walkingRouteUrl(center, saved.slice(0, 9).map((s) => s.place)) ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="mx-5 mt-3 flex items-center justify-center gap-2 rounded-2xl bg-surface-2 py-3 text-[14px] font-medium"
            >
              <IconRoute />
              Plan a walk through your saved places
            </a>
          )}
          <div className="mt-4 px-3">
            {saved.map((s) => (
              <SavedItem key={s.place.id} row={s} center={center} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { IconArrow } from "@/components/icons";
import { MapView } from "@/components/map-view";
import { BasketButton } from "@/components/vote-basket";
import { Photo, PlaceRow, SaveButton } from "@/components/place-bits";
import { Mascot } from "@/components/mascot";
import { categoryPhoto } from "@/lib/places/category-photos";
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
      <div className="flex items-center justify-between gap-2 pb-2 pl-[94px] pr-2">
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
            {row.note ? <span className="text-text/85">“{row.note}”</span> : <span className="whitespace-nowrap text-[14px] font-medium text-accent">{t("saved.addNote")}</span>}
          </button>
        )}
        {!editing && <BasketButton place={row.place} className="!h-8 shrink-0 !px-3 !text-[12px]" />}
      </div>
    </div>
  );
}

type PollRow = { id: string; title: string; createdAt: string; active: boolean; total: number; leader: { name: string; photo: string | null } | null; options: Array<{ name: string; photo: string | null }> };
type ChatRow = { id: string; title: string; at: number | string; count?: number; turns?: unknown[] };

function VotesTab() {
  const { t } = useApp();
  const [polls, setPolls] = useState<PollRow[] | null>(null);
  useEffect(() => {
    let ids = "";
    try {
      ids = (JSON.parse(localStorage.getItem("locali:polls") ?? "[]") as string[]).join(",");
    } catch {}
    fetch(`/api/polls/mine?ids=${encodeURIComponent(ids)}`)
      .then((r) => r.json())
      .then((d) => setPolls(d.polls ?? []))
      .catch(() => setPolls([]));
  }, []);
  if (polls === null) return <div className="skeleton mt-4 h-24" />;
  if (!polls.length) return <p className="mt-6 rounded-2xl bg-canvas p-6 text-muted">{t("saved.votes.empty")}</p>;
  return (
    <ul className="mt-4 space-y-3">
      {polls.map((p) => (
        <li key={p.id}>
          <Link href={`/concierge?poll=${p.id}`} className="card flex items-center gap-3 p-3 transition active:scale-[0.99]">
            <div className="flex -space-x-4">
              {p.options.slice(0, 3).map((o, i) => (
                <Photo key={i} src={o.photo ?? undefined} fallback={categoryPhoto("restaurant", o.name)} alt={o.name} className="h-12 w-12 rounded-full ring-2 ring-white" />
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px] font-semibold">{p.title}</div>
              <div className="truncate text-[13px] text-muted">{p.leader ? t("saved.votes.leading", { name: p.leader.name }) : p.total ? `${p.total}` : t("saved.votes.noVotes")}</div>
            </div>
            <span className={p.active ? "rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-accent" : "rounded-full bg-canvas px-2.5 py-1 text-[12px] font-semibold text-muted"}>
              {p.active ? t("saved.votes.active") : t("saved.votes.ended")} · {p.total}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ChatsTab() {
  const { t, user, lang } = useApp();
  const [chats, setChats] = useState<ChatRow[] | null>(null);
  useEffect(() => {
    const local: ChatRow[] = (() => {
      try {
        const hist = JSON.parse(localStorage.getItem("locali:chat:history") ?? "[]") as ChatRow[];
        const cur = JSON.parse(localStorage.getItem("locali:chat:current") ?? "null") as { id?: string; turns?: Array<{ prompt: string }> } | null;
        const current = cur && !Array.isArray(cur) && cur.id && cur.turns?.length ? [{ id: cur.id, title: cur.turns[0].prompt, at: Date.now(), turns: cur.turns }] : [];
        return [...current, ...hist];
      } catch {
        return [];
      }
    })();
    if (!user) return setChats(local);
    fetch("/api/chats")
      .then((r) => r.json())
      .then((d) => {
        const remote: ChatRow[] = d.chats ?? [];
        const ids = new Set(remote.map((c) => c.id));
        setChats([...remote, ...local.filter((c) => !ids.has(c.id))]);
      })
      .catch(() => setChats(local));
  }, [user]);
  if (chats === null) return <div className="skeleton mt-4 h-24" />;
  return (
    <>
      {!user && <p className="mt-4 text-[13px] text-muted">{t("saved.chats.local")}</p>}
      {!chats.length ? (
        <p className="mt-6 rounded-2xl bg-canvas p-6 text-muted">{t("saved.chats.empty")}</p>
      ) : (
        <ul className="mt-3">
          {chats.map((c) => (
            <li key={c.id}>
              <Link href={`/concierge?chat=${c.id}`} className="flex items-center gap-3 border-b border-line py-3.5">
                <Mascot className="h-10 w-10 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px]">{c.title}</span>
                  <span className="block text-[13px] text-muted">
                    {new Date(c.at).toLocaleString(lang === "uk" ? "uk-UA" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} ·{" "}
                    {t("c.messages", { n: c.turns?.length ?? c.count ?? 0 })}
                  </span>
                </span>
                <span className="text-muted">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function SavedPage() {
  const { user, ready, saved, center, openAuth, setUser, t, lang, setLang } = useApp();
  const router = useRouter();
  const [tab, setTab] = useState<"places" | "votes" | "chats">("places");
  if (!ready) return null;

  async function logout() {
    await api.logout().catch(() => {});
    setUser(null);
    router.push("/");
  }

  const route = saved.length > 1 ? walkingRouteUrl(center, saved.slice(0, 9).map((s) => s.place)) : null;

  return (
    <main className="px-4 pt-[max(env(safe-area-inset-top),14px)]">
      <header className="flex items-center justify-between gap-2 text-[14px]">
        <span className="truncate text-text">
          {user ? (
            <>
              {user.name} <span className="text-muted">· {user.email}</span>
            </>
          ) : null}
        </span>
        <button onClick={() => setLang(lang === "uk" ? "en" : "uk")} className="shrink-0 rounded-full bg-canvas px-3 py-1 font-semibold">
          {lang === "uk" ? "EN" : "УКР"}
        </button>
        {user ? (
          <button onClick={logout} className="shrink-0 text-muted hover:text-text">
            {t("saved.signout")}
          </button>
        ) : (
          <button onClick={openAuth} className="shrink-0 font-semibold text-accent">
            {t("auth.signin")}
          </button>
        )}
      </header>

      <h1 className="display mt-6 text-[34px]">{t("saved.title")}</h1>
      <div className="mt-4 grid grid-cols-3 rounded-full bg-canvas p-1">
        {(["places", "votes", "chats"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={tab === k ? "rounded-full bg-white py-2 text-[14px] font-semibold shadow-sm" : "py-2 text-[14px] font-medium text-muted"}>
            {t(`saved.tab.${k}`)}
          </button>
        ))}
      </div>

      {tab === "votes" && <VotesTab />}
      {tab === "chats" && <ChatsTab />}

      {tab === "places" && !user && (
        <div className="mt-6 rounded-2xl bg-canvas p-6">
          <p className="text-[15px] leading-relaxed text-muted">{t("saved.lead")}</p>
          <button onClick={openAuth} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[16px] font-semibold text-accent-ink">
            {t("saved.signin")}
            <IconArrow />
          </button>
        </div>
      )}

      {tab === "places" && user && saved.length === 0 && (
        <div className="mt-6 rounded-2xl bg-canvas p-6">
          <p className="text-muted">{t("saved.empty")}</p>
          <Link href="/concierge" className="mt-4 inline-block font-semibold text-accent">
            {t("saved.openConcierge")}
          </Link>
        </div>
      )}

      {tab === "places" && user && saved.length > 0 && (
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
          <div className="mt-4">
            {saved.map((s, i) => (
              <SavedItem key={s.place.id} row={s} center={center} index={i} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ApiError } from "@/lib/client/api";
import type { Place } from "@/lib/places/types";
import type { Tally } from "@/lib/polls";
import { useApp } from "./app-provider";
import { IconShare } from "./icons";
import { Photo, fallbackFor } from "./place-bits";

type PollState = { id: string; title: string; places: Place[]; tally: Tally[]; leader: string | null; total: number; myVote: string | null };
const NAME_KEY = "locali:voter-name";

export async function createPoll(title: string, placeIds: string[]): Promise<string> {
  const res = await fetch("/api/polls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, placeIds }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Could not create the vote");
  return data.id as string;
}

/**
 * Some apps (Telegram, Viber) keep only `text` from the share sheet and drop `url`,
 * so the link always goes inside the text as well.
 */
export async function sharePoll(id: string, title: string, toast: (m: string) => void, lang: "en" | "uk" = "en") {
  const url = `${location.origin}/concierge?poll=${id}`;
  const text =
    lang === "uk" ? `Допоможи вибрати, куди йдемо: «${title}». Голосуй тут 👉 ${url}` : `Help us choose where to go: “${title}”. Vote here 👉 ${url}`;
  try {
    if (navigator.share) await navigator.share({ title: lang === "uk" ? "Куди йдемо?" : "Where shall we go?", text });
    else {
      await navigator.clipboard.writeText(text);
      toast(lang === "uk" ? "Посилання скопійовано, надішли друзям" : "Vote link copied, send it to friends");
    }
  } catch {}
}

/** Live vote: anyone with the link can vote (no account); results refresh every few seconds. */
export function VotePanel({ pollId }: { pollId: string }) {
  const { toast, t, lang } = useApp();
  const [poll, setPoll] = useState<PollState | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setName(localStorage.getItem(NAME_KEY) ?? "");
    } catch {}
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/polls/${encodeURIComponent(pollId)}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? "Vote not found");
    setPoll(data);
  }, [pollId]);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 4000);
    return () => clearInterval(t);
  }, [load]);

  async function vote(placeId: string) {
    if (!name.trim()) return toast("Add your name first");
    setBusy(true);
    try {
      localStorage.setItem(NAME_KEY, name.trim());
    } catch {}
    const res = await fetch(`/api/polls/${encodeURIComponent(pollId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeId, name: name.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast(data.error ?? "Vote failed");
    setPoll(data);
  }

  if (error) return <div className="card p-5 text-center text-muted">{error}</div>;
  if (!poll) return <div className="skeleton h-[320px] !rounded-[20px]" />;

  const max = Math.max(1, ...poll.tally.map((x) => x.votes));
  return (
    <div className="card rise space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-accent">{t("vote.kicker")}</div>
          <h2 className="display mt-1 text-[22px]">{poll.title}</h2>
          <p className="mt-1 text-[13px] text-muted">
            {t("vote.count", { n: poll.total })}
          </p>
        </div>
        <button onClick={() => sharePoll(poll.id, poll.title, toast, lang)} aria-label="Share vote link" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
          <IconShare />
        </button>
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={30}
        placeholder={t("vote.name")}
        className="w-full rounded-xl border border-line bg-canvas px-4 py-3 text-[16px] outline-none focus:border-accent"
      />

      <div className="space-y-2">
        {poll.places.map((p) => {
          const tl = poll.tally.find((x) => x.placeId === p.id)!;
          const mine = poll.myVote === p.id;
          const leading = poll.leader === p.id;
          return (
            <button
              key={p.id}
              disabled={busy}
              onClick={() => vote(p.id)}
              className={clsx("relative w-full overflow-hidden rounded-2xl border p-2.5 text-left transition active:scale-[0.99]", mine ? "border-accent" : "border-line")}
            >
              <span className="absolute inset-y-0 left-0 bg-accent-soft transition-all duration-500" style={{ width: `${(tl.votes / max) * 100}%` }} />
              <span className="relative flex items-center gap-3">
                <Photo src={p.photos[0]} fallback={fallbackFor(p)} alt={p.name} className="h-14 w-14 shrink-0 rounded-xl" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold">{p.name}</span>
                    {leading && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-ink">{t("vote.leading")}</span>}
                  </span>
                  <span className="block text-[13px] text-muted">{p.type}</span>
                  {tl.voters.length > 0 && <span className="mt-0.5 block truncate text-[12px] font-medium text-accent">{tl.voters.join(", ")}</span>}
                </span>
                <span className="text-right">
                  <span className="block text-[22px] font-bold leading-none">{tl.votes}</span>
                  {mine && <span className="text-[11px] text-accent">{t("vote.yours")}</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[13px] text-muted">
        <span>{t("vote.help")}</span>
        {poll.leader && (
          <Link href={`/place/${poll.leader}`} className="font-semibold text-accent">
            {t("vote.winner")}
          </Link>
        )}
      </div>
    </div>
  );
}

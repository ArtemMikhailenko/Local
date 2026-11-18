"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ApiError } from "@/lib/client/api";
import type { Place } from "@/lib/places/types";
import type { Tally } from "@/lib/polls";
import { useApp } from "./app-provider";
import { IconShare } from "./icons";
import { Photo } from "./place-bits";

type PollState = { id: string; title: string; places: Place[]; tally: Tally[]; leader: string | null; total: number; myVote: string | null };
const NAME_KEY = "locali:voter-name";

export async function createPoll(title: string, placeIds: string[]): Promise<string> {
  const res = await fetch("/api/polls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, placeIds }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Could not create the vote");
  return data.id as string;
}

export async function sharePoll(id: string, title: string, toast: (m: string) => void) {
  const url = `${location.origin}/concierge?poll=${id}`;
  try {
    if (navigator.share) await navigator.share({ title: "Help us choose", text: `${title} · vote on Locali`, url });
    else {
      await navigator.clipboard.writeText(url);
      toast("Vote link copied, send it to friends");
    }
  } catch {}
}

/** Live vote: anyone with the link can vote (no account); results refresh every few seconds. */
export function VotePanel({ pollId }: { pollId: string }) {
  const { toast } = useApp();
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

  if (error) return <div className="rounded-2xl border border-line bg-surface p-5 text-center text-muted">{error}</div>;
  if (!poll) return <div className="shimmer h-[320px] rounded-[26px]" />;

  const max = Math.max(1, ...poll.tally.map((t) => t.votes));
  return (
    <div className="fade-up space-y-3 rounded-[28px] border border-ai/20 bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wider text-ai">Decide together</div>
          <h2 className="mt-1 font-display text-[28px] leading-[1.05]">{poll.title}</h2>
          <p className="mt-1 text-[13px] text-muted">
            {poll.total} {poll.total === 1 ? "vote" : "votes"} so far · updates live
          </p>
        </div>
        <button onClick={() => sharePoll(poll.id, poll.title, toast)} aria-label="Share vote link" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ai/15 text-ai">
          <IconShare />
        </button>
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={30}
        placeholder="Your name"
        className="w-full rounded-2xl border border-line bg-surface-2 px-4 py-3 text-[15px] outline-none focus:border-ai/50"
      />

      <div className="space-y-2">
        {poll.places.map((p) => {
          const t = poll.tally.find((x) => x.placeId === p.id)!;
          const mine = poll.myVote === p.id;
          const leading = poll.leader === p.id;
          return (
            <button
              key={p.id}
              disabled={busy}
              onClick={() => vote(p.id)}
              className={clsx("relative w-full overflow-hidden rounded-2xl border p-2.5 text-left transition active:scale-[0.99]", mine ? "border-ai/60 bg-ai/10" : "border-line bg-surface-2/50")}
            >
              <span className="absolute inset-y-0 left-0 bg-ai/15 transition-all duration-500" style={{ width: `${(t.votes / max) * 100}%` }} />
              <span className="relative flex items-center gap-3">
                <Photo src={p.photos[0]} alt={p.name} className="h-14 w-14 shrink-0 rounded-xl" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold">{p.name}</span>
                    {leading && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-black">LEADING</span>}
                  </span>
                  <span className="block text-[12px] text-muted">{p.type}</span>
                  {t.voters.length > 0 && <span className="mt-0.5 block truncate text-[12px] text-ai">{t.voters.join(", ")}</span>}
                </span>
                <span className="text-right">
                  <span className="block font-display text-[26px] leading-none">{t.votes}</span>
                  {mine && <span className="text-[10px] text-ai">your vote</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between pt-1 text-[12px] text-muted">
        <span>Tap a place to vote. Tap another to change.</span>
        {poll.leader && (
          <Link href={`/place/${poll.leader}`} className="font-medium text-accent">
            Open winner →
          </Link>
        )}
      </div>
    </div>
  );
}

"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import { useApp } from "@/components/app-provider";
import { IconRoute, IconSearch, IconSend, IconSparkle, IconShare } from "@/components/icons";
import { PlanTimeline } from "@/components/plan-timeline";
import { VoiceButton } from "@/components/voice-button";
import { VotePanel, createPoll, sharePoll } from "@/components/vote-panel";
import { walkingRouteUrl } from "@/lib/route";
import { OpenBadge, Photo, Rating, SaveButton, Walk, priceLabel } from "@/components/place-bits";
import type { ConciergeEvent } from "@/lib/concierge/agent";

type Step = { kind: "status" | "search" | "inspect"; text: string };
type ResultEvent = Extract<ConciergeEvent, { t: "result" }>;
type PlanEvent = Extract<ConciergeEvent, { t: "plan" }>;
type Turn = { id: number; prompt: string; steps: Step[]; result?: ResultEvent; plan?: PlanEvent; error?: string; done: boolean; pollId?: string };

const SUGGESTIONS = [
  "Plan a 4-hour date night from now, ending with a nightcap",
  "Romantic dinner for two, under $$$, walking distance",
  "We're 4 friends, want craft beer and something to eat",
  "Rainy afternoon with a 6-year-old",
  "Quiet café to work for 3 hours with good wifi",
  "Best spot to watch the sunset with a drink",
];

function stepFrom(e: ConciergeEvent): Step | null {
  if (e.t === "status") return { kind: "status", text: e.text };
  if (e.t === "search") return { kind: "search", text: `Searched “${e.query}” · ${e.count} found` };
  if (e.t === "inspect") return { kind: "inspect", text: `Checking ${e.name}` };
  return null;
}

function ConciergeInner() {
  const params = useSearchParams();
  const { center, toast } = useApp();
  const pollParam = params.get("poll");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const busy = turns.some((t) => !t.done);
  const bottom = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const inFlight = useRef(false);
  const nextId = useRef(1);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  useEffect(() => {
    const q = params.get("q");
    if (q && !started.current) {
      started.current = true;
      ask(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  function update(id: number, fn: (t: Turn) => Turn) {
    setTurns((all) => all.map((t) => (t.id === id ? fn(t) : t)));
  }

  async function ask(prompt: string) {
    const text = prompt.trim();
    if (text.length < 3 || inFlight.current) return;
    inFlight.current = true;
    const id = nextId.current++;
    let finished = false;
    const previous = turns
      .filter((t) => t.result || t.plan)
      .slice(-3)
      .map((t) => ({ prompt: t.prompt, picked: t.result ? t.result.picks.map((p) => p.place.name) : t.plan!.stops.map((s) => s.place.name) }));
    setTurns((all) => [...all, { id, prompt: text, steps: [], done: false }]);
    setInput("");

    try {
      const res = await fetch("/api/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, lat: center.lat, lng: center.lng, previous }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "The concierge is unavailable right now.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as ConciergeEvent;
          const step = stepFrom(e);
          if (step) update(id, (t) => ({ ...t, steps: [...t.steps, step] }));
          if (e.t === "result" || e.t === "plan" || e.t === "error") finished = true;
          if (e.t === "plan") update(id, (t) => ({ ...t, plan: e }));
          if (e.t === "result") update(id, (t) => ({ ...t, result: e }));
          if (e.t === "error") update(id, (t) => ({ ...t, error: e.message }));
        }
      }
      if (!finished) update(id, (t) => ({ ...t, error: "The connection dropped before the concierge finished. Please try again." }));
    } catch (err) {
      update(id, (t) => ({ ...t, error: err instanceof Error ? err.message : "Network error" }));
    } finally {
      inFlight.current = false;
      update(id, (t) => ({ ...t, done: true }));
    }
  }

  return (
    <main className="flex min-h-[calc(100dvh-8rem)] flex-col pt-[max(env(safe-area-inset-top),20px)]">
      <header className="flex items-center gap-3 px-5">
        <span className={clsx("orb h-9 w-9 rounded-full", busy ? "orb-spin" : "")} />
        <div>
          <div className="font-semibold leading-tight">Locali Concierge</div>
          <div className="text-[12px] text-muted">{busy ? "Looking around for you…" : "Knows every street nearby"}</div>
        </div>
      </header>

      {pollParam && turns.length === 0 ? (
        <section className="flex-1 px-4 py-6">
          <VotePanel pollId={pollParam} />
          <p className="mt-6 text-center text-[13px] text-muted">Want ideas of your own? Ask the concierge below.</p>
        </section>
      ) : turns.length === 0 ? (
        <section className="fade-up flex flex-1 flex-col justify-center px-5 pb-4 pt-6">
          <div className="orb orb-spin mx-auto h-16 w-16 rounded-full opacity-90 blur-[1px]" />
          <h1 className="mt-6 text-center font-display text-[40px] leading-[1]">
            Tell me the <span className="italic text-gradient">vibe</span>,<br />I&apos;ll find the place.
          </h1>
          <p className="mx-auto mt-3 max-w-[300px] text-center text-[14px] text-muted">Who you&apos;re with, budget, mood, time. I check what&apos;s open and nearby, then pick three.</p>
          <div className="mt-6 space-y-2 pb-4">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={s}
                onClick={() => ask(s)}
                style={{ animationDelay: `${i * 60}ms` }}
                className="fade-up flex w-full items-center gap-3 rounded-2xl border border-line bg-surface/70 px-4 py-3 text-left text-[14px] transition hover:border-ai/30 hover:bg-surface-2"
              >
                <IconSparkle className="h-4 w-4 shrink-0 text-ai" />
                {s}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="flex-1 space-y-8 px-4 py-6">
          {turns.map((t) => (
            <div key={t.id} className="space-y-4">
              <div className="ml-auto w-fit max-w-[85%] rounded-[22px] rounded-br-md bg-accent px-4 py-2.5 text-[15px] text-black">{t.prompt}</div>

              {((!t.result && !t.plan) || !t.done) && !t.error && (
                <ol className="space-y-2 pl-1">
                  {t.steps.map((s, i) => (
                    <li key={i} className="fade-up flex items-center gap-2.5 text-[13px] text-muted">
                      <span className={clsx("grid h-5 w-5 place-items-center rounded-full", s.kind === "search" ? "bg-ai/15 text-ai" : "bg-white/5")}>
                        {s.kind === "search" ? <IconSearch className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                      </span>
                      {s.text}
                    </li>
                  ))}
                  {!t.done && (
                    <li className="flex items-center gap-2.5 text-[13px] text-ai">
                      <span className="orb orb-pulse h-5 w-5 rounded-full" />
                      Thinking…
                    </li>
                  )}
                </ol>
              )}

              {t.error && <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-[14px] text-red-200">{t.error}</div>}

              {t.plan && <PlanTimeline plan={t.plan} center={center} />}

              {t.result && (
                <div className="space-y-3">
                  <p className="fade-up flex gap-2 text-[15px] leading-relaxed">
                    <IconSparkle className="mt-1 h-4 w-4 shrink-0 text-ai" />
                    {t.result.intro}
                  </p>
                  {t.result.picks.map((p, i) => (
                    <Link
                      key={p.place_id}
                      href={`/place/${p.place.id}`}
                      style={{ animationDelay: `${i * 120}ms` }}
                      className="fade-up block overflow-hidden rounded-[26px] border border-line bg-surface transition active:scale-[0.99]"
                    >
                      <div className="relative">
                        <Photo src={p.place.photos[0]} alt={p.place.name} className="h-[180px] w-full" />
                        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/10 to-transparent" />
                        <span className="absolute left-3 top-3 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md">#{i + 1}</span>
                        <SaveButton placeId={p.place.id} className="absolute right-3 top-3" />
                        <div className="absolute inset-x-0 bottom-0 px-4">
                          <div className="text-[12px] font-medium text-ai">{p.headline}</div>
                          <h3 className="font-display text-[30px] leading-[1.02]">{p.place.name}</h3>
                        </div>
                      </div>
                      <div className="px-4 pb-4 pt-2">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <Rating place={p.place} />
                          <Walk from={center} to={p.place.location} />
                          <OpenBadge open={p.place.openNow} />
                          {p.place.priceLevel ? <span className="text-[12px] text-muted">{priceLabel(p.place.priceLevel)}</span> : null}
                        </div>
                        <p className="mt-2.5 text-[14px] leading-relaxed text-text/85">{p.why}</p>
                        {p.tip && (
                          <p className="mt-2.5 rounded-xl bg-accent/10 px-3 py-2 text-[13px] text-accent">
                            <span className="font-semibold">Tip:</span> {p.tip}
                          </p>
                        )}
                      </div>
                    </Link>
                  ))}
                  {t.done && t.result.picks.length > 1 && (
                    <a
                      href={walkingRouteUrl(center, t.result.picks.map((p) => p.place)) ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 rounded-2xl bg-accent py-3 text-[14px] font-semibold text-black"
                    >
                      <IconRoute />
                      Walk them all as one evening
                    </a>
                  )}
                  {t.done && t.result.picks.length > 1 && !t.pollId && (
                    <button
                      onClick={async () => {
                        try {
                          const pid = await createPoll(t.prompt.slice(0, 80), t.result!.picks.map((p) => p.place.id));
                          update(t.id, (x) => ({ ...x, pollId: pid }));
                          sharePoll(pid, t.prompt.slice(0, 80), toast);
                        } catch {
                          toast("Could not start a vote");
                        }
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-ai/30 bg-ai/10 py-3 text-[14px] font-semibold text-ai"
                    >
                      <IconShare className="h-4 w-4" />
                      Can&apos;t decide? Let friends vote
                    </button>
                  )}
                  {t.pollId && <VotePanel pollId={t.pollId} />}
                  {t.done && (
                    <div className="no-scrollbar flex gap-2 overflow-x-auto pt-1">
                      {["Cheaper options", "Somewhere quieter", "Closer to me", "Something more unusual"].map((r) => (
                        <button key={r} disabled={busy} onClick={() => ask(r)} className="shrink-0 rounded-full border border-ai/25 bg-ai/10 px-3 py-1.5 text-[13px] text-ai disabled:opacity-50">
                          {r}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={bottom} />
        </section>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="sticky bottom-28 z-30 mx-4 mt-2"
      >
        <div className="glass flex items-end gap-2 rounded-[26px] p-2 pl-4 shadow-2xl shadow-black/40">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            rows={1}
            maxLength={500}
            placeholder={turns.length ? "Refine, or ask something new…" : "Dinner with my parents, they love fish…"}
            className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-[15px] outline-none placeholder:text-muted/70"
          />
          <VoiceButton disabled={busy} onText={setInput} onFinal={(t) => ask(t)} />
          <button disabled={busy || input.trim().length < 3} aria-label="Send" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-black transition disabled:bg-white/10 disabled:text-muted">
            <IconSend />
          </button>
        </div>
      </form>
    </main>
  );
}

export default function ConciergePage() {
  return (
    <Suspense>
      <ConciergeInner />
    </Suspense>
  );
}

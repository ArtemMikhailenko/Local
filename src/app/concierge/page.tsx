"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { Mascot } from "@/components/mascot";
import { IconArrow, IconRoute, IconShare } from "@/components/icons";
import { PlanTimeline } from "@/components/plan-timeline";
import { VoiceButton } from "@/components/voice-button";
import { VotePanel, createPoll, sharePoll } from "@/components/vote-panel";
import { walkingRouteUrl } from "@/lib/route";
import { IllustrativeTag, Meta, Photo, SaveButton } from "@/components/place-bits";
import type { ConciergeEvent } from "@/lib/concierge/agent";
import { placeCache } from "@/lib/client/api";
import type { T } from "@/lib/i18n";

type Step = { kind: "status" | "search" | "inspect"; text: string };
type ResultEvent = Extract<ConciergeEvent, { t: "result" }>;
type PlanEvent = Extract<ConciergeEvent, { t: "plan" }>;
type Turn = { id: number; prompt: string; steps: Step[]; result?: ResultEvent; plan?: PlanEvent; error?: string; done: boolean; pollId?: string };

function stepFrom(e: ConciergeEvent, tr: T): Step | null {
  if (e.t === "status") return { kind: "status", text: tr("c.reading") };
  if (e.t === "search") return { kind: "search", text: tr("c.searched", { q: e.query, n: e.count }) };
  if (e.t === "inspect") return { kind: "inspect", text: tr("c.checking", { name: e.name }) };
  return null;
}

function ConciergeInner() {
  const params = useSearchParams();
  const { center, toast, t: tr, lang } = useApp();
  const SUGGESTIONS = tr("c.suggestions").split("|");
  const REFINE = tr("c.refine").split("|");
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
        body: JSON.stringify({ prompt: text, lat: center.lat, lng: center.lng, previous, lang }),
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
          const step = stepFrom(e, tr);
          if (step) update(id, (t) => ({ ...t, steps: [...t.steps, step] }));
          if (e.t === "result" || e.t === "plan" || e.t === "error") finished = true;
          if (e.t === "plan") e.stops.forEach((s) => placeCache.set(s.place.id, s.place));
          if (e.t === "result") e.picks.forEach((p) => placeCache.set(p.place.id, p.place));
          if (e.t === "plan") update(id, (t) => ({ ...t, plan: e }));
          if (e.t === "result") update(id, (t) => ({ ...t, result: e }));
          if (e.t === "error") update(id, (t) => ({ ...t, error: e.message }));
        }
      }
      if (!finished) update(id, (t) => ({ ...t, error: tr("c.dropped") }));
    } catch (err) {
      update(id, (t) => ({ ...t, error: err instanceof Error ? err.message : "Network error" }));
    } finally {
      inFlight.current = false;
      update(id, (t) => ({ ...t, done: true }));
    }
  }

  return (
    <main className="flex min-h-[calc(100dvh-7rem)] flex-col px-4 pt-[max(env(safe-area-inset-top),14px)]">
      <header className="flex items-center gap-3">
        <Mascot className="h-12 w-12" mood={busy ? "thinking" : turns.some((t) => t.result || t.plan) ? "happy" : "idle"} />
        <div>
          <div className="text-[16px] font-semibold leading-tight">{tr("c.name")}</div>
          <div className="text-[13px] text-muted">{busy ? tr("c.busy") : tr("c.idle")}</div>
        </div>
      </header>

      {pollParam && turns.length === 0 ? (
        <section className="flex-1 py-6">
          <VotePanel pollId={pollParam} />
          <p className="mt-6 text-center text-[14px] text-muted">{tr("c.ownIdeas")}</p>
        </section>
      ) : turns.length === 0 ? (
        <section className="rise flex-1 pb-4 pt-8">
          <Mascot className="mb-4 h-24 w-24" />
          <h1 className="display text-[34px]">
            {tr("c.title")}
          </h1>
          <p className="mt-4 max-w-[310px] text-[15px] leading-relaxed text-muted">{tr("c.lead")}</p>
          <div className="mt-7 space-y-2">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={s}
                onClick={() => ask(s)}
                style={{ animationDelay: `${i * 50}ms` }}
                className="rise flex w-full items-center gap-3 rounded-2xl bg-canvas px-4 py-3.5 text-left text-[15px] transition hover:bg-accent-soft"
              >
                <span className="flex-1 leading-snug">{s}</span>
                <span className="text-muted">→</span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="flex-1 space-y-10 py-6">
          {turns.map((t) => (
            <div key={t.id} className="space-y-4">
              <div className="ml-auto w-fit max-w-[85%] rounded-[20px] rounded-br-md bg-accent px-4 py-2.5 text-[15px] text-accent-ink">{t.prompt}</div>

              {((!t.result && !t.plan) || !t.done) && !t.error && (
                <ol className="space-y-2 text-[14px]">
                  {t.steps.map((s, i) => (
                    <li key={i} className="rise flex items-center gap-2 text-muted">
                      <span className="h-1.5 w-1.5 rounded-full bg-open" />
                      {s.text}
                    </li>
                  ))}
                  {!t.done && (
                    <li className="flex items-center gap-2 font-medium text-accent">
                      <Mascot className="h-7 w-7" mood="thinking" />
                      <span className="dots">{tr("c.thinking")}</span>
                    </li>
                  )}
                </ol>
              )}

              {t.error && <div className="rounded-2xl bg-[#fdecea] px-4 py-3 text-[15px] text-danger">{t.error}</div>}

              {t.plan && <PlanTimeline plan={t.plan} center={center} />}

              {t.result && (
                <div className="space-y-5">
                  <p className="rise text-[16px] leading-relaxed">{t.result.intro}</p>
                  {t.result.picks.map((p, i) => (
                    <Link key={p.place_id} href={`/place/${p.place.id}`} style={{ animationDelay: `${i * 120}ms` }} className="card rise block overflow-hidden">
                      <div className="relative">
                        <Photo src={p.place.photos[0]} alt={p.place.name} className="aspect-[16/10] w-full" />
                        <span className="absolute left-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-white text-[13px] font-bold shadow-sm">{i + 1}</span>
                        <SaveButton placeId={p.place.id} className="absolute right-3 top-3" />
                        {p.place.photosIllustrative && <IllustrativeTag className="absolute bottom-3 left-3" />}
                      </div>
                      <div className="p-4">
                        <div className="text-[13px] font-semibold text-accent">{p.headline}</div>
                        <h3 className="display mt-1 text-[22px]">{p.place.name}</h3>
                        <Meta place={p.place} center={center} className="mt-1.5" />
                        <p className="mt-3 text-[15px] leading-relaxed text-text/85">{p.why}</p>
                        {p.tip && <p className="mt-3 rounded-xl bg-canvas px-3 py-2 text-[14px] text-text/80">💡 {p.tip}</p>}
                      </div>
                    </Link>
                  ))}
                  {t.done && t.result.picks.length > 1 && (
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={walkingRouteUrl(center, t.result.picks.map((p) => p.place)) ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-11 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-accent-ink"
                      >
                        <IconRoute />
                        {tr("c.walkAll")}
                      </a>
                      {!t.pollId ? (
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
                          className="flex h-11 items-center justify-center gap-2 rounded-full bg-surface-2 text-[15px] font-semibold"
                        >
                          <IconShare className="h-4 w-4" />
                          {tr("c.vote")}
                        </button>
                      ) : (
                        <span className="flex h-11 items-center justify-center rounded-full bg-accent-soft text-[14px] font-medium text-accent">{tr("c.voteLive")}</span>
                      )}
                    </div>
                  )}
                  {t.pollId && <VotePanel pollId={t.pollId} />}
                </div>
              )}

              {t.done && (t.result || t.plan) && (
                <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
                  {REFINE.map((r, ri) => (
                    <button key={r} disabled={busy} onClick={() => ask(ri === REFINE.length - 1 ? (lang === "uk" ? "Зроби з цього план вечора по годинах" : "Turn this into a timed plan for the evening") : lang === "uk" ? `${r}, будь ласка` : `${r} options`)} className="shrink-0 rounded-full border border-line px-3.5 py-2 text-[14px] hover:border-accent hover:text-accent disabled:opacity-40">
                      {r}
                    </button>
                  ))}
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
        className="sticky bottom-[78px] z-30 mt-2 pb-2"
      >
        <div className="card flex items-end gap-2 !rounded-[26px] p-1.5 pl-4">
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
            placeholder={turns.length ? tr("c.placeholderMore") : tr("c.placeholder")}
            className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-[16px] outline-none placeholder:text-muted"
          />
          <VoiceButton disabled={busy} onText={setInput} onFinal={(t) => ask(t)} />
          <button disabled={busy || input.trim().length < 3} aria-label="Send" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition disabled:bg-surface-2 disabled:text-muted">
            <IconArrow />
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

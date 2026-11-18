"use client";

import { Glyph } from "@/components/glyph";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { Mascot } from "@/components/mascot";
import { IconArrow, IconRoute, IconShare } from "@/components/icons";
import { PlanTimeline } from "@/components/plan-timeline";
import { VoiceButton } from "@/components/voice-button";
import { VotePanel, createPoll, sharePoll } from "@/components/vote-panel";
import { EventPanel } from "@/components/event";
import { walkingRouteUrl } from "@/lib/route";
import { IllustrativeTag, Meta, Photo, SaveButton, coverOf, fallbackFor } from "@/components/place-bits";
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

const CURRENT_KEY = "locali:chat:current";
const HISTORY_KEY = "locali:chat:history";
type Chat = { id: string; title: string; at: number | string; turns?: Turn[]; count?: number; remote?: boolean };

/**
 * Conversations: always kept in this browser (localStorage); for signed-in users also synced to
 * their account (/api/chats), so history follows them across devices.
 */
const store = {
  read<T>(key: string, fallback: T): T {
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? "null");
      return v ?? fallback;
    } catch {
      return fallback;
    }
  },
  write(key: string, v: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {}
  },
};
/** Only answered turns are kept: failed attempts are not worth restoring. */
const finished = (turns: Turn[]) => turns.filter((t) => t.done && (t.result || t.plan)).map((t) => ({ ...t, steps: [] }));
const newChatId = () => Math.random().toString(36).slice(2, 12);
function ConciergeInner() {
  const params = useSearchParams();
  const { center, toast, t: tr, lang } = useApp();
  const SUGGESTIONS = tr("c.suggestions").split("|");
  const REFINE = tr("c.refine").split("|");
  const pollParam = params.get("poll");
  const eventParam = params.get("event");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Grow the box with the text (up to max-h), shrink back when it is cleared.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);
  const busy = turns.some((t) => !t.done);
  const bottom = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const inFlight = useRef(false);
  const nextId = useRef(1);
  const { user } = useApp();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState<string>("");
  const restored = useRef(false);

  async function loadHistory() {
    const local = store.read<Chat[]>(HISTORY_KEY, []);
    if (!user) return setHistory(local);
    try {
      const r = await fetch("/api/chats").then((x) => x.json());
      const remote: Chat[] = (r.chats ?? []).map((c: Chat) => ({ ...c, remote: true }));
      const ids = new Set(remote.map((c) => c.id));
      setHistory([...remote, ...local.filter((c) => !ids.has(c.id))].filter((c) => c.id !== chatId));
    } catch {
      setHistory(local);
    }
  }

  // Restore the last conversation, or open one from ?chat= (unless we came with a new question or a vote link).
  useEffect(() => {
    const wanted = params.get("chat");
    const cur = store.read<{ id?: string; turns?: Turn[] } | Turn[]>(CURRENT_KEY, []);
    const current = Array.isArray(cur) ? { id: newChatId(), turns: cur } : { id: cur.id ?? newChatId(), turns: cur.turns ?? [] };
    if (wanted) {
      openChat({ id: wanted, title: "", at: 0, remote: true });
    } else if (!params.get("q") && !params.get("poll") && !params.get("event") && current.turns.length) {
      setTurns(finished(current.turns));
      setChatId(current.id);
      nextId.current = Math.max(0, ...current.turns.map((t) => t.id)) + 1;
    } else setChatId(newChatId());
    restored.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Persist locally on every change; sync to the account once a turn is answered.
  const done = finished(turns);
  const doneKey = done.map((t) => t.id).join(",");
  useEffect(() => {
    if (!restored.current || !chatId) return;
    store.write(CURRENT_KEY, { id: chatId, turns: done });
    if (user && done.length) {
      fetch(`/api/chats/${chatId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: done[0].prompt.slice(0, 120), turns: done }),
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneKey, chatId, user]);

  function archiveCurrent(): Chat[] {
    const d = finished(turns);
    if (!d.length) return history;
    const chat: Chat = { id: chatId, title: d[0].prompt.slice(0, 80), at: Date.now(), turns: d };
    const local = [chat, ...store.read<Chat[]>(HISTORY_KEY, []).filter((h) => h.id !== chatId)].slice(0, 20);
    store.write(HISTORY_KEY, local);
    const next = [chat, ...history.filter((h) => h.id !== chatId)];
    setHistory(next);
    return next;
  }

  function newChat() {
    if (busy) return;
    archiveCurrent();
    setTurns([]);
    setChatId(newChatId());
  }

  async function openChat(c: Chat) {
    if (busy) return;
    let turnsToOpen = c.turns;
    if (!turnsToOpen) {
      const local = store.read<Chat[]>(HISTORY_KEY, []).find((h) => h.id === c.id);
      turnsToOpen = local?.turns;
    }
    if (!turnsToOpen && user) {
      try {
        const r = await fetch(`/api/chats/${c.id}`).then((x) => x.json());
        turnsToOpen = r.chat?.turns;
      } catch {}
    }
    if (!turnsToOpen) return toast(lang === "uk" ? "Розмову не знайдено" : "Chat not found");
    if (restored.current) archiveCurrent();
    setTurns(turnsToOpen);
    setChatId(c.id);
    nextId.current = Math.max(0, ...turnsToOpen.map((t) => t.id)) + 1;
    setHistory((h) => h.filter((x) => x.id !== c.id));
    setHistoryOpen(false);
  }

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
        <div className="ml-auto flex gap-2">
          {history.length > 0 && (
            <button onClick={() => setHistoryOpen(true)} className="rounded-full bg-canvas px-3 py-1.5 text-[13px] font-semibold">
              {tr("c.history")}
            </button>
          )}
          {turns.length > 0 && (
            <button onClick={newChat} disabled={busy} className="rounded-full bg-canvas px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40">
              {tr("c.new")}
            </button>
          )}
        </div>
      </header>
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setHistoryOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="sheet-in max-h-[75vh] w-full max-w-[480px] overflow-y-auto rounded-t-[28px] bg-surface px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-3">
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line-strong" />
            <h2 className="display text-[24px]">{tr("c.history")}</h2>
            <ul className="mt-3">
              {history.map((c) => (
                <li key={c.id}>
                  <button onClick={() => openChat(c)} className="flex w-full items-center gap-3 border-b border-line py-3.5 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px]">{c.title}</span>
                      <span className="block text-[13px] text-muted">
                        {new Date(c.at).toLocaleString(lang === "uk" ? "uk-UA" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} ·{" "}
                        {tr("c.messages", { n: c.turns?.length ?? c.count ?? 0 })}
                      </span>
                    </span>
                    <span className="text-muted">→</span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              onClick={() => {
                store.write(HISTORY_KEY, []);
                if (user) history.filter((c) => c.remote).forEach((c) => fetch(`/api/chats/${c.id}`, { method: "DELETE" }).catch(() => {}));
                setHistory([]);
                setHistoryOpen(false);
              }}
              className="mt-4 text-[14px] font-medium text-danger"
            >
              {tr("c.clearHistory")}
            </button>
          </div>
        </div>
      )}

      {eventParam && turns.length === 0 ? (
        <section className="flex-1 pb-24 pt-6">
          <EventPanel eventId={eventParam} />
          <p className="mt-6 text-center text-[14px] text-muted">{tr("c.ownIdeas")}</p>
        </section>
      ) : pollParam && turns.length === 0 ? (
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
                        <Photo src={coverOf(p.place)} fallback={[...fallbackFor(p.place), p.place.photos[0]]} alt={p.place.name} className="aspect-[16/10] w-full" />
                        <span className="absolute left-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-white text-[13px] font-bold shadow-sm">{i + 1}</span>
                        <SaveButton placeId={p.place.id} className="absolute right-3 top-3" />
                        {p.place.photosIllustrative && <IllustrativeTag className="absolute bottom-3 left-3" />}
                      </div>
                      <div className="p-4">
                        <div className="text-[13px] font-semibold text-accent">{p.headline}</div>
                        <h3 className="display mt-1 text-[22px]">{p.place.name}</h3>
                        <Meta place={p.place} center={center} className="mt-1.5" />
                        <p className="mt-3 text-[15px] leading-relaxed text-text/85">{p.why}</p>
                        {p.tip && <p className="mt-3 flex gap-2 rounded-xl bg-canvas px-3 py-2 text-[14px] text-text/80"><Glyph name="tip" className="mt-0.5 h-4 w-4 shrink-0 text-accent" /><span>{p.tip}</span></p>}
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
                              sharePoll(pid, t.prompt.slice(0, 80), toast, lang);
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
        className="sticky bottom-[92px] z-30 mt-2 pb-2"
      >
        <div className="card flex items-end gap-2 !rounded-[26px] p-1.5 pl-4">
          {/* Placeholder as a one-line overlay: a native textarea placeholder wraps and gets cut off. */}
          <div className="relative min-w-0 flex-1">
            {!input && (
              <span aria-hidden className="pointer-events-none absolute inset-x-0 top-2.5 truncate text-[16px] text-muted">
                {turns.length ? tr("c.placeholderMore") : tr("c.placeholder")}
              </span>
            )}
            <textarea
              ref={inputRef}
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
              aria-label={turns.length ? tr("c.placeholderMore") : tr("c.placeholder")}
              className="block max-h-32 min-h-[44px] w-full resize-none bg-transparent py-2.5 text-[16px] outline-none"
            />
          </div>
          <VoiceButton disabled={busy} onText={setInput} onFinal={(t) => ask(t)} />
          <button disabled={busy || input.trim().length < 3} aria-label="Send" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition disabled:bg-surface-2 disabled:text-muted">
            <IconArrow />
          </button>
        </div>
      </form>
    </main>
  );
}

export function ConciergeClient() {
  return (
    <Suspense>
      <ConciergeInner />
    </Suspense>
  );
}

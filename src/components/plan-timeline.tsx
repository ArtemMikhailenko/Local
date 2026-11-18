"use client";

import Link from "next/link";
import type { ConciergeEvent } from "@/lib/concierge/agent";
import type { LatLng } from "@/lib/geo";
import { walkingRouteUrl } from "@/lib/route";
import { useApp } from "./app-provider";
import { IconRoute, IconShare, IconWalk } from "./icons";
import { Photo, fallbackFor } from "./place-bits";

type PlanEvent = Extract<ConciergeEvent, { t: "plan" }>;

const addMinutes = (hhmm: string, m: number) => {
  const total = (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) + m) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/** The evening as a simple timeline: time on the left, the stop on the right, walks in between. */
export function PlanTimeline({ plan, center }: { plan: PlanEvent; center: LatLng }) {
  const { toast, t } = useApp();
  const route = walkingRouteUrl(center, plan.stops.map((s) => s.place));
  const last = plan.stops[plan.stops.length - 1];

  async function share() {
    const text = [plan.intro, ...plan.stops.map((s) => `${s.time} ${s.what}: ${s.place.name}`), route ? `Route: ${route}` : ""].filter(Boolean).join("\n");
    try {
      if (navigator.share) await navigator.share({ title: "Our evening", text });
      else {
        await navigator.clipboard.writeText(text);
        toast(t("toast.copied"));
      }
    } catch {}
  }

  return (
    <div className="card rise p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="display text-[22px]">{t("plan.title")}</h3>
        <span className="text-[13px] font-medium text-muted">
          {plan.stops[0].time} – {addMinutes(last.time, last.duration_min)}
        </span>
      </div>
      <ol className="mt-4">
        {plan.stops.map((s, i) => (
          <li key={s.place_id} className="rise" style={{ animationDelay: `${i * 120}ms` }}>
            {i > 0 && (
              <div className="flex items-center gap-2 py-2 pl-[22px] text-[13px] text-muted">
                <span className="h-6 border-l-2 border-dotted border-line-strong" />
                <IconWalk className="h-3.5 w-3.5" />
                {s.walk_min <= 30 ? t("plan.walk", { n: s.walk_min }) : t("plan.ride", { n: Math.round((s.walk_min * 80) / 100) / 10 })}
              </div>
            )}
            <Link href={`/place/${s.place.id}`} className="flex gap-3 rounded-2xl transition hover:bg-canvas">
              <div className="w-[52px] shrink-0 pt-1 text-center">
                <div className="rounded-full bg-accent-soft py-1 text-[13px] font-bold text-accent">{s.time}</div>
              </div>
              <Photo src={s.place.photos[0]} fallback={fallbackFor(s.place)} alt="" className="h-16 w-16 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 pb-1">
                <div className="text-[12px] font-semibold text-accent">
                  {s.what} · {s.duration_min} min
                </div>
                <div className="display-soft truncate text-[16px]">{s.place.name}</div>
                <p className="mt-0.5 text-[13px] leading-snug text-muted">{s.why}</p>
              </div>
            </Link>
          </li>
        ))}
      </ol>
      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        {route && (
          <a href={route} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-accent-ink">
            <IconRoute />
            {t("plan.route")}
          </a>
        )}
        <button onClick={share} aria-label="Share plan" className="grid h-11 w-11 place-items-center rounded-full bg-surface-2">
          <IconShare className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

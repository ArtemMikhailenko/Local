"use client";

import Link from "next/link";
import type { ConciergeEvent } from "@/lib/concierge/agent";
import type { LatLng } from "@/lib/geo";
import { walkingRouteUrl } from "@/lib/route";
import { useApp } from "./app-provider";
import { IconRoute, IconShare, IconSparkle, IconWalk } from "./icons";
import { OpenBadge, Photo, Rating, SaveButton } from "./place-bits";

type PlanEvent = Extract<ConciergeEvent, { t: "plan" }>;

const addMinutes = (hhmm: string, m: number) => {
  const total = (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) + m) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/** The evening as a timeline: time, what, where, and the walk to the next stop. */
export function PlanTimeline({ plan, center }: { plan: PlanEvent; center: LatLng }) {
  const { toast } = useApp();
  const route = walkingRouteUrl(center, plan.stops.map((s) => s.place));
  const last = plan.stops[plan.stops.length - 1];

  async function share() {
    const text = [
      plan.intro,
      ...plan.stops.map((s) => `${s.time}  ${s.what} · ${s.place.name}`),
      route ? `Route: ${route}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      if (navigator.share) await navigator.share({ title: "Our evening", text });
      else {
        await navigator.clipboard.writeText(text);
        toast("Plan copied");
      }
    } catch {}
  }

  return (
    <div className="space-y-3">
      <p className="fade-up flex gap-2 text-[15px] leading-relaxed">
        <IconSparkle className="mt-1 h-4 w-4 shrink-0 text-ai" />
        {plan.intro}
      </p>
      <div className="fade-up rounded-[26px] border border-line bg-surface p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="font-display text-[26px] leading-none">Your evening</h3>
          <span className="text-[12px] text-muted">
            {plan.stops[0].time}–{addMinutes(last.time, last.duration_min)}
          </span>
        </div>
        <ol className="relative">
          {plan.stops.map((s, i) => (
            <li key={s.place_id} className="relative pl-14" style={{ animationDelay: `${i * 120}ms` }}>
              {i > 0 && (
                <div className="-ml-14 flex items-center gap-2 py-2 pl-[18px] text-[12px] text-muted">
                  <IconWalk />
                  {s.walk_min} min walk
                </div>
              )}
              <div className="absolute left-0 top-0 flex w-11 flex-col items-center" style={i > 0 ? { top: "34px" } : undefined}>
                <span className="rounded-full bg-accent px-2 py-0.5 text-[12px] font-semibold text-black">{s.time}</span>
                {i < plan.stops.length - 1 && <span className="mt-1 h-[120px] w-px bg-gradient-to-b from-accent/60 to-transparent" />}
              </div>
              <Link href={`/place/${s.place.id}`} className="fade-up flex gap-3 rounded-2xl bg-surface-2/60 p-2.5 transition active:scale-[0.99]">
                <Photo src={s.place.photos[0]} alt={s.place.name} className="h-16 w-16 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-ai">
                    {s.what} · {s.duration_min} min
                  </div>
                  <div className="truncate text-[15px] font-semibold">{s.place.name}</div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <Rating place={s.place} />
                    <OpenBadge open={s.place.openNow} />
                  </div>
                  <p className="mt-1 text-[13px] leading-snug text-text/80">{s.why}</p>
                </div>
                <SaveButton placeId={s.place.id} className="!h-8 !w-8 shrink-0 !bg-white/5" />
              </Link>
            </li>
          ))}
        </ol>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {route && (
          <a href={route} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-2xl bg-accent py-3 text-[14px] font-semibold text-black">
            <IconRoute />
            Open route
          </a>
        )}
        <button onClick={share} className="flex items-center justify-center gap-2 rounded-2xl bg-surface-2 py-3 text-[14px] font-medium">
          <IconShare className="h-4 w-4" />
          Share plan
        </button>
      </div>
    </div>
  );
}

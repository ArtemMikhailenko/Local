"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import type { Place } from "@/lib/places/types";
import { useApp } from "./app-provider";
import { Glyph } from "@/components/glyph";
import { IconShare } from "./icons";
import { Photo, fallbackFor } from "./place-bits";
import { createPoll, sharePoll } from "./vote-panel";

/** "Add to group vote" toggle, usable on any place. */
export function BasketButton({ place, className }: { place: Place; className?: string }) {
  const { basket, toggleBasket, t } = useApp();
  const on = basket.some((b) => b.id === place.id);
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleBasket(place);
      }}
      className={clsx("inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold transition", on ? "bg-accent-soft text-accent" : "bg-surface-2 text-text", className)}
    >
      <Glyph name={on ? "check" : "plus"} weight="bold" className="h-[18px] w-[18px]" />
      {on ? t("vote.added") : t("vote.add")}
    </button>
  );
}

/** Floating bar above the tab bar: the places collected for a vote, and a button to start it. */
export function VoteBasketBar() {
  const { basket, clearBasket, toast, t, lang } = useApp();
  const router = useRouter();
  const path = usePathname();
  const [busy, setBusy] = useState(false);
  if (!basket.length || path.startsWith("/concierge")) return null;

  async function start() {
    if (basket.length < 2) return toast(t("vote.needTwo"));
    setBusy(true);
    try {
      const title = t("vote.defaultTitle");
      const id = await createPoll(title, basket.map((b) => b.id));
      clearBasket();
      router.push(`/concierge?poll=${id}`);
      sharePoll(id, title, toast, lang);
    } catch {
      toast("Could not start the vote");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={clsx("rise fixed inset-x-0 z-40 mx-auto max-w-[480px] px-3", path.startsWith("/place/") ? "bottom-[max(env(safe-area-inset-bottom),12px)]" : "bottom-[96px]")}>
      <div className="card flex items-center gap-3 !rounded-full p-1.5 pl-2">
        <div className="flex -space-x-3">
          {basket.map((p: Place) => (
            <Photo key={p.id} src={p.photos[0]} fallback={fallbackFor(p)} alt={p.name} className="h-9 w-9 rounded-full ring-2 ring-white" />
          ))}
        </div>
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{t("vote.bar", { n: basket.length })}</span>
        <button onClick={clearBasket} aria-label="Clear" className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-canvas">
          <Glyph name="close" weight="bold" className="h-4 w-4" />
        </button>
        <button onClick={start} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-[14px] font-semibold text-accent-ink disabled:opacity-60">
          <IconShare className="h-4 w-4" />
          {t("vote.start")}
        </button>
      </div>
    </div>
  );
}

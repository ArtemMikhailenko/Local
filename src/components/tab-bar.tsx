"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Mascot } from "./mascot";
import { IconBookmark, IconCompass, IconSearch } from "./icons";
import { useApp } from "./app-provider";

const SIDE = [
  { href: "/", key: "tab.discover", Icon: IconCompass },
  { href: "/search", key: "tab.search", Icon: IconSearch },
  { href: "/concierge", key: "tab.concierge", Icon: null },
  { href: "/saved", key: "tab.saved", Icon: IconBookmark },
] as const;

export function TabBar() {
  const path = usePathname();
  const { t } = useApp();
  if (path.startsWith("/place/")) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-line bg-white/95 pb-[max(env(safe-area-inset-bottom),6px)] backdrop-blur-md sm:border-x">
      <div className="grid grid-cols-4">
        {SIDE.map(({ href, key, Icon }) => {
          const label = t(key);
          const active = href === "/" ? path === "/" : path.startsWith(href);
          if (!Icon)
            return (
              <Link key={href} href={href} aria-label="Concierge" className="flex flex-col items-center gap-1 pb-1">
                <span className="relative -mt-5 grid h-14 w-14 place-items-center">
                  {!active && <span className="halo absolute inset-0 rounded-full bg-accent/30" />}
                  <span className="relative grid h-14 w-14 place-items-center rounded-full bg-white shadow-[0_6px_18px_rgba(242,84,61,0.35)] ring-4 ring-white transition active:scale-95">
                    <Mascot className="h-14 w-14" mood={active ? "happy" : "idle"} />
                  </span>
                </span>
                <span className={clsx("text-[11px]", active ? "font-semibold text-accent" : "font-medium text-muted")}>{label}</span>
              </Link>
            );
          return (
            <Link key={href} href={href} className={clsx("flex flex-col items-center gap-1 pb-1 pt-2.5 transition", active ? "text-accent" : "text-muted hover:text-text")}>
              <Icon className="h-6 w-6" filled={active && key === "tab.saved"} />
              <span className={clsx("text-[11px]", active ? "font-semibold" : "font-medium")}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

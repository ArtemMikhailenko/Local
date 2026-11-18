"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { IconCompass, IconHeart, IconSearch } from "./icons";

const TABS = [
  { href: "/", label: "Discover", Icon: IconCompass },
  { href: "/search", label: "Search", Icon: IconSearch },
  { href: "/concierge", label: "Concierge", Icon: null },
  { href: "/saved", label: "Saved", Icon: IconHeart },
];

export function TabBar() {
  const path = usePathname();
  if (path.startsWith("/place/")) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] px-4 pb-[max(env(safe-area-inset-bottom),14px)]">
      <div className="glass flex items-center justify-around rounded-[28px] px-2 py-2 shadow-2xl shadow-black/50">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          if (!Icon)
            return (
              <Link key={href} href={href} aria-label={label} className="group -mt-8 flex flex-col items-center gap-1">
                <span className={clsx("orb grid h-14 w-14 place-items-center rounded-full ring-4 ring-bg transition-transform group-active:scale-95", active && "orb-spin")}>
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-bg/80 font-display text-xl italic">L</span>
                </span>
                <span className={clsx("text-[10px] font-medium", active ? "text-ai" : "text-muted")}>{label}</span>
              </Link>
            );
          return (
            <Link key={href} href={href} className={clsx("flex w-16 flex-col items-center gap-1 py-1 transition-colors", active ? "text-text" : "text-muted hover:text-text")}>
              <Icon className="h-[22px] w-[22px]" filled={active && label === "Saved"} />
              <span className="text-[10px] font-medium">{label}</span>
              <span className={clsx("h-1 w-1 rounded-full transition-opacity", active ? "bg-accent opacity-100" : "opacity-0")} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Mascot } from "./mascot";
import { IconBookmark, IconCompass, IconSearch } from "./icons";
import { useApp } from "./app-provider";

const TABS = [
  { href: "/", key: "tab.discover", Icon: IconCompass },
  { href: "/search", key: "tab.search", Icon: IconSearch },
  { href: "/saved", key: "tab.saved", Icon: IconBookmark },
] as const;

/** Collapses to icons while scrolling down, expands again on scroll up (like iOS 26 tab bars). */
function useCompactOnScroll() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 8) return;
      setCompact(y > last && y > 120);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return compact;
}

/**
 * Floating capsule with three tabs and a separate round "island" for Lumi, the primary action.
 * The coral pill slides to the active tab.
 */
export function TabBar() {
  const path = usePathname();
  const { t, basket } = useApp();
  const compact = useCompactOnScroll();
  if (path.startsWith("/place/")) return null;

  const activeIndex = TABS.findIndex(({ href }) => (href === "/" ? path === "/" : path.startsWith(href)));
  const onConcierge = path.startsWith("/concierge");

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-[480px] items-end justify-between gap-3 px-4 pb-[max(env(safe-area-inset-bottom),14px)]"
      aria-label="Main"
    >
      <div className={clsx("tabbar-glass pointer-events-auto relative grid grid-cols-3 rounded-full p-1.5 transition-all duration-300", compact ? "w-[168px]" : "w-full max-w-[300px]")}>
        {activeIndex >= 0 && (
          <span
            aria-hidden
            className="absolute inset-y-1.5 left-1.5 rounded-full bg-accent-soft transition-transform duration-300 ease-[cubic-bezier(0.3,1.3,0.5,1)]"
            style={{ width: "calc((100% - 12px) / 3)", transform: `translateX(${activeIndex * 100}%)` }}
          />
        )}
        {TABS.map(({ href, key, Icon }, i) => {
          const active = i === activeIndex;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={clsx("relative z-10 flex flex-col items-center justify-center gap-0.5 rounded-full py-1.5 transition-colors", active ? "text-accent" : "text-text/70 hover:text-text")}
            >
              <span className="relative">
                <Icon className="h-[23px] w-[23px]" filled={active && key === "tab.saved"} />
                {key === "tab.saved" && basket.length > 0 && <span className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-accent" />}
              </span>
              <span className={clsx("overflow-hidden text-[11px] font-semibold transition-all duration-300", compact ? "h-0 opacity-0" : "h-4 opacity-100")}>{t(key)}</span>
            </Link>
          );
        })}
      </div>

      <Link
        href="/concierge"
        aria-label={t("tab.concierge")}
        aria-current={onConcierge ? "page" : undefined}
        className={clsx(
          "tabbar-glass pointer-events-auto relative grid shrink-0 place-items-center rounded-full transition-all duration-300 active:scale-95",
          compact ? "h-14 w-14" : "h-[62px] w-[62px]",
          onConcierge && "ring-2 ring-accent",
        )}
      >
        {!onConcierge && <span className="halo absolute inset-0 rounded-full bg-accent/25" />}
        <Mascot className={compact ? "h-12 w-12" : "h-[54px] w-[54px]"} mood={onConcierge ? "happy" : "idle"} />
      </Link>
    </nav>
  );
}

import {
  Bank,
  CalendarCheck,
  CalendarDots,
  CalendarPlus,
  Check,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Coffee,
  Egg,
  ForkKnife,
  GlobeHemisphereWest,
  Lightbulb,
  Martini,
  Moon,
  Plus,
  Sun,
  Wine,
  X,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";

/** Phosphor icons (duotone) instead of emoji: same look on every phone, and they take the accent colour. */
const ICONS = {
  coffee: Coffee,
  brunch: Egg,
  dinner: ForkKnife,
  bars: Martini,
  wine: Wine,
  culture: Bank,
  sun: Sun,
  moon: Moon,
  "cloud-sun": CloudSun,
  "cloud-moon": CloudMoon,
  cloud: Cloud,
  fog: CloudFog,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
  event: CalendarDots,
  "event-add": CalendarPlus,
  "event-check": CalendarCheck,
  public: GlobeHemisphereWest,
  check: Check,
  close: X,
  plus: Plus,
  tip: Lightbulb,
} satisfies Record<string, Icon>;

export type GlyphName = keyof typeof ICONS;

export function Glyph({ name, className = "h-[1.15em] w-[1.15em]", weight = "duotone" }: { name: GlyphName | string; className?: string; weight?: "duotone" | "bold" | "fill" | "regular" }) {
  const I = ICONS[name as GlyphName];
  if (!I) return null;
  return <I className={className} weight={weight} aria-hidden />;
}

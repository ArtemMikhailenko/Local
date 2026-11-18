"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Map as MlMap, Marker } from "maplibre-gl";
import { distanceMeters, type LatLng } from "@/lib/geo";
import type { Place } from "@/lib/places/types";
import type { PublicEvent } from "@/lib/client/api";
import { useApp } from "./app-provider";

// Free vector tiles, no key: https://openfreemap.org
const STYLE = "https://tiles.openfreemap.org/styles/positron";

type Ml = typeof import("maplibre-gl");
// maplibre-gl v5 ships CJS/UMD; normalise default vs namespace interop.
const loadMaplibre = () => import("maplibre-gl").then((m) => ((m as unknown as { default?: Ml }).default ?? m) as Ml);

const short = (s: string) => (s.length > 18 ? `${s.slice(0, 17)}…` : s);

/**
 * Map with labelled pins (dot + venue name). When `onAreaChange` is given, panning the map
 * reports the new centre so the page can load venues for that area; the map stops auto-fitting
 * as soon as the user moves it, so it never jumps back.
 */
export function MapView({
  places,
  center,
  className,
  activeId,
  zoom = 14,
  onAreaChange,
  loading,
  onSelect,
  keepView,
  events = [],
  onSelectEvent,
}: {
  places: Place[];
  /** Public events: drawn as dark "date" pins above the venue pins. */
  events?: PublicEvent[];
  onSelectEvent?: (id: string) => void;
  center: LatLng;
  className?: string;
  activeId?: string;
  zoom?: number;
  onAreaChange?: (c: LatLng) => void;
  loading?: boolean;
  /** Tap on a pin selects it instead of opening the place page. */
  onSelect?: (id: string) => void;
  /** Never auto-fit to markers (the explorer keeps the user's view). */
  keepView?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const ready = useRef(false);
  const userMoved = useRef(false);
  const lastReported = useRef<LatLng>(center);
  const router = useRouter();
  const { t, lang } = useApp();
  const [hint, setHint] = useState(false);
  // Refs so map callbacks always see the latest props, not the first render's.
  const latest = useRef({ places, activeId, onAreaChange, onSelect, events, onSelectEvent, lang });
  latest.current = { places, activeId, onAreaChange, onSelect, events, onSelectEvent, lang };

  useEffect(() => {
    let cancelled = false;
    loadMaplibre().then((maplibregl) => {
      if (cancelled || !el.current || map.current) return;
      const m = new maplibregl.Map({
        container: el.current,
        style: STYLE,
        center: [center.lng, center.lat],
        zoom,
        attributionControl: { compact: true },
        dragRotate: false,
      });
      const me = document.createElement("div");
      me.className = "h-4 w-4 rounded-full border-[3px] border-white bg-[#2f6bff] shadow-[0_0_0_7px_rgba(47,107,255,0.2)]";
      new maplibregl.Marker({ element: me }).setLngLat([center.lng, center.lat]).addTo(m);
      map.current = m;

      m.on("dragstart", () => (userMoved.current = true));
      m.on("zoomstart", (e) => {
        if ((e as { originalEvent?: unknown }).originalEvent) userMoved.current = true;
      });
      m.on("moveend", () => {
        if (!userMoved.current || !latest.current.onAreaChange) return;
        const c = m.getCenter();
        const next = { lat: c.lat, lng: c.lng };
        // Only reload when the view moved meaningfully (~350 m).
        if (distanceMeters(next, lastReported.current) < 350) return;
        lastReported.current = next;
        latest.current.onAreaChange(next);
      });
      m.once("load", () => {
        ready.current = true;
        drawMarkers(maplibregl);
        if (onAreaChange) {
          setHint(true);
          setTimeout(() => setHint(false), 3500);
        }
      });
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      ready.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng]);

  function drawMarkers(maplibregl: Ml) {
    const m = map.current;
    if (!m) return;
    const { places, activeId } = latest.current;
    markers.current.forEach((x) => x.remove());
    markers.current = places.map((p) => {
      const active = p.id === activeId || places.length === 1;
      const pin = document.createElement("button");
      pin.setAttribute("aria-label", p.name);
      pin.className = "group flex items-center gap-1.5";
      // Dot + name label, like a station on a transit map.
      const dot = document.createElement("span");
      dot.className = `block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white shadow ${active ? "bg-[#1c1b1a]" : "bg-[#f2543d]"}`;
      const label = document.createElement("span");
      label.className = `rounded-full px-2 py-0.5 text-[11px] font-semibold leading-tight shadow-md transition group-hover:bg-[#f2543d] group-hover:text-white ${active ? "bg-[#1c1b1a] text-white" : "bg-white text-[#1c1b1a]"}`;
      label.textContent = short(p.name);
      pin.append(dot, label);
      pin.onclick = () => (latest.current.onSelect ? latest.current.onSelect(p.id) : router.push(`/place/${p.id}`));
      return new maplibregl.Marker({ element: pin, anchor: "left", offset: [-6, 0] }).setLngLat([p.location.lng, p.location.lat]).addTo(m);
    });
    const { events, onSelectEvent, lang } = latest.current;
    const fmt = (iso: string) => {
      const d = new Date(iso);
      const loc = lang === "uk" ? "uk-UA" : "en-GB";
      const today = new Date().toDateString() === d.toDateString();
      const time = d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
      return today ? time : `${d.toLocaleDateString(loc, { weekday: "short" })} ${time}`;
    };
    for (const e of events) {
      const pin = document.createElement("button");
      pin.setAttribute("aria-label", e.title);
      const active = e.id === activeId;
      pin.className = `flex items-center gap-1 rounded-2xl rounded-bl-sm px-2.5 py-1 text-left text-[11px] font-semibold leading-tight text-white shadow-lg ${active ? "bg-[#f2543d]" : "bg-[#1c1b1a]"}`;
      pin.innerHTML = "";
      const when = document.createElement("span");
      when.className = "rounded-full bg-white/20 px-1.5 py-px";
      when.textContent = `🗓 ${fmt(e.startsAt)}`;
      const title = document.createElement("span");
      title.textContent = short(e.title);
      pin.append(when, title);
      pin.onclick = () => (onSelectEvent ? onSelectEvent(e.id) : router.push(`/concierge?event=${e.id}`));
      markers.current.push(new maplibregl.Marker({ element: pin, anchor: "bottom-left", offset: [0, -10] }).setLngLat([e.place.location.lng, e.place.location.lat]).addTo(m));
    }
    // Selected event off screen: glide to it.
    const sel = events.find((e) => e.id === activeId);
    if (sel && !m.getBounds().contains([sel.place.location.lng, sel.place.location.lat])) {
      m.easeTo({ center: [sel.place.location.lng, sel.place.location.lat], duration: 600 });
    }
    if (places.length >= 1 && !activeId && !userMoved.current && !keepView) {
      const b = new maplibregl.LngLatBounds();
      places.forEach((p) => b.extend([p.location.lng, p.location.lat]));
      b.extend([center.lng, center.lat]);
      m.fitBounds(b, { padding: { top: 40, bottom: 40, left: 30, right: 110 }, maxZoom: 15.5, duration: 600 });
    }
  }

  useEffect(() => {
    if (!ready.current) return;
    loadMaplibre().then((maplibregl) => drawMarkers(maplibregl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, activeId, events]);

  return (
    <div className="relative">
      <div ref={el} className={className} />
      {(loading || hint) && (
        <span className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-[12px] font-medium text-[#1c1b1a] shadow-md">
          {loading ? t("map.loading") : t("map.hint")}
        </span>
      )}
    </div>
  );
}

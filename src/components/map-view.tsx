"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Map as MlMap, Marker } from "maplibre-gl";
import { distanceMeters, type LatLng } from "@/lib/geo";
import type { Place } from "@/lib/places/types";
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
}: {
  places: Place[];
  center: LatLng;
  className?: string;
  activeId?: string;
  zoom?: number;
  onAreaChange?: (c: LatLng) => void;
  loading?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const ready = useRef(false);
  const userMoved = useRef(false);
  const lastReported = useRef<LatLng>(center);
  const router = useRouter();
  const { t } = useApp();
  const [hint, setHint] = useState(false);
  // Refs so map callbacks always see the latest props, not the first render's.
  const latest = useRef({ places, activeId, onAreaChange });
  latest.current = { places, activeId, onAreaChange };

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
      pin.onclick = () => router.push(`/place/${p.id}`);
      return new maplibregl.Marker({ element: pin, anchor: "left", offset: [-6, 0] }).setLngLat([p.location.lng, p.location.lat]).addTo(m);
    });
    if (places.length >= 1 && !activeId && !userMoved.current) {
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
  }, [places, activeId]);

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

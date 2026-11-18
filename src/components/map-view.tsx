"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Map as MlMap, Marker } from "maplibre-gl";
import type { LatLng } from "@/lib/geo";
import type { Place } from "@/lib/places/types";

// Free vector tiles, no key: https://openfreemap.org
const STYLE = "https://tiles.openfreemap.org/styles/dark";

type Ml = typeof import("maplibre-gl");
// maplibre-gl v5 ships CJS/UMD; normalise default vs namespace interop.
const loadMaplibre = () => import("maplibre-gl").then((m) => ((m as unknown as { default?: Ml }).default ?? m) as Ml);

export function MapView({ places, center, className, activeId, zoom = 14 }: { places: Place[]; center: LatLng; className?: string; activeId?: string; zoom?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const ready = useRef(false);
  const router = useRouter();
  // Refs so the map "load" callback always draws the latest props, not the first render's.
  const latest = useRef({ places, activeId });
  latest.current = { places, activeId };

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
      me.className = "h-4 w-4 rounded-full border-[3px] border-white bg-ai shadow-[0_0_0_8px_rgba(182,164,255,0.25)]";
      new maplibregl.Marker({ element: me }).setLngLat([center.lng, center.lat]).addTo(m);
      map.current = m;
      m.once("load", () => {
        ready.current = true;
        drawMarkers(maplibregl);
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
      const pin = document.createElement("button");
      const active = p.id === activeId;
      pin.className = `rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-lg transition hover:scale-110 ${active ? "bg-accent text-black" : "bg-[#1c1c25] text-white border border-white/10"}`;
      pin.textContent = p.rating ? `★ ${p.rating.toFixed(1)}` : p.name.slice(0, 12);
      pin.setAttribute("aria-label", p.name);
      pin.onclick = () => router.push(`/place/${p.id}`);
      return new maplibregl.Marker({ element: pin }).setLngLat([p.location.lng, p.location.lat]).addTo(m);
    });
    if (places.length >= 1 && !activeId) {
      const b = new maplibregl.LngLatBounds();
      places.forEach((p) => b.extend([p.location.lng, p.location.lat]));
      b.extend([center.lng, center.lat]);
      m.fitBounds(b, { padding: 48, maxZoom: 15, duration: 600 });
    }
  }

  useEffect(() => {
    if (!ready.current) return;
    loadMaplibre().then((maplibregl) => drawMarkers(maplibregl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, activeId]);

  return <div ref={el} className={className} />;
}

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError, type SavedRow, type User } from "@/lib/client/api";
import { DEFAULT_CENTER, distanceMeters, type LatLng } from "@/lib/geo";
import { detectLang, translator, type Lang, type T } from "@/lib/i18n";

type Ctx = {
  user: User | null;
  ready: boolean;
  mode: "google" | "osm" | "demo";
  center: LatLng;
  locationLabel: string;
  saved: SavedRow[];
  savedIds: Set<string>;
  authOpen: boolean;
  openAuth: () => void;
  closeAuth: () => void;
  setUser: (u: User | null) => void;
  toggleSave: (placeId: string) => Promise<void>;
  refreshSaved: () => Promise<void>;
  toast: (msg: string) => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: T;
};

const AppContext = createContext<Ctx | null>(null);
export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside AppProvider");
  return ctx;
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"google" | "osm" | "demo">("osm");
  const [center, setCenter] = useState<LatLng>(DEFAULT_CENTER);
  const [nearMe, setNearMe] = useState(false);
  const [lang, setLangState] = useState<Lang>("en");
  const t = useMemo(() => translator(lang), [lang]);
  const locationLabel = nearMe ? (lang === "uk" ? "Поруч з тобою" : "Near you") : lang === "uk" ? "Поділ, Київ" : "Podil, Kyiv";

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("locali:lang");
    } catch {}
    setLangState(detectLang(stored, navigator.language));
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("locali:lang", l);
    } catch {}
  }, []);
  const [saved, setSaved] = useState<SavedRow[]>([]);
  const [authOpen, setAuthOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg((m) => (m === msg ? null : m)), 2200);
  }, []);

  useEffect(() => {
    api
      .me()
      .then((r) => {
        setUser(r.user);
        setMode(r.mode);
        // Demo data lives in Kyiv; with real data we use the guest's actual location.
        if (r.mode !== "demo" && "geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              setCenter(here);
              setNearMe(distanceMeters(here, DEFAULT_CENTER) >= 2000);
            },
            () => {},
            { timeout: 6000, maximumAge: 300_000 },
          );
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const refreshSaved = useCallback(async () => {
    if (!user) return setSaved([]);
    const r = await api.saved().catch(() => ({ saved: [] }));
    setSaved(r.saved);
  }, [user]);

  useEffect(() => {
    refreshSaved();
  }, [refreshSaved]);

  const savedIds = useMemo(() => new Set(saved.map((s) => s.place.id)), [saved]);

  const toggleSave = useCallback(
    async (placeId: string) => {
      if (!user) return setAuthOpen(true);
      try {
        if (savedIds.has(placeId)) {
          setSaved((s) => s.filter((r) => r.place.id !== placeId)); // optimistic
          await api.unsave(placeId);
        } else {
          await api.save(placeId);
          toast(t("toast.saved"));
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setUser(null); // session expired
          setAuthOpen(true);
        }
      }
      await refreshSaved();
    },
    [user, savedIds, refreshSaved, toast, t],
  );

  const value: Ctx = {
    user,
    ready,
    mode,
    center,
    locationLabel,
    saved,
    savedIds,
    authOpen,
    openAuth: () => setAuthOpen(true),
    closeAuth: () => setAuthOpen(false),
    setUser,
    toggleSave,
    refreshSaved,
    toast,
    lang,
    setLang,
    t,
  };
  return (
    <AppContext.Provider value={value}>
      {children}
      {toastMsg && (
        <div role="status" className="rise pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),16px)] z-[60] mx-auto w-fit rounded-full bg-text px-4 py-2 text-sm font-medium text-white shadow-xl">
          {toastMsg}
        </div>
      )}
    </AppContext.Provider>
  );
}

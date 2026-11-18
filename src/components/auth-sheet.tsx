"use client";

import { useState } from "react";
import clsx from "clsx";
import { api, ApiError } from "@/lib/client/api";
import { useApp } from "./app-provider";

export function AuthSheet() {
  const { authOpen, closeAuth, setUser } = useApp();
  const [tab, setTab] = useState<"login" | "signup">("signup");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!authOpen) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = tab === "login" ? await api.login(form.email, form.password) : await api.signup(form.name, form.email, form.password);
      setUser(r.user);
      closeAuth();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-2xl border border-line bg-surface-2 px-4 py-3.5 text-[15px] outline-none transition placeholder:text-muted/70 focus:border-accent/60";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={closeAuth}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="sheet-in w-full max-w-[480px] rounded-t-[32px] border-t border-line bg-surface px-6 pb-[max(env(safe-area-inset-bottom),24px)] pt-3"
      >
        <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-white/15" />
        <h2 className="font-display text-[34px] leading-none">{tab === "signup" ? "Make it yours" : "Welcome back"}</h2>
        <p className="mt-2 text-sm text-muted">Save places and let the concierge learn your taste. Your list is private to your account.</p>
        <div className="mt-5 grid grid-cols-2 rounded-2xl bg-surface-2 p-1 text-sm">
          {(["signup", "login"] as const).map((t) => (
            <button type="button" key={t} onClick={() => setTab(t)} className={clsx("rounded-xl py-2.5 font-medium transition", tab === t ? "bg-white/10 text-text" : "text-muted")}>
              {t === "signup" ? "Create account" : "Sign in"}
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-3">
          {tab === "signup" && <input className={field} placeholder="Your name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />}
          <input className={field} type="email" placeholder="Email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input
            className={field}
            type="password"
            placeholder={tab === "signup" ? "Password, 8+ characters" : "Password"}
            autoComplete={tab === "signup" ? "new-password" : "current-password"}
            minLength={tab === "signup" ? 8 : 1}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </div>
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        <button disabled={busy} className="mt-5 w-full rounded-2xl bg-accent py-4 font-semibold text-black transition active:scale-[0.99] disabled:opacity-60">
          {busy ? "One moment…" : tab === "signup" ? "Create account" : "Sign in"}
        </button>
        <button type="button" onClick={closeAuth} className="mt-2 w-full py-3 text-sm text-muted">
          Not now
        </button>
      </form>
    </div>
  );
}

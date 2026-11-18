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

  const field = "mt-3 w-full rounded-xl border border-line bg-canvas px-4 py-3.5 text-[16px] outline-none transition placeholder:text-muted focus:border-accent";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={closeAuth}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="sheet-in w-full max-w-[480px] rounded-t-[28px] bg-surface px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-5"
      >
        <div className="flex justify-between text-[14px] text-muted">
          <span>Account</span>
          <button type="button" onClick={closeAuth} className="hover:text-text">
            Close ✕
          </button>
        </div>
        <h2 className="display mt-4 text-[30px]">{tab === "signup" ? "Keep your places." : "Welcome back."}</h2>
        <p className="mt-2 text-[14px] text-muted">Saved places and notes are private to your account. The concierge uses them to learn your taste.</p>
        <div className="mt-5 flex gap-5 border-b border-line">
          {(["signup", "login"] as const).map((t) => (
            <button type="button" key={t} onClick={() => setTab(t)} className={clsx("relative pb-2.5 text-[15px] font-medium", tab === t ? "text-text" : "text-muted")}>
              {t === "signup" ? "Create account" : "Sign in"}
              {tab === t && <span className="absolute inset-x-0 -bottom-px h-[2px] bg-accent" />}
            </button>
          ))}
        </div>
        <div className="mt-2">
          {tab === "signup" && <input className={field} placeholder="Name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />}
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
        {error && <p className="mt-3 text-[14px] text-danger">{error}</p>}
        <button disabled={busy} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[16px] font-semibold text-accent-ink disabled:opacity-60">
          {busy ? "One moment" : tab === "signup" ? "Create account" : "Sign in"}
          <span>→</span>
        </button>
      </form>
    </div>
  );
}

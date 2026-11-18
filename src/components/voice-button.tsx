"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

/* Minimal typing for the Web Speech API (not in the default TS DOM lib). */
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
};
type RecognitionCtor = new () => Recognition;

/**
 * Speak instead of type. Uses the browser's built-in speech recognition (Chrome, Edge, Safari);
 * the button hides itself where it is not supported. Shows live text while you speak.
 */
export function VoiceButton({ onText, onFinal, disabled }: { onText: (t: string) => void; onFinal: (t: string) => void; disabled?: boolean }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    setSupported(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition));
    return () => rec.current?.stop();
  }, []);

  if (!supported) return null;

  function toggle() {
    if (listening) return rec.current?.stop();
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition)!;
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.interimResults = true;
    r.continuous = false;
    let text = "";
    r.onresult = (e) => {
      text = Array.from(e.results)
        .map((res) => res[0]?.transcript ?? "")
        .join("");
      onText(text);
    };
    r.onend = () => {
      setListening(false);
      if (text.trim().length >= 3) onFinal(text.trim());
    };
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-label={listening ? "Stop listening" : "Speak your request"}
      className={clsx(
        "relative grid h-11 w-11 shrink-0 place-items-center rounded-full transition disabled:opacity-40",
        listening ? "bg-red-500 text-white" : "bg-white/10 text-text hover:bg-white/15",
      )}
    >
      {listening && <span className="absolute inset-0 animate-ping rounded-full bg-red-500/50" />}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="relative h-5 w-5">
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
      </svg>
    </button>
  );
}

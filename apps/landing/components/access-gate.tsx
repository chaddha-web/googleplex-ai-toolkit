"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const PIN = "100610";
const STORAGE_KEY = "googolplex.access.granted";

/**
 * Site-wide translucent access gate. Visitors must enter a 6-digit PIN before
 * the rest of the page becomes visible. Access is persisted in localStorage so
 * the gate only appears on the first visit (until storage is cleared).
 *
 * NOTE: this is a soft, client-side gate — the page source is still publicly
 * downloadable. Do not rely on it for any kind of real authentication.
 */
export function AccessGate() {
  // Start as "granted" on first render to avoid an SSR/CSR flash; the effect
  // below flips it to false if the visitor doesn't have the stored flag.
  const [granted, setGranted] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(0);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    setMounted(true);
    try {
      const ok =
        typeof window !== "undefined" &&
        window.localStorage.getItem(STORAGE_KEY) === "1";
      setGranted(ok);
      if (!ok) {
        // focus first cell shortly after the overlay paints
        setTimeout(() => inputsRef.current[0]?.focus(), 150);
      }
    } catch {
      // localStorage blocked (private mode, etc.) — keep gate up but tolerate
      setGranted(false);
    }
  }, []);

  // Lock body scroll while the gate is visible.
  // We deliberately force "" instead of restoring a captured prev value —
  // when multiple components do this dance (here + LandingShell preloader)
  // their cleanups race and one can save "hidden" as "prev", restoring it
  // even after both should be unlocked.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = granted ? "" : "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [granted]);

  const setCell = (idx: number, val: string) => {
    const clean = val.replace(/\D/g, "").slice(-1); // last typed digit
    const next = [...digits];
    next[idx] = clean;
    setDigits(next);
    setError(false);
    if (clean && idx < 5) inputsRef.current[idx + 1]?.focus();
    if (next.every((d) => d !== "")) trySubmit(next.join(""));
  };

  const onKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    } else if (e.key === "ArrowLeft" && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    } else if (e.key === "ArrowRight" && idx < 5) {
      inputsRef.current[idx + 1]?.focus();
    } else if (e.key === "Enter") {
      trySubmit(digits.join(""));
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < text.length; i++) next[i] = text[i]!;
    setDigits(next);
    if (text.length === 6) trySubmit(text);
    else inputsRef.current[text.length]?.focus();
  };

  const trySubmit = (code: string) => {
    if (code.length !== 6) return;
    if (code === PIN) {
      try {
        window.localStorage.setItem(STORAGE_KEY, "1");
      } catch {
        /* ignore */
      }
      setGranted(true);
    } else {
      setError(true);
      setShake((s) => s + 1);
      setDigits(["", "", "", "", "", ""]);
      setTimeout(() => inputsRef.current[0]?.focus(), 50);
    }
  };

  // Don't render anything until we've checked storage — keeps SSR HTML clean.
  if (!mounted) return null;

  return (
    <AnimatePresence>
      {!granted && (
        <motion.div
          key="access-gate"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center px-6"
          style={{
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(18px) saturate(140%)",
            WebkitBackdropFilter: "blur(18px) saturate(140%)"
          }}
        >
          <motion.div
            key={shake}
            initial={{ x: 0 }}
            animate={
              error
                ? { x: [-10, 10, -8, 8, -4, 4, 0] }
                : { x: 0 }
            }
            transition={{ duration: 0.45 }}
            className="liquid-glass w-full max-w-md rounded-3xl px-8 py-10 text-center"
          >
            <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase mb-4">
              Restricted area
            </p>
            <h2 className="font-serif text-white text-4xl md:text-5xl tracking-tight">
              Access <span className="font-serif-i text-white/60">restricted</span>
            </h2>
            <p className="text-white/60 text-sm leading-relaxed mt-4 max-w-xs mx-auto">
              This preview is private. Enter the 6-digit access PIN to continue.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                trySubmit(digits.join(""));
              }}
              className="mt-8"
            >
              <div className="flex items-center justify-center gap-2 sm:gap-3">
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      inputsRef.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    value={d}
                    onChange={(e) => setCell(i, e.target.value)}
                    onKeyDown={(e) => onKeyDown(i, e)}
                    onPaste={onPaste}
                    aria-label={`Digit ${i + 1}`}
                    className={`w-10 h-12 sm:w-11 sm:h-14 text-center text-xl sm:text-2xl font-medium rounded-xl bg-white/5 text-white caret-white/80 transition-all focus:outline-none focus:ring-2 ${
                      error
                        ? "ring-2 ring-red-400/70 bg-red-500/10"
                        : "ring-1 ring-white/15 focus:ring-white/60"
                    }`}
                  />
                ))}
              </div>

              <div className="min-h-[1.25rem] mt-4">
                {error && (
                  <p className="text-red-300/90 text-xs tracking-wide">
                    Incorrect PIN. Please try again.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={digits.some((d) => d === "")}
                className="mt-2 w-full h-12 rounded-full bg-white text-black text-sm font-semibold hover:bg-white/90 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Unlock
              </button>
            </form>

            <p className="text-white/30 text-[10px] mt-6 tracking-widest uppercase">
              Googolplex · Private Preview
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

"use client";

/**
 * The moment the $1 clears: mint the member's 10B GoogolPlex Seva Credit and
 * play it out — a count-up from zero, then the total settling into place.
 *
 * Sits at the end of the activation flow rather than on the dashboard, so the
 * payment and what it earned are one continuous beat instead of two unrelated
 * screens.
 *
 * The mint itself is idempotent server-side, so a reload replays the animation
 * without ever issuing twice.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { generateSevaCredits } from "@/lib/auth-client";

const TARGET = 10_000_000_000;
const COUNT_MS = 2600;

type Phase = "minting" | "counting" | "done" | "failed";

export function SevaReveal({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("minting");
  const [shown, setShown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rafRef = useRef(0);
  const startedRef = useRef(false);

  const run = useCallback(async () => {
    setError(null);
    setPhase("minting");
    let total = TARGET;
    try {
      const r = await generateSevaCredits();
      if (typeof r.sevaCredit === "number" && r.sevaCredit > 0) total = r.sevaCredit;
    } catch (e) {
      setPhase("failed");
      setError((e as Error).message);
      return;
    }

    setPhase("counting");
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      // Cubic ease-out: fast at first, settling into the final number.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.floor(eased * total));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setShown(total);
        setPhase("done");
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    // StrictMode double-invokes effects in dev; the mint is idempotent but the
    // animation shouldn't restart under itself.
    if (startedRef.current) return;
    startedRef.current = true;
    void run();
    return () => cancelAnimationFrame(rafRef.current);
  }, [run]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="relative"
    >
      {/* Warm glow that blooms as the number lands. */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: phase === "done" ? 1 : 0.45, scale: phase === "done" ? 1 : 0.9 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        className="pointer-events-none absolute -inset-x-10 -top-16 h-64 bg-[radial-gradient(ellipse_at_center,_rgba(252,211,77,0.16)_0%,_transparent_70%)]"
      />

      <div className="relative">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-emerald-300/90 text-xs tracking-[0.3em] uppercase"
        >
          Payment received
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="font-serif text-white tracking-tight text-4xl md:text-5xl leading-[1.05] mt-3"
        >
          Your wallet is <em className="font-serif-i text-white/60">active</em>.
        </motion.h1>

        <div className="mt-10">
          <div className="flex items-center gap-2.5">
            <p className="text-amber-200/90 text-[11px] tracking-[0.3em] uppercase">
              GoogolPlex Seva Credit
            </p>
            {phase === "minting" && (
              <span className="inline-block w-3 h-3 rounded-full border-2 border-amber-300/40 border-t-amber-300 animate-spin" />
            )}
          </div>

          <motion.p
            animate={
              phase === "done"
                ? { scale: [1, 1.04, 1], textShadow: "0 0 40px rgba(252,211,77,0.45)" }
                : {}
            }
            transition={{ duration: 0.6 }}
            className="mt-3 font-serif text-5xl md:text-6xl tracking-tight tabular-nums text-white"
          >
            {phase === "minting" ? "—" : shown.toLocaleString()}
          </motion.p>

          <p className="text-white/45 text-sm mt-3 leading-relaxed max-w-md">
            {phase === "minting"
              ? "Generating your credit against the $1 you deposited…"
              : phase === "counting"
                ? "Generating…"
                : phase === "failed"
                  ? "Your payment went through — the credit didn't generate."
                  : "Backed by the $1 in your wallet. It's yours, and it stays with your account."}
          </p>
        </div>

        {phase === "failed" && (
          <div className="mt-6">
            <p className="text-rose-300/90 text-sm">{error}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  startedRef.current = true;
                  void run();
                }}
                className="rounded-full bg-white text-black px-6 py-2.5 text-sm font-medium"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={onDone}
                className="text-white/50 hover:text-white text-sm underline"
              >
                Continue anyway
              </button>
            </div>
          </div>
        )}

        {phase === "done" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-10"
          >
            <button
              type="button"
              onClick={onDone}
              className="rounded-full bg-white text-black px-8 py-3 text-sm font-medium transition-opacity hover:opacity-90"
            >
              Enter GoogolPlex →
            </button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

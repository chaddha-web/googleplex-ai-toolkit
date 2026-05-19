"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const STORAGE_KEY = "gplex.cookie_consent";

type Consent = "accepted" | "essential" | null;

export function readCookieConsent(): Consent {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "accepted" || v === "essential" ? v : null;
}

/**
 * First-visit cookie consent banner.
 *
 * Replaces the old PIN-style access gate. We only ever store first-party
 * cookies/localStorage; the consent is a soft preference for whether to
 * fire analytics + product-update opt-ins. Nothing is blocked either way
 * — the choice is recorded and respected by lib/analytics callers.
 */
export function CookieConsent() {
  const [decided, setDecided] = useState<Consent>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDecided(readCookieConsent());
  }, []);

  function choose(value: Exclude<Consent, null>) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* private mode — banner just disappears in-memory */
    }
    setDecided(value);
    // Hint to any subscribers that the consent state changed.
    window.dispatchEvent(new CustomEvent("gplex:cookie-consent", { detail: value }));
  }

  if (!mounted || decided) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="cookie-consent"
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="fixed inset-x-0 bottom-0 z-[60] px-4 pb-4 md:pb-6"
      >
        <div className="mx-auto max-w-3xl liquid-glass rounded-2xl p-5 md:p-6 flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6 text-white">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] tracking-[0.3em] uppercase text-white/40 mb-1.5">
              Cookies
            </p>
            <p className="text-sm leading-relaxed text-white/80">
              We use first-party cookies to keep you signed in, remember
              preferences, and (with your nod) measure how the product is used.
              No third-party trackers, ever.{" "}
              <Link href="/privacy" className="underline hover:text-white">
                Read the policy
              </Link>
              .
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => choose("essential")}
              className="text-xs rounded-full px-4 py-2 ring-1 ring-white/15 hover:bg-white/5 transition-colors text-white/70 hover:text-white"
            >
              Essential only
            </button>
            <button
              type="button"
              onClick={() => choose("accepted")}
              className="text-xs rounded-full px-4 py-2 bg-white text-black font-medium hover:bg-white/90 transition-colors"
            >
              Accept all
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

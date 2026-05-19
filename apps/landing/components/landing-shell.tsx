"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { VIDEOS } from "@/lib/assets";
import { getCookie, setCookie } from "@/lib/cookies";

// Bumped any time the asset list changes — invalidates the warm-cache cookie
// so visitors re-preload when we ship new videos.
const WARM_COOKIE = "gplex.videos_warm";
const WARM_VERSION = "1";

// Only videos actually used on the landing page — keeps the loader quick and
// avoids prefetching auth/secondary assets here.
const ASSETS = [
  VIDEOS.hero,
  VIDEOS.featured,
  VIDEOS.philosophy,
  VIDEOS.serviceStrategy,
  VIDEOS.serviceCraft,
  VIDEOS.footer
];

/**
 * Full-screen loader shown until every hero/background video is buffered
 * enough to play through. Preloads all videos in hidden <video> elements
 * so the on-page <video>s render from cache once the loader exits.
 */
export function LandingShell({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(0);
  const [ready, setReady] = useState(false);
  // Don't render the loader until we've checked the warm-cache cookie — keeps
  // returning visitors from seeing a 1-frame flash of the splash.
  const [cookieChecked, setCookieChecked] = useState(false);

  // Lock body scroll while the loader is visible.
  // Force "" instead of restoring a captured prev value — see access-gate.tsx
  // for the rationale.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = ready ? "" : "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [ready]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Return visitors: cookie says the videos were already warmed in a recent
    // session, so the browser HTTP cache should still have them. Skip the
    // loader entirely and let the on-page <video>s render straight away.
    if (getCookie(WARM_COOKIE) === WARM_VERSION) {
      setReady(true);
      setCookieChecked(true);
      return;
    }
    setCookieChecked(true);

    // Hard ceiling — never block the user behind a stalled CDN response.
    const MAX_WAIT_MS = 8000;
    const hardTimer = window.setTimeout(() => setReady(true), MAX_WAIT_MS);

    let done = 0;
    const total = ASSETS.length;
    const tags: HTMLVideoElement[] = [];

    const markOne = () => {
      done += 1;
      setLoaded(done);
      if (done >= total) {
        // Mark this browser as "warm" so the next visit skips the splash
        // (the videos themselves stay in the browser HTTP cache).
        setCookie(WARM_COOKIE, WARM_VERSION, {
          maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
        });
        // small grace so the progress bar gets to 100% before the fade
        setTimeout(() => setReady(true), 250);
      }
    };

    ASSETS.forEach((src) => {
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.src = src;
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        markOne();
      };
      v.addEventListener("canplaythrough", settle, { once: true });
      v.addEventListener("loadeddata", settle, { once: true });
      v.addEventListener("error", settle, { once: true });
      // per-asset fallback so one slow video can't hold the loader forever
      window.setTimeout(settle, MAX_WAIT_MS - 500);
      tags.push(v);
    });

    return () => {
      clearTimeout(hardTimer);
      tags.forEach((v) => {
        v.removeAttribute("src");
        v.load();
      });
    };
  }, []);

  const pct = Math.min(100, Math.round((loaded / ASSETS.length) * 100));

  return (
    <>
      {/* Content is rendered immediately so the videos start hydrating in the
          background, but it's hidden under the loader until ready. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: ready ? 1 : 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        {children}
      </motion.div>

      <AnimatePresence>
        {cookieChecked && !ready && (
          <motion.div
            key="loader"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center"
          >
            {/* Brand wordmark */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="flex items-center gap-3 text-white"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 256 256"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M 4.688 136 C 68.373 136 120 187.627 120 251.312 C 120 252.883 119.967 254.445 119.905 256 L 0 256 L 0 136.096 C 1.555 136.034 3.117 136 4.688 136 Z M 251.312 136 C 252.883 136 254.445 136.034 256 136.096 L 256 256 L 136.095 256 C 136.032 254.438 136.001 252.875 136 251.312 C 136 187.627 187.627 136 251.312 136 Z M 119.905 0 C 119.967 1.555 120 3.117 120 4.688 C 120 68.373 68.373 120 4.687 120 C 3.117 120 1.555 119.967 0 119.905 L 0 0 Z M 256 119.905 C 254.445 119.967 252.883 120 251.312 120 C 187.627 120 136 68.373 136 4.687 C 136 3.117 136.033 1.555 136.095 0 L 256 0 Z" />
              </svg>
              <span className="font-serif-i text-3xl tracking-tight">
                Googolplex
              </span>
            </motion.div>

            {/* Tagline */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="mt-3 text-white/40 text-xs tracking-[0.3em] uppercase"
            >
              Preparing your experience
            </motion.p>

            {/* Progress bar */}
            <div className="mt-10 w-56 sm:w-64">
              <div className="h-px w-full bg-white/10 overflow-hidden rounded-full">
                <motion.div
                  className="h-full bg-white/80"
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-widest text-white/40">
                <span>Loading</span>
                <span className="tabular-nums">{pct}%</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

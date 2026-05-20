"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { VIDEOS } from "@/lib/assets";
import { getCookie, setCookie } from "@/lib/cookies";

// Bumped any time the asset list changes — invalidates the warm-cache cookie
// so visitors re-preload when we ship new videos.
const WARM_COOKIE = "gplex.videos_warm";
const WARM_VERSION = "2"; // bumped: loader now also preloads images

// Videos actually used on the landing page.
const VIDEO_ASSETS = [
  VIDEOS.hero,
  VIDEOS.featured,
  VIDEOS.philosophy,
  VIDEOS.serviceStrategy,
  VIDEOS.serviceCraft,
  VIDEOS.footer
];

// Images the landing relies on — brand logo + partner marquee logos. The
// loader holds until these resolve (loaded or errored) so the page never
// pops in with half-loaded imagery.
const IMAGE_ASSETS = [
  "/logo.png",
  "https://i.ibb.co/FGYbCDx/1.png",
  "https://i.ibb.co/7JFb8tGY/2.png",
  "https://i.ibb.co/JRH4Yw4m/3.png",
  "https://i.ibb.co/nt3gG3w/4.png",
  "https://i.ibb.co/0jvxfdrv/5.png",
  "https://i.ibb.co/WWR8GsSZ/6.png",
  "https://i.ibb.co/7J5jyrDQ/7.png"
];

const ASSETS = [...VIDEO_ASSETS, ...IMAGE_ASSETS];

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
    const videoTags: HTMLVideoElement[] = [];
    const imgTags: HTMLImageElement[] = [];

    const markOne = () => {
      done += 1;
      setLoaded(done);
      if (done >= total) {
        // Mark this browser as "warm" so the next visit skips the splash
        // (the assets themselves stay in the browser HTTP cache).
        setCookie(WARM_COOKIE, WARM_VERSION, {
          maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
        });
        // small grace so the progress bar gets to 100% before the fade
        setTimeout(() => setReady(true), 250);
      }
    };

    // Videos — settle on canplaythrough / loadeddata / error.
    VIDEO_ASSETS.forEach((src) => {
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
      window.setTimeout(settle, MAX_WAIT_MS - 500);
      videoTags.push(v);
    });

    // Images — settle on load / error (errored remote logos shouldn't block).
    IMAGE_ASSETS.forEach((src) => {
      const img = new Image();
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        markOne();
      };
      img.addEventListener("load", settle, { once: true });
      img.addEventListener("error", settle, { once: true });
      img.src = src;
      // Already-cached images may resolve synchronously.
      if (img.complete) settle();
      window.setTimeout(settle, MAX_WAIT_MS - 500);
      imgTags.push(img);
    });

    return () => {
      clearTimeout(hardTimer);
      videoTags.forEach((v) => {
        v.removeAttribute("src");
        v.load();
      });
      imgTags.forEach((img) => {
        img.src = "";
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="GoogolPlex"
                width={36}
                height={36}
                className="h-9 w-auto object-contain"
              />
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

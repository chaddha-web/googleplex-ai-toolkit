"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getCookie, setCookie } from "@/lib/cookies";

/**
 * Reusable full-screen asset loader. Preloads a list of images (and optional
 * videos) in hidden elements, holds a branded splash until they all settle
 * (loaded OR errored), then fades to the page. A per-key warm cookie skips
 * the splash for return visitors.
 *
 * Mirrors the landing's LandingShell splash so every page feels consistent.
 */
export function AssetLoader({
  images = [],
  videos = [],
  warmKey,
  maxWaitMs = 8000,
  children
}: {
  images?: string[];
  videos?: string[];
  /** Unique cookie key per page so each page's warm-state is independent. */
  warmKey: string;
  maxWaitMs?: number;
  children: React.ReactNode;
}) {
  const total = images.length + videos.length;
  const [loaded, setLoaded] = useState(0);
  const [ready, setReady] = useState(false);
  const [cookieChecked, setCookieChecked] = useState(false);

  const cookieName = `gplex.warm.${warmKey}`;
  const cookieVersion = String(total); // changes if asset count changes

  useEffect(() => {
    if (ready) return;
    if (typeof document === "undefined") return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [ready]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (total === 0) {
      setReady(true);
      setCookieChecked(true);
      return;
    }

    if (getCookie(cookieName) === cookieVersion) {
      setReady(true);
      setCookieChecked(true);
      return;
    }
    setCookieChecked(true);

    const hardTimer = window.setTimeout(() => setReady(true), maxWaitMs);

    let done = 0;
    const imgTags: HTMLImageElement[] = [];
    const vidTags: HTMLVideoElement[] = [];

    const markOne = () => {
      done += 1;
      setLoaded(done);
      if (done >= total) {
        setCookie(cookieName, cookieVersion, { maxAgeSeconds: 60 * 60 * 24 * 30 });
        setTimeout(() => setReady(true), 250);
      }
    };

    images.forEach((src) => {
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
      if (img.complete) settle();
      window.setTimeout(settle, maxWaitMs - 500);
      imgTags.push(img);
    });

    videos.forEach((src) => {
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
      window.setTimeout(settle, maxWaitMs - 500);
      vidTags.push(v);
    });

    return () => {
      clearTimeout(hardTimer);
      imgTags.forEach((img) => (img.src = ""));
      vidTags.forEach((v) => {
        v.removeAttribute("src");
        v.load();
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = total === 0 ? 100 : Math.min(100, Math.round((loaded / total) * 100));

  return (
    <>
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
            key="asset-loader"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center"
          >
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="flex items-center gap-3 text-white"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="GoogolPlex" width={36} height={36} className="h-9 w-auto object-contain" />
              <span className="font-serif-i text-3xl tracking-tight">Googolplex</span>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="mt-3 text-white/40 text-xs tracking-[0.3em] uppercase"
            >
              Preparing your experience
            </motion.p>

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

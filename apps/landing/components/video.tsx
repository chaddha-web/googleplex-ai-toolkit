"use client";

import { useEffect, useRef, useState } from "react";

type FadeProps = {
  src: string;
  placeholderClass?: string;
  className?: string;
};

/**
 * Hero-style video that crossfades to black at the end of every loop.
 * Vanilla rAF opacity animation — no CSS transitions, no flicker.
 */
export function FadeLoopVideo({
  src,
  placeholderClass = "placeholder-video",
  className = ""
}: FadeProps) {
  const vidRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const v = vidRef.current;
    if (!v) return;

    v.style.opacity = "0";

    const animateOpacity = (from: number, to: number, dur: number) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / dur);
        const val = from + (to - from) * t;
        if (vidRef.current) vidRef.current.style.opacity = String(val);
        if (t < 1) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    const onCanPlay = () => {
      v.play().catch(() => {});
      animateOpacity(0, 1, 500);
    };
    const onTimeUpdate = () => {
      if (!v.duration) return;
      const remaining = v.duration - v.currentTime;
      if (remaining <= 0.55 && remaining > 0) {
        const cur = parseFloat(v.style.opacity || "1");
        if (cur > 0.05) animateOpacity(cur, 0, 500);
      }
    };
    const onEnded = () => {
      v.style.opacity = "0";
      setTimeout(() => {
        v.currentTime = 0;
        v.play().catch(() => {});
        animateOpacity(0, 1, 500);
      }, 100);
    };
    const onError = () => setFailed(true);

    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("ended", onEnded);
    v.addEventListener("error", onError);

    const tm = window.setTimeout(() => {
      if (v.readyState < 2) setFailed(true);
    }, 4500);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearTimeout(tm);
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onError);
    };
  }, [src]);

  return (
    <>
      {failed && <div className={`${placeholderClass} absolute inset-0 ${className}`} />}
      <video
        ref={vidRef}
        src={src}
        muted
        autoPlay
        playsInline
        preload="auto"
        className={`${className} ${failed ? "hidden" : ""}`}
        style={{ opacity: 0 }}
      />
    </>
  );
}

/** Simple looping video (no crossfade) — used inside the section cards. */
export function LoopVideo({
  src,
  placeholderClass = "placeholder-video",
  className = ""
}: FadeProps) {
  const vidRef = useRef<HTMLVideoElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const v = vidRef.current;
    if (!v) return;
    const tryPlay = () => {
      v.play().catch(() => {});
    };
    const onError = () => setFailed(true);
    v.addEventListener("error", onError);
    v.addEventListener("canplay", tryPlay);
    v.addEventListener("loadeddata", tryPlay);
    tryPlay();
    const tm = window.setTimeout(() => {
      if (v.readyState < 2) setFailed(true);
    }, 4500);
    return () => {
      v.removeEventListener("error", onError);
      v.removeEventListener("canplay", tryPlay);
      v.removeEventListener("loadeddata", tryPlay);
      clearTimeout(tm);
    };
  }, [src]);

  return (
    <>
      {failed && <div className={`${placeholderClass} absolute inset-0 ${className}`} />}
      <video
        ref={vidRef}
        src={src}
        muted
        autoPlay
        loop
        playsInline
        preload="auto"
        className={`${className} ${failed ? "hidden" : ""}`}
      />
    </>
  );
}

/** Absolute-filled background video for the footer / CTA section. */
export function FooterBgVideo({ src }: { src: string }) {
  const vidRef = useRef<HTMLVideoElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const v = vidRef.current;
    if (!v) return;
    const tryPlay = () => {
      v.play().catch(() => {});
    };
    const onError = () => setFailed(true);
    v.addEventListener("error", onError);
    v.addEventListener("canplay", tryPlay);
    v.addEventListener("loadeddata", tryPlay);
    tryPlay();
    const tm = window.setTimeout(() => {
      if (v.readyState < 2) setFailed(true);
    }, 4500);
    return () => {
      v.removeEventListener("error", onError);
      v.removeEventListener("canplay", tryPlay);
      v.removeEventListener("loadeddata", tryPlay);
      clearTimeout(tm);
    };
  }, [src]);

  return (
    <>
      {failed && <div className="absolute inset-0 w-full h-full placeholder-video z-0" />}
      <video
        ref={vidRef}
        src={src}
        muted
        autoPlay
        loop
        playsInline
        preload="auto"
        className={`absolute inset-0 w-full h-full object-cover z-0 ${failed ? "hidden" : ""}`}
      />
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

type FadeProps = {
  src: string;
  placeholderClass?: string;
  className?: string;
  /**
   * Load immediately instead of waiting to scroll into view. Use for the
   * above-the-fold hero — everything else loads lazily so the visible video
   * gets the full pipe first.
   */
  eager?: boolean;
};

/**
 * Shared resilience + lazy/sequential loading for the background videos.
 *
 * Two problems this solves:
 *
 *  1. "Hero loaded half the time." The old splash preloaded all six videos in
 *     parallel and the player gave up permanently after a 4.5s timeout, so on
 *     a slow pipe the visible hero — competing with five invisible videos —
 *     routinely missed the deadline and was abandoned for the whole session.
 *
 *  2. Bandwidth contention. Every <video preload="auto"> fetched on mount, so
 *     the footer video downloaded while you were still looking at the hero.
 *
 * Fix: the source isn't attached until the element scrolls near the viewport
 * (IntersectionObserver, ~400px lookahead), so videos load one section at a
 * time as you reach them. The branded placeholder sits BEHIND the video and
 * clears the moment playback starts; only a real `error` is a hard failure;
 * play() is re-nudged on a stalled buffer instead of giving up.
 *
 * Pair with `-movflags +faststart` on the source files so the first frame is
 * decodable after a few hundred KB rather than the whole file.
 */
function useResilientVideo(src: string, eager = false) {
  const vidRef = useRef<HTMLVideoElement | null>(null);
  // Whether the source is attached + actively loading.
  const [active, setActive] = useState(eager);
  const [playing, setPlaying] = useState(false);
  const [errored, setErrored] = useState(false);

  // Lazy activation: attach the source only once the element nears the
  // viewport. Eager videos skip this and load straight away. For an element
  // already on screen the observer fires on its first callback, so above-fold
  // lazy videos still load immediately.
  useEffect(() => {
    if (active) return;
    const v = vidRef.current;
    if (!v || typeof IntersectionObserver === "undefined") {
      setActive(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setActive(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px 0px" }
    );
    io.observe(v);
    return () => io.disconnect();
  }, [active]);

  // Playback wiring — only once the source is attached.
  useEffect(() => {
    if (!active) return;
    const v = vidRef.current;
    if (!v) return;
    setPlaying(false);
    setErrored(false);

    const tryPlay = () => {
      v.play().catch(() => {});
    };
    const onPlaying = () => {
      setErrored(false);
      setPlaying(true);
    };
    const onError = () => setErrored(true);

    v.addEventListener("canplay", tryPlay);
    v.addEventListener("loadeddata", tryPlay);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("error", onError);
    tryPlay();

    // Re-arm a stalled autoplay without restarting the download (no load()):
    // reflect the real element state so a video that quietly started gets
    // un-placeholdered, and re-ask to play if it hasn't.
    const nudge = window.setInterval(() => {
      const el = vidRef.current;
      if (!el) return;
      const running = !el.paused && el.readyState >= 2 && el.currentTime > 0;
      if (running) setPlaying(true);
      else if (!el.error) tryPlay();
    }, 3000);

    return () => {
      clearInterval(nudge);
      v.removeEventListener("canplay", tryPlay);
      v.removeEventListener("loadeddata", tryPlay);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("error", onError);
    };
  }, [active, src]);

  return { vidRef, active, playing, errored };
}

/**
 * Hero-style video that crossfades to black at the end of every loop.
 * Vanilla rAF opacity animation — no CSS transitions, no flicker.
 */
export function FadeLoopVideo({
  src,
  placeholderClass = "placeholder-video",
  className = "",
  eager = true
}: FadeProps) {
  const vidRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    const v = vidRef.current;
    if (!v || !eager) return;
    setPlaying(false);
    setErrored(false);

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
      setPlaying(true);
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
    const onError = () => setErrored(true);

    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("ended", onEnded);
    v.addEventListener("error", onError);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onError);
    };
  }, [src, eager]);

  return (
    <>
      {(!playing || errored) && (
        <div className={`${placeholderClass} absolute inset-0 ${className}`} />
      )}
      <video
        ref={vidRef}
        src={src}
        muted
        autoPlay
        playsInline
        preload="auto"
        className={`${className} ${errored ? "invisible" : ""}`}
        style={{ opacity: 0 }}
      />
    </>
  );
}

/** Simple looping video — hero (eager) + section cards (lazy by default). */
export function LoopVideo({
  src,
  placeholderClass = "placeholder-video",
  className = "",
  eager = false
}: FadeProps) {
  const { vidRef, active, playing, errored } = useResilientVideo(src, eager);

  return (
    <>
      {/* Placeholder sits behind the video and clears once it starts playing. */}
      {(!playing || errored) && (
        <div className={`${placeholderClass} absolute inset-0 ${className}`} />
      )}
      <video
        ref={vidRef}
        // Source attaches only once active (eager, or scrolled into view).
        src={active ? src : undefined}
        muted
        autoPlay
        loop
        playsInline
        preload={active ? "auto" : "none"}
        className={`${className} ${errored ? "invisible" : ""}`}
      />
    </>
  );
}

/** Absolute-filled background video for the footer / CTA section. */
export function FooterBgVideo({
  src,
  eager = false
}: {
  src: string;
  eager?: boolean;
}) {
  const { vidRef, active, playing, errored } = useResilientVideo(src, eager);

  return (
    <>
      {(!playing || errored) && (
        <div className="absolute inset-0 w-full h-full placeholder-video z-0" />
      )}
      <video
        ref={vidRef}
        src={active ? src : undefined}
        muted
        autoPlay
        loop
        playsInline
        preload={active ? "auto" : "none"}
        className={`absolute inset-0 w-full h-full object-cover z-0 ${
          errored ? "invisible" : ""
        }`}
      />
    </>
  );
}

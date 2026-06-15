"use client";

import { useEffect, useRef, useState } from "react";

type FadeProps = {
  src: string;
  placeholderClass?: string;
  className?: string;
};

/**
 * Shared resilience for the background videos.
 *
 * The old behaviour gave up permanently after a 4.5s timeout: any connection
 * slower than that flipped to a static placeholder for the whole session and
 * never recovered — which is why the hero "didn't load half the time". The
 * media files are large (16MB hero), so on mobile the first frame routinely
 * crossed that deadline.
 *
 * New behaviour:
 *   - The branded placeholder sits BEHIND the <video> and shows only until
 *     playback actually starts. No black flash while buffering.
 *   - We only treat a real `error` event as a hard failure (404 / decode).
 *   - We keep nudging play() so a slow buffer just appears late instead of
 *     being abandoned.
 *
 * Pair this with `-movflags +faststart` on the source files so the moov atom
 * is at the front and the browser can render the first frame after a few
 * hundred KB instead of the whole file.
 */
function useResilientVideo(src: string) {
  const vidRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
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
    // if it still isn't running, ask it to play again. Reflect the real
    // element state so a video that quietly started gets un-placeholdered.
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
  }, [src]);

  return { vidRef, playing, errored };
}

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
  const [playing, setPlaying] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    const v = vidRef.current;
    if (!v) return;
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
  }, [src]);

  return (
    <>
      {(!playing || errored) && (
        <div className={`${placeholderClass} absolute inset-0 ${className}`} />
      )}
      {!errored && (
        <video
          ref={vidRef}
          src={src}
          muted
          autoPlay
          playsInline
          preload="auto"
          className={className}
          style={{ opacity: 0 }}
        />
      )}
    </>
  );
}

/** Simple looping video (no crossfade) — used for hero + section cards. */
export function LoopVideo({
  src,
  placeholderClass = "placeholder-video",
  className = ""
}: FadeProps) {
  const { vidRef, playing, errored } = useResilientVideo(src);

  return (
    <>
      {/* Placeholder sits behind the video and clears once it starts playing. */}
      {(!playing || errored) && (
        <div className={`${placeholderClass} absolute inset-0 ${className}`} />
      )}
      {!errored && (
        <video
          ref={vidRef}
          src={src}
          muted
          autoPlay
          loop
          playsInline
          preload="auto"
          className={className}
        />
      )}
    </>
  );
}

/** Absolute-filled background video for the footer / CTA section. */
export function FooterBgVideo({ src }: { src: string }) {
  const { vidRef, playing, errored } = useResilientVideo(src);

  return (
    <>
      {(!playing || errored) && (
        <div className="absolute inset-0 w-full h-full placeholder-video z-0" />
      )}
      {!errored && (
        <video
          ref={vidRef}
          src={src}
          muted
          autoPlay
          loop
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover z-0"
        />
      )}
    </>
  );
}

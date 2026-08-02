"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Orientation video that must be watched all the way through.
 *
 * It goes fullscreen, hides the controls, refuses to stay paused, and clamps
 * seeking to the furthest point actually watched. When it ends it calls
 * `onComplete` — there is no skip button.
 *
 * This is a UI lock, not a security boundary: anyone with devtools can call
 * onComplete themselves. It exists to stop ordinary skipping, and the server
 * does not treat "watched" as proof of anything.
 *
 * Fullscreen needs a user gesture, and so does audio playback on most browsers,
 * which is why there's a Begin screen rather than autoplay on mount.
 */
export function LockedVideo({
  src,
  title,
  onComplete
}: {
  src: string;
  title?: string;
  onComplete: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  /** Furthest point genuinely reached — the ceiling for any seek. */
  const watchedRef = useRef(0);

  const [started, setStarted] = useState(false);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enterFullscreen = useCallback(async () => {
    const el = wrapRef.current;
    if (!el) return;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      // Safari
      else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
    } catch {
      // Fullscreen refused (iOS Safari on <video> containers, or a policy) —
      // the video still plays inline and still can't be skipped.
    }
  }, []);

  async function begin() {
    setError(null);
    setStarted(true);
    await enterFullscreen();
    try {
      await videoRef.current?.play();
    } catch {
      setError("Your browser blocked playback. Tap the video to start it.");
    }
  }

  // Track fullscreen so we can nudge them back if they escape out of it.
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Swallow the keys that would otherwise scrub or pause.
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      const blocked = [" ", "k", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "j", "l", "Home", "End"];
      if (blocked.includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [started]);

  function onTimeUpdate() {
    const v = videoRef.current;
    if (!v) return;
    // Jumped ahead of what they've watched? Put them back. The 0.75s slack
    // absorbs normal buffering jitter without letting a real seek through.
    if (v.currentTime > watchedRef.current + 0.75) {
      v.currentTime = watchedRef.current;
      return;
    }
    if (v.currentTime > watchedRef.current) watchedRef.current = v.currentTime;
    setProgress(watchedRef.current);
  }

  function onPause() {
    const v = videoRef.current;
    if (!v || v.ended) return;
    // Tab hidden / OS interruption: let it stay paused, it'll resume when they
    // come back. Anything else is a deliberate pause, so undo it.
    if (document.visibilityState !== "visible") return;
    void v.play().catch(() => {});
  }

  useEffect(() => {
    const onVisible = () => {
      const v = videoRef.current;
      if (!v || v.ended || !started) return;
      if (document.visibilityState === "visible") void v.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [started]);

  function onEnded() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    onComplete();
  }

  const pct = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;
  const remaining = Math.max(0, Math.round(duration - progress));
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div
      ref={wrapRef}
      className="relative w-full rounded-3xl overflow-hidden ring-1 ring-white/10 bg-black"
    >
      <div className="relative w-full aspect-video">
        <video
          ref={videoRef}
          src={src}
          playsInline
          controls={false}
          disablePictureInPicture
          controlsList="nodownload noplaybackrate noremoteplayback"
          onContextMenu={(e) => e.preventDefault()}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration || 0);
            setReady(true);
          }}
          onTimeUpdate={onTimeUpdate}
          onPause={onPause}
          onEnded={onEnded}
          onClick={() => {
            // Only ever resumes — clicking can't pause it.
            const v = videoRef.current;
            if (v?.paused && started) void v.play().catch(() => {});
          }}
          className="absolute inset-0 w-full h-full bg-black"
        />

        {/* Begin screen — carries the gesture fullscreen and audio both need. */}
        {!started && (
          <div className="absolute inset-0 grid place-items-center bg-black/80 backdrop-blur-sm px-6 text-center">
            <div>
              <p className="text-white/40 text-[11px] tracking-[0.3em] uppercase">Orientation</p>
              <h2 className="font-serif text-2xl md:text-3xl tracking-tight mt-3 text-white">
                {title || "Watch this before you continue"}
              </h2>
              <p className="text-white/50 text-sm mt-3 max-w-md mx-auto leading-relaxed">
                It plays fullscreen and can&apos;t be skipped or fast-forwarded.
                {duration > 0 ? ` About ${Math.ceil(duration / 60)} minutes.` : ""} The questions
                appear as soon as it finishes.
              </p>
              <button
                type="button"
                onClick={begin}
                disabled={!ready}
                className="mt-7 rounded-full bg-white text-black px-8 py-3 text-sm font-medium disabled:opacity-40 transition-opacity hover:opacity-90"
              >
                {ready ? "Begin →" : "Loading…"}
              </button>
              {!ready && (
                <p className="text-white/30 text-[11px] mt-3 flex items-center justify-center gap-2">
                  <span className="w-3 h-3 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
                  Loading the video
                </p>
              )}
            </div>
          </div>
        )}

        {/* Nudge back to fullscreen if they escape out mid-way. */}
        {started && !fullscreen && (
          <button
            type="button"
            onClick={enterFullscreen}
            className="absolute top-3 right-3 rounded-full bg-black/70 ring-1 ring-white/20 text-white/80 hover:text-white text-xs px-3 py-1.5 transition-colors"
          >
            Go fullscreen
          </button>
        )}
      </div>

      {/* Watch progress. Deliberately not a scrub bar — it isn't interactive. */}
      {started && (
        <div className="px-4 py-3 bg-black">
          <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-white/70 transition-[width] duration-300 ease-linear"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-white/35 tabular-nums">
            <span>{Math.round(pct)}% watched</span>
            {duration > 0 && <span>{mmss(remaining)} left</span>}
          </div>
          {error && <p className="text-amber-200/80 text-[11px] mt-2">{error}</p>}
        </div>
      )}
    </div>
  );
}

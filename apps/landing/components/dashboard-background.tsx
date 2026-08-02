"use client";

import { useEffect, useState } from "react";
import { fetchDashboardTheme, type DashboardTheme } from "@/lib/auth-client";

/**
 * The member dashboard background, set globally by the admin (Admin → Theme).
 *
 * Fixed and behind everything (`-z-10`, `pointer-events-none`), so it can never
 * intercept a click. Renders nothing until the theme loads and nothing at all
 * for the default theme, which leaves the existing page styling untouched —
 * a failed fetch therefore looks exactly like it did before this shipped.
 */
export function DashboardBackground() {
  const [theme, setTheme] = useState<DashboardTheme | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchDashboardTheme().then((t) => {
      if (!cancelled) setTheme(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Flag the document so the dashboard's opaque surface turns transparent
  // (see globals.css). Cleared on unmount so the admin panel is unaffected.
  useEffect(() => {
    const themed = !!theme && theme.kind !== "default";
    if (themed) document.documentElement.dataset.themed = "1";
    else delete document.documentElement.dataset.themed;
    return () => {
      delete document.documentElement.dataset.themed;
    };
  }, [theme]);

  if (!theme || theme.kind === "default") return null;

  const scrim = theme.dim / 100;
  const filter = theme.blur > 0 ? `blur(${theme.blur}px)` : undefined;

  return (
    <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none overflow-hidden bg-black">
      {theme.kind === "gradient" && (
        <div
          className="absolute inset-0"
          style={{ backgroundImage: `linear-gradient(${theme.angle}deg, ${theme.colors.join(", ")})` }}
        />
      )}

      {theme.kind === "image" && theme.url && (
        // Deliberately a plain <img>, not next/image: the URL is admin-supplied
        // at runtime and may point at any host, which the image optimizer would
        // refuse without a build-time domain allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={theme.url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter, transform: theme.blur > 0 ? "scale(1.06)" : undefined }}
        />
      )}

      {theme.kind === "video" && theme.url && (
        <video
          src={theme.url}
          autoPlay
          muted
          loop
          playsInline
          // Never block first paint on a background video.
          preload="none"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter, transform: theme.blur > 0 ? "scale(1.06)" : undefined }}
        />
      )}

      {scrim > 0 && (
        <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${scrim})` }} />
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { AUTH_BASE } from "@/lib/auth-client";

/**
 * The dashboard background, set globally by the admin (admin.ggakingclub.com →
 * Theme) and shared by every member surface. Mirrors the landing app's copy in
 * apps/landing/components/dashboard-background.tsx — the two apps don't share a
 * component layer, so the markup is duplicated deliberately; keep them in step.
 *
 * Fixed and behind everything (`-z-10`, `pointer-events-none`), so it can never
 * intercept a click. Renders nothing for the default theme, which leaves the
 * existing styling untouched — a failed fetch looks exactly like today.
 */

type DashboardTheme = {
  kind: "default" | "gradient" | "image" | "video";
  colors: string[];
  angle: number;
  dim: number;
  blur: number;
  url: string;
};

export function DashboardBackground() {
  const [theme, setTheme] = useState<DashboardTheme | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${AUTH_BASE}/auth/theme`);
        if (!res.ok) return;
        const data = (await res.json()) as { theme?: DashboardTheme };
        if (!cancelled && data.theme) setTheme(data.theme);
      } catch {
        /* leave the stock background in place */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Flag the document so the app's opaque black body turns transparent
  // (see globals.css). Cleared on unmount.
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
  const lift = theme.blur > 0 ? "scale(1.06)" : undefined;

  return (
    <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none overflow-hidden bg-black">
      {theme.kind === "gradient" && (
        <div
          className="absolute inset-0"
          style={{ backgroundImage: `linear-gradient(${theme.angle}deg, ${theme.colors.join(", ")})` }}
        />
      )}

      {theme.kind === "image" && theme.url && (
        // Plain <img>, not next/image: the URL is admin-supplied at runtime and
        // may point at any host, which the optimizer would reject without a
        // build-time domain allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={theme.url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter, transform: lift }}
        />
      )}

      {theme.kind === "video" && theme.url && (
        <video
          src={theme.url}
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter, transform: lift }}
        />
      )}

      {scrim > 0 && (
        <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${scrim})` }} />
      )}
    </div>
  );
}

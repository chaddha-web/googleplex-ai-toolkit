"use client";

import { isOverridden, useDashboardTheme } from "@/lib/use-dashboard-theme";

/**
 * The admin-set dashboard background override (admin.ggakingclub.com → Theme).
 *
 * Renders NOTHING for the default theme: the app's stock Celestial-Lion artwork
 * is painted by DashboardShell itself, and that stays the job of the shell. This
 * layer only exists when an admin has replaced it — at which point the shell
 * goes transparent and this shows through.
 *
 * Fixed and behind everything (`-z-10`, `pointer-events-none`), so it can never
 * intercept a click.
 */
export function DashboardBackground() {
  const theme = useDashboardTheme();
  if (!isOverridden(theme) || !theme) return null;

  const scrim = theme.dim / 100;
  const filter = theme.blur > 0 ? `blur(${theme.blur}px)` : undefined;
  // Blurring pulls the edges in, so scale up slightly to avoid a soft border.
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

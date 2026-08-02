"use client";

import { useEffect, useState } from "react";
import { AUTH_BASE } from "@/lib/auth-client";

/**
 * The admin-set dashboard background (admin.ggakingclub.com → Theme).
 *
 * Two components need this — DashboardShell, which paints the stock artwork,
 * and DashboardBackground, which paints an override — so the result is cached
 * at module scope and fetched once per page load rather than twice.
 *
 * `null` means "not resolved yet". Callers must treat that as "keep the stock
 * background", so a slow or failed fetch never flashes an empty page.
 */

export type DashboardTheme = {
  kind: "default" | "gradient" | "image" | "video";
  colors: string[];
  angle: number;
  dim: number;
  blur: number;
  url: string;
};

/** The artwork the app ships with, used whenever no theme is configured. */
export const STOCK_BG_URL =
  process.env.NEXT_PUBLIC_DASH_BG_URL || "https://ggakingclub.com/media/celestial-lion.jpg";

/** The scrim the stock artwork is designed to sit under. */
export const STOCK_BG_SCRIM =
  "linear-gradient(180deg, rgba(7,8,20,0.74) 0%, rgba(7,8,20,0.5) 28%, rgba(7,8,20,0.48) 62%, rgba(7,8,20,0.72) 100%)";

let cached: DashboardTheme | null = null;
let inFlight: Promise<DashboardTheme | null> | null = null;

function load(): Promise<DashboardTheme | null> {
  if (cached) return Promise.resolve(cached);
  if (!inFlight) {
    inFlight = fetch(`${AUTH_BASE}/auth/theme`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { theme?: DashboardTheme } | null) => {
        cached = d?.theme ?? null;
        return cached;
      })
      .catch(() => null)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export function useDashboardTheme(): DashboardTheme | null {
  const [theme, setTheme] = useState<DashboardTheme | null>(cached);

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    void load().then((t) => {
      if (!cancelled) setTheme(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return theme;
}

/** True when an admin override should replace the stock artwork. */
export function isOverridden(theme: DashboardTheme | null): boolean {
  return !!theme && theme.kind !== "default";
}

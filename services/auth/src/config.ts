/**
 * Typed accessors for the non-secret settings that drive the member-facing
 * experience: the orientation (video + quiz gating) and the dashboard theme.
 *
 * These live in the same `settings` table as everything else, so they show up
 * in the admin settings API and are audited on change like any other key.
 * Secrets never come through here — see settings.ts for the encrypted path.
 */

import { stmts } from "./db.js";

export function readSetting(key: string): string | null {
  const row = stmts.settings.get.get(key);
  if (!row || row.value == null || row.is_secret) return null;
  return row.value;
}

export function writeSetting(key: string, value: string): void {
  if (value === "") {
    stmts.settings.delete.run(key);
    return;
  }
  stmts.settings.upsert.run({ key, value, is_secret: 0, updated_at: Date.now() });
}

function readJson<T>(key: string, fallback: T): T {
  const raw = readSetting(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

// ── Orientation ────────────────────────────────────────────────────────────

/**
 * `off`    — no orientation; members go straight to the dashboard.
 * `answer` — every required question must be answered, any score gets through.
 * `pass`   — must also score at or above the pass mark, else retry.
 */
export type Gating = "off" | "answer" | "pass";

export type OnboardingVideo = {
  /** `upload` → `src` is a media filename served by /auth/media/:name.
   *  `url`    → `src` is an external link (YouTube, Vimeo, a CDN file). */
  kind: "upload" | "url";
  src: string;
  title: string;
};

export type OnboardingConfig = {
  gating: Gating;
  passMark: number; // percent, 0-100
  maxAttempts: number; // 0 = unlimited
  video: OnboardingVideo | null;
};

export const ONBOARDING_KEYS = {
  gating: "onboarding.gating",
  passMark: "onboarding.pass_mark",
  maxAttempts: "onboarding.max_attempts",
  video: "onboarding.video"
} as const;

export function onboardingConfig(): OnboardingConfig {
  const g = readSetting(ONBOARDING_KEYS.gating);
  const gating: Gating = g === "answer" || g === "pass" || g === "off" ? g : "off";

  const pass = Number(readSetting(ONBOARDING_KEYS.passMark));
  const passMark = Number.isFinite(pass) ? Math.min(100, Math.max(0, pass)) : 70;

  const att = Number(readSetting(ONBOARDING_KEYS.maxAttempts));
  const maxAttempts = Number.isFinite(att) && att >= 0 ? Math.floor(att) : 0;

  const v = readJson<Partial<OnboardingVideo>>(ONBOARDING_KEYS.video, {});
  const video: OnboardingVideo | null =
    v && typeof v.src === "string" && v.src.trim() !== ""
      ? {
          kind: v.kind === "url" ? "url" : "upload",
          src: v.src.trim(),
          title: typeof v.title === "string" ? v.title : ""
        }
      : null;

  return { gating, passMark, maxAttempts, video };
}

// ── Dashboard theme ────────────────────────────────────────────────────────

export type DashboardTheme = {
  kind: "default" | "gradient" | "image" | "video";
  /** Two or more CSS colors for `kind: "gradient"`. */
  colors: string[];
  /** Gradient angle in degrees. */
  angle: number;
  /** Media filename (served by /auth/media/:name) or an absolute URL. */
  src: string;
  /** Whether `src` is one of our uploads or an external link. */
  srcKind: "upload" | "url";
  /** 0-100 black scrim over the background, so foreground text stays legible. */
  dim: number;
  /** Blur radius in px applied to image/video backgrounds. */
  blur: number;
};

export const THEME_KEY = "theme.dashboard";

export const DEFAULT_THEME: DashboardTheme = {
  kind: "default",
  colors: ["#0b0b12", "#12081f"],
  angle: 160,
  src: "",
  srcKind: "upload",
  dim: 40,
  blur: 0
};

export function dashboardTheme(): DashboardTheme {
  const raw = readJson<Partial<DashboardTheme>>(THEME_KEY, {});
  const kind =
    raw.kind === "gradient" || raw.kind === "image" || raw.kind === "video" ? raw.kind : "default";
  const colors =
    Array.isArray(raw.colors) && raw.colors.every((c) => typeof c === "string") && raw.colors.length >= 2
      ? (raw.colors as string[]).slice(0, 4)
      : DEFAULT_THEME.colors;
  const num = (v: unknown, def: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;

  return {
    kind,
    colors,
    angle: num(raw.angle, DEFAULT_THEME.angle, 0, 360),
    src: typeof raw.src === "string" ? raw.src : "",
    srcKind: raw.srcKind === "url" ? "url" : "upload",
    dim: num(raw.dim, DEFAULT_THEME.dim, 0, 100),
    blur: num(raw.blur, DEFAULT_THEME.blur, 0, 40)
  };
}

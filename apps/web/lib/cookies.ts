/**
 * Tiny `document.cookie` helpers. Client-only — all functions safely no-op
 * when called during SSR / build.
 */

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name.replace(/[.$?*|{}()[\]\\/+^]/g, "\\$&") + "=([^;]*)")
  );
  return match ? decodeURIComponent(match[1]!) : null;
}

type SetCookieOptions = {
  /** Lifetime in seconds. Defaults to 30 days. Pass 0 to delete. */
  maxAgeSeconds?: number;
  /** Defaults to "/" so the cookie is readable across every route. */
  path?: string;
  /** Defaults to "lax" — good default for first-party-only cookies. */
  sameSite?: "lax" | "strict" | "none";
};

export function setCookie(
  name: string,
  value: string,
  opts: SetCookieOptions = {}
) {
  if (typeof document === "undefined") return;
  const {
    maxAgeSeconds = 60 * 60 * 24 * 30,
    path = "/",
    sameSite = "lax"
  } = opts;
  const secure = typeof window !== "undefined" && window.location.protocol === "https:";
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${maxAgeSeconds}`,
    `Path=${path}`,
    `SameSite=${sameSite}`
  ];
  if (secure) parts.push("Secure");
  document.cookie = parts.join("; ");
}

export function deleteCookie(name: string, path = "/") {
  setCookie(name, "", { maxAgeSeconds: 0, path });
}

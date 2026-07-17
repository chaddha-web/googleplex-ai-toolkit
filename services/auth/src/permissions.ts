/**
 * Admin capabilities — the granular powers the main admin (founder) can grant
 * to sub-admins. The founder implicitly holds every capability; a sub-admin
 * holds only what's been toggled on for them.
 *
 * Capabilities ride inside the access token (`perms`) so both this service and
 * the wallet service can enforce them without a round-trip. Because tokens are
 * short-lived (15 min), a permission change takes effect on the next refresh.
 */

export const CAPABILITIES = [
  "withdrawals", // approve/reject the withdrawal review queue
  "suspend", // suspend / unsuspend members
  "flush", // sweep member deposits to treasury (moves real funds)
  "settings", // AI/wallet secrets, withdrawal limits, audit-log view
  "comms", // send email campaigns to members
  "moderation" // moderate the Circle (questions + comments)
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const CAP_SET = new Set<string>(CAPABILITIES);

/** Main admin (founder) — implicitly holds every capability. Defaults to the
 *  first ADMIN_EMAILS entry when FOUNDER_EMAIL isn't set (matches settings.ts). */
export const FOUNDER_EMAIL = (
  process.env.FOUNDER_EMAIL ||
  (process.env.ADMIN_EMAILS ?? "").split(",")[0] ||
  ""
)
  .trim()
  .toLowerCase();

export function isFounder(email: string | null | undefined): boolean {
  return !!FOUNDER_EMAIL && (email ?? "").trim().toLowerCase() === FOUNDER_EMAIL;
}

/** Parse a stored permissions JSON string into a clean capability list. */
export function parsePerms(json: string | null | undefined): Capability[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.filter((c): c is Capability => typeof c === "string" && CAP_SET.has(c));
  } catch {
    return [];
  }
}

/** Serialize a capability list for storage (deduped, only valid slugs). */
export function serializePerms(caps: unknown): string {
  if (!Array.isArray(caps)) return "[]";
  const clean = [...new Set(caps.filter((c): c is Capability => typeof c === "string" && CAP_SET.has(c)))];
  return JSON.stringify(clean);
}

/** The effective capabilities for a user: founder → all; admin → stored subset;
 *  everyone else → none. */
export function permsForUser(user: {
  email: string;
  role: string;
  permissions?: string | null;
}): Capability[] {
  if (isFounder(user.email)) return [...CAPABILITIES];
  if (user.role !== "admin") return [];
  return parsePerms(user.permissions);
}

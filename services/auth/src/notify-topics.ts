/**
 * Notification topics — what an admin can subscribe their own Telegram to.
 *
 * The founder may receive everything. A sub-admin is capped to the operational
 * events they are actually expected to act on: a new member, a login alert, and
 * money leaving. Everything else (settings changes, service restarts, admin
 * promotions, content edits) is founder-only, because those are the events that
 * would tell a sub-admin how the platform is administered.
 *
 * The cap is enforced when recipients are resolved, NOT just hidden in the UI —
 * an old subscription row, or a hand-crafted request, still cannot widen it.
 */

export const TOPICS = [
  "signup", // a new member registered
  "login", // login alert / new device
  "withdrawal", // withdrawal requested, approved, rejected, sent
  "money", // treasury flush, sweeps, deposits, sales
  "members", // suspend / unsuspend / demo accounts
  "admin", // promote / demote / permission changes
  "content", // orientation, theme, media, campaigns
  "settings", // configuration changes
  "system" // 5xx, service start/stop — the noisy ops channel
] as const;

export type Topic = (typeof TOPICS)[number];

const TOPIC_SET = new Set<string>(TOPICS);

/** The only topics a sub-admin may ever receive. */
export const SUBADMIN_TOPICS: Topic[] = ["signup", "login", "withdrawal"];

const SUBADMIN_SET = new Set<string>(SUBADMIN_TOPICS);

export const TOPIC_LABELS: Record<Topic, string> = {
  signup: "New signups",
  login: "Login alerts",
  withdrawal: "Withdrawals",
  money: "Treasury & sales",
  members: "Member actions",
  admin: "Admin changes",
  content: "Content & campaigns",
  settings: "Settings changes",
  system: "System health"
};

export function isTopic(v: unknown): v is Topic {
  return typeof v === "string" && TOPIC_SET.has(v);
}

/** Which topics this admin is ALLOWED to receive, before their own choices. */
export function allowedTopics(isFounder: boolean): Topic[] {
  return isFounder ? [...TOPICS] : [...SUBADMIN_TOPICS];
}

/** Parse a stored subscription list, dropping anything unknown. */
export function parseTopics(json: string | null | undefined): Topic[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter(isTopic) : [];
  } catch {
    return [];
  }
}

/**
 * Clamp a requested subscription to what this admin may have. Returns the
 * deduped, valid, permitted list — the single place the sub-admin cap is
 * applied, so both the API and the fan-out agree.
 */
export function clampTopics(requested: unknown, isFounder: boolean): Topic[] {
  const arr = Array.isArray(requested) ? requested : [];
  const clean = new Set<Topic>();
  for (const t of arr) {
    if (!isTopic(t)) continue;
    if (!isFounder && !SUBADMIN_SET.has(t)) continue;
    clean.add(t);
  }
  return [...clean];
}

/** Serialize for storage. */
export function serializeTopics(topics: Topic[]): string {
  return JSON.stringify(topics);
}

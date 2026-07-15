// Live "using the platform right now" presence for AUTHENTICATED members.
// In-memory only (like presence.ts): a container restart re-populates within one
// heartbeat. Keyed by user id. We store the member's last-seen, the section they
// are in, and COARSE geo derived from the request IP — never the raw IP, matching
// the presence.ts privacy policy.
import { lookupGeo } from "./geoip.js";

type Entry = {
  last: number;
  section: string;
  country: string;
  region: string;
};

const TTL_MS = 60_000; // a member is "online" if seen within the last minute
const MAX = 50_000; // bound memory; evict oldest on overflow
const store = new Map<string, Entry>();

/** Record an authenticated heartbeat for a member. `section` is a coarse
 *  label of where they are (e.g. "/wallet") — capped so it can't grow. */
export function recordActivity(
  userId: string,
  section: string | null | undefined,
  ip: string | null | undefined,
  now = Date.now()
): void {
  if (!store.has(userId) && store.size >= MAX) {
    let oldestKey: string | null = null;
    let oldest = Infinity;
    for (const [k, v] of store) if (v.last < oldest) { oldest = v.last; oldestKey = k; }
    if (oldestKey) store.delete(oldestKey);
  }
  const hit = lookupGeo(ip);
  store.set(userId, {
    last: now,
    section: (section || "").slice(0, 64),
    country: hit?.country || "",
    region: hit?.region || ""
  });
}

export type OnlineMember = {
  userId: string;
  section: string;
  country: string;
  region: string;
  lastSeen: number;
};

/** Snapshot of everyone active within the TTL. Sweeps expired rows on read. */
export function onlineMembers(now = Date.now()): OnlineMember[] {
  const out: OnlineMember[] = [];
  for (const [userId, v] of store) {
    if (now - v.last > TTL_MS) { store.delete(userId); continue; }
    out.push({ userId, section: v.section, country: v.country, region: v.region, lastSeen: v.last });
  }
  return out;
}

/** Set of user ids currently online (for enriching the session list). */
export function onlineUserIds(now = Date.now()): Set<string> {
  const set = new Set<string>();
  for (const [userId, v] of store) {
    if (now - v.last > TTL_MS) { store.delete(userId); continue; }
    set.add(userId);
  }
  return set;
}

export function onlineCount(now = Date.now()): number {
  return onlineUserIds(now).size;
}

/** Test-only reset. */
export function _resetActivity(): void { store.clear(); }

// Ephemeral anonymous "viewing now" presence. In-memory only: a container
// restart just re-populates within one heartbeat. The client IP is used solely
// for the offline geoip lookup and is NEVER stored — only country/region/rounded
// coords + a timestamp — so nothing here is a PII store.
import { lookupGeo } from "./geoip.js";

type Entry = { country: string; region: string; lat: number; lng: number; last: number };

const TTL_MS = 60_000;
const MAX = 20_000; // bound memory / abuse: evict oldest on overflow
const store = new Map<string, Entry>();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidVid(vid: unknown): vid is string {
  return typeof vid === "string" && UUID_RE.test(vid);
}

/** Record a heartbeat for an anonymous visitor id. */
export function recordPresence(vid: string, ip: string | null | undefined, now = Date.now()): void {
  const hit = lookupGeo(ip);
  if (!hit || !hit.ll) return; // unlocatable (private/unknown) — ignore
  if (!store.has(vid) && store.size >= MAX) {
    let oldestKey: string | null = null;
    let oldest = Infinity;
    for (const [k, v] of store) if (v.last < oldest) { oldest = v.last; oldestKey = k; }
    if (oldestKey) store.delete(oldestKey);
  }
  store.set(vid, {
    country: hit.country,
    region: hit.region || "",
    lat: Math.round(hit.ll[0]),
    lng: Math.round(hit.ll[1]),
    last: now
  });
}

export type ViewerCluster = {
  country: string; region: string; lat: number; lng: number; count: number;
};

/** Live viewers aggregated by rounded cell. Sweeps expired entries on read. */
export function activeViewers(now = Date.now()): { clusters: ViewerCluster[]; total: number } {
  const clusters = new Map<string, ViewerCluster>();
  let total = 0;
  for (const [k, v] of store) {
    if (now - v.last > TTL_MS) { store.delete(k); continue; }
    total++;
    const key = `${v.country}|${v.region}|${v.lat}|${v.lng}`;
    const cur = clusters.get(key);
    if (cur) cur.count++;
    else clusters.set(key, { country: v.country, region: v.region, lat: v.lat, lng: v.lng, count: 1 });
  }
  return { clusters: [...clusters.values()], total };
}

/** Test-only reset. */
export function _resetPresence(): void { store.clear(); }

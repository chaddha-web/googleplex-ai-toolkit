// IP→geo lookup.
//
// Two tiers:
//   • `lookupGeo`  — offline geoip-lite. Synchronous, zero-latency, no quota.
//     Stays the hot path for presence pings and the globe, which are
//     high-volume and only need country/region granularity.
//   • `resolveGeo` — ip2location.io, for the surfaces where a wrong or missing
//     city is actually visible (admin session "Area", login-location alerts).
//     Async, cached, and falls back to `lookupGeo` on ANY failure — missing
//     key, timeout, quota exhaustion, malformed response.
//
// ⚠ Privacy: `resolveGeo` sends the member's IP to a third party. `lookupGeo`
// does not — it resolves entirely on the VPS. Which one a call site uses is a
// deliberate choice, not an implementation detail.
import geoip from "geoip-lite";

/** Normalised geo shape — mirrors geoip-lite so the two tiers are swappable. */
export type GeoHit = {
  country: string;
  region: string;
  city: string;
  ll?: [number, number];
};

/** Strip the IPv4-mapped IPv6 prefix ("::ffff:a.b.c.d"). */
function normaliseIp(ip: string): string {
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

/**
 * Private, loopback, link-local and CGNAT ranges. Never worth a paid lookup —
 * and never worth sending to a third party.
 */
function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  if (p[0] === 10 || p[0] === 127) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 172 && p[1]! >= 16 && p[1]! <= 31) return true;
  if (p[0] === 169 && p[1] === 254) return true;
  if (p[0] === 100 && p[1]! >= 64 && p[1]! <= 127) return true;
  return false;
}

/**
 * Hardened offline lookup: normalises IPv4-mapped IPv6 and never throws — a bad
 * IP just yields null. Shared by the geo endpoint (online + member placement)
 * and the presence store.
 */
export function lookupGeo(
  ip: string | null | undefined
): ReturnType<typeof geoip.lookup> {
  if (!ip) return null;
  try {
    return geoip.lookup(normaliseIp(ip));
  } catch {
    return null;
  }
}

/** Offline result → the normalised shape. */
function fromOffline(ip: string | null | undefined): GeoHit | null {
  const hit = lookupGeo(ip);
  if (!hit) return null;
  return {
    country: hit.country || "",
    region: hit.region || "",
    city: hit.city || "",
    ll: hit.ll as [number, number] | undefined
  };
}

// ── ip2location.io ──────────────────────────────────────────────────────────

const IP2LOCATION_KEY = process.env.IP2LOCATION_API_KEY || "";
const TIMEOUT_MS = Number(process.env.IP2LOCATION_TIMEOUT_MS ?? 3000);
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 5000;

// In-memory only — an IP→geo cache is never persisted (see [[Wallet Security
// Model]]: we don't keep raw IPs at rest beyond the session row that already
// holds one). Dies with the process; that's intended.
const cache = new Map<string, { at: number; hit: GeoHit | null }>();

/**
 * How many consecutive provider failures we've seen. After a run of them we
 * stop calling out for a while — if the key is revoked or the quota is spent,
 * every lookup would otherwise pay the full timeout before falling back.
 */
let consecutiveFailures = 0;
let mutedUntil = 0;
const MUTE_AFTER = 3;
const MUTE_MS = 5 * 60 * 1000;

type Ip2LocationResponse = {
  country_code?: string;
  region_name?: string;
  city_name?: string;
  latitude?: number;
  longitude?: number;
  error?: unknown;
};

async function fetchIp2Location(ip: string): Promise<GeoHit | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const url =
      "https://api.ip2location.io/?key=" +
      encodeURIComponent(IP2LOCATION_KEY) +
      "&ip=" +
      encodeURIComponent(ip);
    const res = await fetch(url, { signal: ac.signal, headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as Ip2LocationResponse;
    if (!data || data.error || !data.country_code) return null;
    const lat = Number(data.latitude);
    const lon = Number(data.longitude);
    return {
      country: data.country_code,
      region: data.region_name || "",
      city: data.city_name || "",
      ll: Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : undefined
    };
  } catch {
    return null; // timeout, DNS, TLS, bad JSON — all the same to the caller
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Best-available geo for an IP: ip2location.io when it's configured and
 * healthy, otherwise the offline database. Never throws, never blocks longer
 * than TIMEOUT_MS, and always returns the offline answer rather than nothing.
 */
export async function resolveGeo(ip: string | null | undefined): Promise<GeoHit | null> {
  if (!ip) return null;
  const norm = normaliseIp(ip);
  if (isPrivateIp(norm)) return null;

  const cached = cache.get(norm);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.hit;

  if (!IP2LOCATION_KEY || Date.now() < mutedUntil) return fromOffline(norm);

  const hit = await fetchIp2Location(norm);

  if (hit) {
    consecutiveFailures = 0;
    if (cache.size >= CACHE_MAX) {
      // Cheap eviction: drop the oldest inserted key (Map preserves order).
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(norm, { at: Date.now(), hit });
    return hit;
  }

  if (++consecutiveFailures >= MUTE_AFTER) {
    mutedUntil = Date.now() + MUTE_MS;
    consecutiveFailures = 0;
  }
  return fromOffline(norm);
}

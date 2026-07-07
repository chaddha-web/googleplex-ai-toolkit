// Offline IP→geo lookup — no DB dependency, so pure-logic modules (presence)
// can use it without pulling in the SQLite layer.
import geoip from "geoip-lite";

/**
 * Hardened lookup: normalises IPv4-mapped IPv6 ("::ffff:a.b.c.d") and never
 * throws — a bad IP just yields null. Shared by the geo endpoint (online +
 * member placement) and the presence store.
 */
export function lookupGeo(
  ip: string | null | undefined
): ReturnType<typeof geoip.lookup> {
  if (!ip) return null;
  const norm = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  try {
    return geoip.lookup(norm);
  } catch {
    return null;
  }
}

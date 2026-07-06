import type { FastifyInstance } from "fastify";
import geoip from "geoip-lite";
import { stmts } from "../db.js";
import { verifyAccessToken } from "../jwt.js";

/**
 * Offline IP→geo lookup, hardened: normalises IPv4-mapped IPv6 (Traefik/Node
 * can hand us "::ffff:1.2.3.4") and never throws — a bad IP just yields null.
 * Shared so every geo path (online sessions, member placement, presence) uses
 * identical semantics.
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

/**
 * GET /auth/admin/geo — aggregate customer locations for the admin globe.
 *
 * Privacy by construction: the response carries ONLY country/state aggregates
 * with counts. No IPs, ids, or emails ever leave this handler, and lat/lng is
 * rounded to whole degrees (~100 km) so nothing is pinpointable. The IP→geo
 * lookup itself is geoip-lite — fully offline, so IPs never leave the VPS.
 */
export async function geoRoutes(app: FastifyInstance) {
  app.get("/auth/admin/geo", async (req, reply) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Missing bearer token." });
    }
    const claims = await verifyAccessToken(header.slice(7).trim());
    if (!claims) return reply.code(401).send({ error: "Invalid token." });
    const me = stmts.user.byId.get(claims.sub);
    if (!me || me.role !== "admin") {
      return reply.code(403).send({ error: "Admin only." });
    }

    // ── Layer 1: all customers by self-reported country ────────────────────
    const users = stmts.user.listAll.all() as Array<{
      id: string;
      country: string | null;
    }>;
    const byCountry = new Map<string, number>();
    for (const u of users) {
      const c = (u.country ?? "").trim();
      if (!c || c === "Other") continue;
      byCountry.set(c, (byCountry.get(c) ?? 0) + 1);
    }
    const customers = [...byCountry.entries()].map(([country, count]) => ({
      country,
      count
    }));

    // ── Layer 2: active sessions, geo-located to country + state ───────────
    // listAllActive is newest-first, so the first row per user is their
    // latest session — dedupe on user_id.
    const rows = stmts.refresh.listAllActive.all(Date.now()) as Array<{
      user_id: string;
      ip: string | null;
    }>;
    const seen = new Set<string>();
    const clusters = new Map<
      string,
      { country: string; region: string; lat: number; lng: number; count: number }
    >();
    let activeTotal = 0;
    for (const r of rows) {
      if (seen.has(r.user_id)) continue;
      seen.add(r.user_id);
      if (!r.ip) continue;
      const hit = lookupGeo(r.ip);
      if (!hit || !hit.ll) continue; // private/unknown IP — skip silently
      activeTotal++;
      const lat = Math.round(hit.ll[0]);
      const lng = Math.round(hit.ll[1]);
      const key = `${hit.country}|${hit.region}|${lat}|${lng}`;
      const cur = clusters.get(key);
      if (cur) cur.count++;
      else
        clusters.set(key, {
          country: hit.country,
          region: hit.region || "",
          lat,
          lng,
          count: 1
        });
    }

    return reply.send({
      customers,
      active: [...clusters.values()],
      totals: { customers: users.length, active: activeTotal }
    });
  });
}

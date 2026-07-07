import type { FastifyInstance } from "fastify";
import { stmts } from "../db.js";
import { verifyAccessToken } from "../jwt.js";
import { activeViewers } from "../presence.js";
import { lookupGeo } from "../geoip.js";

export { lookupGeo }; // back-compat for any importer of geo.ts

/**
 * GET /auth/admin/geo — aggregate customer locations for the admin globe.
 *
 * Privacy by construction: the response carries ONLY country/state aggregates
 * with counts + a human label. No IPs, ids, or emails ever leave this handler,
 * and lat/lng is rounded to whole degrees (~100 km) so nothing is pinpointable.
 * All geoip is offline (geoip-lite), so IPs never leave the VPS.
 *
 * Three layers, all as ready-to-plot cells `{lat, lng, count, label}`:
 *  - members  — every member, placed from their latest session IP when we have
 *               one, else their self-reported country centroid.
 *  - online   — members with a live session right now.
 *  - viewers  — anonymous visitors currently on the public pages.
 */

// Centroids for the countries offered at onboarding ("Other" is unplaceable).
const CENTROIDS: Record<string, [number, number]> = {
  India: [21, 78], "United States": [38, -97], "United Kingdom": [54, -2],
  Canada: [56, -106], Australia: [-25, 134], Singapore: [1.35, 103.8],
  "United Arab Emirates": [24, 54], Germany: [51, 10], France: [46, 2],
  Netherlands: [52.2, 5.3], Brazil: [-10, -52], Mexico: [23, -102],
  Japan: [36, 138], "South Korea": [36, 128], Nigeria: [9, 8],
  "South Africa": [-29, 24]
};

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
function countryName(code: string): string {
  try { return regionNames.of(code) ?? code; } catch { return code; }
}
function placeLabel(country: string, region: string): string {
  const name = countryName(country);
  return region ? `${region}, ${name}` : name;
}

type Cell = { lat: number; lng: number; count: number; label: string };

function addCell(map: Map<string, Cell>, lat: number, lng: number, label: string) {
  const key = `${lat}|${lng}`;
  const cur = map.get(key);
  if (cur) cur.count++;
  else map.set(key, { lat, lng, count: 1, label });
}

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

    // Latest IP per user for precise placement.
    const ipRows = stmts.refresh.latestIpByUser.all() as Array<{ user_id: string; ip: string | null }>;
    const ipByUser = new Map<string, string>();
    for (const r of ipRows) if (r.ip) ipByUser.set(r.user_id, r.ip);

    const users = stmts.user.listAll.all() as Array<{ id: string; country: string | null }>;

    // ── Members: IP-precise where possible, else self-reported centroid ──────
    const members = new Map<string, Cell>();
    for (const u of users) {
      const ip = ipByUser.get(u.id);
      const hit = ip ? lookupGeo(ip) : null;
      if (hit && hit.ll) {
        addCell(members, Math.round(hit.ll[0]), Math.round(hit.ll[1]), placeLabel(hit.country, hit.region || ""));
        continue;
      }
      const c = (u.country ?? "").trim();
      const ll = c && c !== "Other" ? CENTROIDS[c] : undefined;
      if (ll) addCell(members, ll[0], ll[1], c);
      // else: unplaceable (Other + no session IP) — skipped.
    }

    // ── Online: newest active session per user, geo-located ──────────────────
    const rows = stmts.refresh.listAllActive.all(Date.now()) as Array<{ user_id: string; ip: string | null }>;
    const seen = new Set<string>();
    const online = new Map<string, Cell>();
    let onlineTotal = 0;
    for (const r of rows) {
      if (seen.has(r.user_id)) continue;
      seen.add(r.user_id);
      const hit = lookupGeo(r.ip);
      if (!hit || !hit.ll) continue;
      onlineTotal++;
      addCell(online, Math.round(hit.ll[0]), Math.round(hit.ll[1]), placeLabel(hit.country, hit.region || ""));
    }

    // ── Viewers: anonymous live presence ────────────────────────────────────
    const { clusters, total: viewersTotal } = activeViewers();
    const viewers: Cell[] = clusters.map((v) => ({
      lat: v.lat, lng: v.lng, count: v.count, label: placeLabel(v.country, v.region)
    }));

    const memberCells = [...members.values()];
    return reply.send({
      members: memberCells,
      online: [...online.values()],
      viewers,
      totals: {
        members: memberCells.reduce((s, c) => s + c.count, 0),
        online: onlineTotal,
        viewers: viewersTotal
      }
    });
  });
}

import type { FastifyInstance } from "fastify";
import { db, stmts } from "../db.js";
import { verifyAccessToken } from "../jwt.js";
import { recordActivity, onlineMembers, onlineUserIds } from "../session-activity.js";
import { actingAgainstFounder, isFounder } from "../permissions.js";
import { notify } from "../notify.js";

/**
 * Session management. A "session" is one row in refresh_tokens; the row id
 * is the session id we expose to UIs. The plaintext refresh token (the
 * "key") is hashed at issue time and never stored — so the UI shows only
 * the session id + metadata (UA / IP / created / expires). Users can list
 * + revoke their own sessions; admins can list + revoke any session.
 *
 * Revoking a session sets revoked_at on its row AND on every other row
 * with the same family_id, so any sibling token derived from the same
 * lineage is killed in one shot (matches the rotation defense already
 * implemented in the refresh flow).
 */

// Compact projection sent over the wire. Note: no token_hash, ever.
type SessionPublic = {
  id: string;
  user_id: string;
  family_id: string;
  user_agent: string | null;
  ip: string | null;
  created_at: number;
  expires_at: number;
  revoked_at: number | null;
  last_used_at: number | null;
  current?: boolean;
};
type SessionAdminPublic = SessionPublic & {
  email: string;
  first_name: string;
  last_name: string;
  code11: string;
  role: "user" | "admin";
  online?: boolean;
  isFounder?: boolean; // row belongs to the founder — UI hides destructive actions for sub-admins
};

export async function sessionsRoutes(app: FastifyInstance) {
  const requireUser = async (req: any, reply: any) => {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) {
      reply.code(401).send({ error: "Missing bearer token." });
      return null;
    }
    const claims = await verifyAccessToken(h.slice(7).trim());
    if (!claims) {
      reply.code(401).send({ error: "Invalid token." });
      return null;
    }
    const u = stmts.user.byId.get(claims.sub);
    if (!u) {
      reply.code(401).send({ error: "User gone." });
      return null;
    }
    return u;
  };

  // ── GET /auth/sessions — the caller's own active sessions ──────────────
  // We accept a body / query hint of `currentRefresh` so the UI can mark
  // which row is "this device". It's optional; without it nothing is
  // marked. We compare hashes server-side to avoid leaking the plaintext
  // refresh value back to the client.
  app.get("/auth/sessions", async (req: any, reply) => {
    const me = await requireUser(req, reply);
    if (!me) return;
    const rows = stmts.refresh.listForUser.all(me.id, Date.now());
    const currentId = currentSessionIdFromHeader(req);
    return reply.send({
      sessions: rows.map((r): SessionPublic => ({
        id: r.id,
        user_id: r.user_id,
        family_id: r.family_id,
        user_agent: r.user_agent,
        ip: r.ip,
        created_at: r.created_at,
        expires_at: r.expires_at,
        revoked_at: r.revoked_at,
        last_used_at: r.last_used_at ?? r.created_at,
        current: r.id === currentId
      }))
    });
  });

  // ── POST /auth/sessions/:id/revoke — user revokes own ──────────────────
  app.post("/auth/sessions/:id/revoke", async (req: any, reply) => {
    const me = await requireUser(req, reply);
    if (!me) return;
    const row = stmts.refresh.byId.get(req.params.id);
    if (!row || row.user_id !== me.id) {
      // Indistinguishable from "doesn't exist" so we never confirm another
      // user's session id by error code.
      return reply.code(404).send({ error: "No such session." });
    }
    if (row.revoked_at) {
      return reply.send({ ok: true, alreadyRevoked: true });
    }
    const now = Date.now();
    stmts.refresh.revokeFamily.run(now, row.family_id);
    return reply.send({ ok: true });
  });

  // ── POST /auth/sessions/revoke-others — kill everything except current ─
  // Useful "sign out everywhere else" button. Caller passes the
  // X-Current-Session header (or we skip nothing if absent — caller will
  // re-login from their device since their own row was killed too).
  app.post("/auth/sessions/revoke-others", async (req: any, reply) => {
    const me = await requireUser(req, reply);
    if (!me) return;
    const currentId = currentSessionIdFromHeader(req);
    const rows = stmts.refresh.listForUser.all(me.id, Date.now());
    const now = Date.now();
    let killed = 0;
    for (const r of rows) {
      if (r.id === currentId) continue;
      stmts.refresh.revokeFamily.run(now, r.family_id);
      killed++;
    }
    return reply.send({ ok: true, killed });
  });

  // ── GET /auth/admin/sessions ───────────────────────────────────────────
  // Admin view. Query params:
  //   ?scope=active|recent   (default 'active')
  //   ?userId=<id>           (optional filter)
  //   ?q=<email-or-code-substring>  (case-insensitive contains)
  app.get("/auth/admin/sessions", async (req: any, reply) => {
    const me = await requireUser(req, reply);
    if (!me) return;
    if (me.role !== "admin") return reply.code(403).send({ error: "Admin only." });
    const scope = String(req.query?.scope || "active");
    let rows: any[];
    if (scope === "recent") {
      rows = stmts.refresh.listAllRecent.all();
    } else {
      rows = stmts.refresh.listAllActive.all(Date.now());
    }
    const userId = req.query?.userId ? String(req.query.userId) : null;
    const q = String(req.query?.q || "").toLowerCase().trim();
    const online = onlineUserIds();
    const filtered = rows
      .filter((r) => (userId ? r.user_id === userId : true))
      .filter((r) =>
        q
          ? (r.email || "").toLowerCase().includes(q) ||
            (r.code11 || "").toLowerCase().includes(q) ||
            (r.ip || "").toLowerCase().includes(q)
          : true
      )
      .map(
        (r): SessionAdminPublic => ({
          id: r.id,
          user_id: r.user_id,
          family_id: r.family_id,
          user_agent: r.user_agent,
          ip: r.ip,
          created_at: r.created_at,
          expires_at: r.expires_at,
          revoked_at: r.revoked_at,
          last_used_at: r.last_used_at ?? r.created_at,
          email: r.email,
          first_name: r.first_name,
          last_name: r.last_name,
          code11: r.code11,
          role: r.role,
          online: online.has(r.user_id),
          isFounder: isFounder(r.email)
        })
      );
    return reply.send({ sessions: filtered, scope, onlineCount: online.size });
  });

  // ── GET /auth/admin/online — members actively using the platform NOW ────
  // Backed by the in-memory authed heartbeat. Joins user info for display.
  app.get("/auth/admin/online", async (req: any, reply) => {
    const me = await requireUser(req, reply);
    if (!me) return;
    if (me.role !== "admin") return reply.code(403).send({ error: "Admin only." });
    const members = onlineMembers()
      .map((m) => {
        const u = stmts.user.byId.get(m.userId);
        if (!u) return null;
        return {
          userId: m.userId,
          email: u.email,
          code11: u.code11,
          firstName: u.first_name,
          lastName: u.last_name,
          role: u.role,
          section: m.section,
          country: m.country,
          region: m.region,
          lastSeen: m.lastSeen
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.lastSeen - a.lastSeen);
    return reply.send({ members, count: members.length });
  });

  // ── POST /auth/session/heartbeat — authed "I'm using the app" ping ──────
  // Records live presence + bumps the current session's durable last-active.
  app.post(
    "/auth/session/heartbeat",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req: any, reply) => {
      const me = await requireUser(req, reply);
      if (!me) return;
      const section =
        typeof req.body?.section === "string" ? req.body.section : undefined;
      recordActivity(me.id, section, req.ip);
      const sid = currentSessionIdFromHeader(req);
      if (sid) {
        const row = stmts.refresh.byId.get(sid);
        if (row && row.user_id === me.id && row.revoked_at === null) {
          stmts.refresh.touch.run(Date.now(), sid);
        }
      }
      return reply.send({ ok: true });
    }
  );

  // ── POST /auth/admin/sessions/:id/revoke — admin revokes any ───────────
  app.post("/auth/admin/sessions/:id/revoke", async (req: any, reply) => {
    const me = await requireUser(req, reply);
    if (!me) return;
    if (me.role !== "admin") return reply.code(403).send({ error: "Admin only." });
    const row = stmts.refresh.byId.get(req.params.id);
    if (!row) return reply.code(404).send({ error: "No such session." });
    if (row.revoked_at) return reply.send({ ok: true, alreadyRevoked: true });
    const target = stmts.user.byId.get(row.user_id);
    // Hierarchy: the founder is untouchable by sub-admins. Without this, any
    // role=admin could kill the founder's session.
    if (actingAgainstFounder(me.email, target?.email)) {
      return reply.code(403).send({ error: "Not allowed — the founder is above your role." });
    }
    const now = Date.now();
    stmts.refresh.revokeFamily.run(now, row.family_id);
    notify(
      `🗝 <b>Session revoked by admin</b>\n${target?.email ?? row.user_id}\nsession <code>${row.id}</code> · by ${me.email}`
    );
    return reply.send({ ok: true });
  });
}

/**
 * Pull the caller's "current session id" from the X-Current-Session header.
 * The UI computes this once at login (when /auth/refresh returns a new
 * refresh token, we also expose its session id via /auth/me) and pipes it
 * back so we can mark + spare the right row in the listing.
 */
function currentSessionIdFromHeader(req: any): string | null {
  const v = req.headers["x-current-session"];
  if (typeof v !== "string" || !v) return null;
  return v;
}

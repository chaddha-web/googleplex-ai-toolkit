import type { FastifyInstance } from "fastify";
import { stmts } from "../db.js";
import { verifyAccessToken } from "../jwt.js";
import { permsForUser } from "../permissions.js";
import { recordAudit, listAudit } from "../audit.js";

const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;

/**
 * Admin action audit log. Reading it is gated on the "settings" capability
 * (the founder implicitly holds it) since it exposes what every admin has been
 * doing. The wallet service writes its money actions here via the internal
 * endpoint (shared INTERNAL_SERVICE_TOKEN).
 */
export async function auditRoutes(app: FastifyInstance) {
  app.get("/auth/admin/audit", async (req, reply) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return reply.code(401).send({ error: "Missing bearer token." });
    const claims = await verifyAccessToken(header.slice(7).trim());
    if (!claims) return reply.code(401).send({ error: "Invalid or expired token." });
    const me = stmts.user.byId.get(claims.sub);
    if (!me || me.role !== "admin") return reply.code(403).send({ error: "Admin access required." });
    if (!permsForUser(me).includes("settings")) {
      return reply.code(403).send({ error: "You don't have permission to view the audit log." });
    }
    const q = (req.query ?? {}) as { limit?: string };
    const limit = Math.min(Math.max(Number(q.limit) || 200, 1), 500);
    return reply.send({ events: listAudit(limit) });
  });

  // Internal — the wallet service records its money actions (withdrawal
  // approve/reject, treasury flush) into the shared audit log.
  app.post("/internal/audit", async (req, reply) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!INTERNAL_TOKEN || token !== INTERNAL_TOKEN) {
      return reply.code(401).send({ error: "Invalid internal token." });
    }
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (typeof b.action !== "string" || !b.action) {
      return reply.code(400).send({ error: "action required." });
    }
    recordAudit({
      actorId: typeof b.actorId === "string" ? b.actorId : null,
      actorEmail: typeof b.actorEmail === "string" ? b.actorEmail : null,
      action: b.action,
      targetId: typeof b.targetId === "string" ? b.targetId : null,
      targetLabel: typeof b.targetLabel === "string" ? b.targetLabel : null,
      detail: b.detail ?? null
    });
    return reply.send({ ok: true });
  });
}

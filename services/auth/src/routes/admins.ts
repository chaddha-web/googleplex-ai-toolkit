import type { FastifyInstance } from "fastify";
import { stmts } from "../db.js";
import { verifyAccessToken } from "../jwt.js";
import {
  CAPABILITIES,
  isFounder,
  parsePerms,
  serializePerms,
  type Capability
} from "../permissions.js";
import { recordAudit } from "../audit.js";
import { notify } from "../notify.js";

/**
 * Permission manager — the main admin (founder) manages sub-admins and the
 * granular capabilities each one holds. Every route here is founder-only; a
 * sub-admin (even one with the "settings" capability) cannot manage other
 * admins or grant powers.
 */
export async function adminManagerRoutes(app: FastifyInstance) {
  // Resolve the caller and require they be the founder.
  const requireFounder = async (req: any, reply: any) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      reply.code(401).send({ error: "Missing bearer token." });
      return null;
    }
    const claims = await verifyAccessToken(header.slice(7).trim());
    if (!claims) {
      reply.code(401).send({ error: "Invalid or expired token." });
      return null;
    }
    const me = stmts.user.byId.get(claims.sub);
    if (!me || me.role !== "admin") {
      reply.code(403).send({ error: "Admin access required." });
      return null;
    }
    if (!isFounder(me.email)) {
      reply.code(403).send({ error: "Only the main admin can manage admins." });
      return null;
    }
    return me;
  };

  // ── List every admin + their granted capabilities ──────────────────────
  app.get("/auth/admin/admins", async (req, reply) => {
    const me = await requireFounder(req, reply);
    if (!me) return;

    const admins = stmts.user.allAdmins.all().map((u) => {
      const founder = isFounder(u.email);
      return {
        id: u.id,
        email: u.email,
        code11: u.code11,
        firstName: u.first_name,
        lastName: u.last_name,
        isFounder: founder,
        // The founder implicitly holds every capability.
        permissions: founder ? [...CAPABILITIES] : parsePerms(u.permissions),
        suspendedAt: u.suspended_at,
        createdAt: u.created_at
      };
    });
    return reply.send({ capabilities: CAPABILITIES, admins });
  });

  // ── Set a sub-admin's capabilities ─────────────────────────────────────
  app.post("/auth/admin/users/:id/permissions", async (req, reply) => {
    const me = await requireFounder(req, reply);
    if (!me) return;

    const { id } = req.params as { id: string };
    const target = stmts.user.byId.get(id);
    if (!target) return reply.code(404).send({ error: "User not found." });
    if (target.role !== "admin") {
      return reply.code(400).send({ error: "That member isn't an admin. Promote them first." });
    }
    if (isFounder(target.email)) {
      return reply.code(400).send({ error: "The main admin always holds every permission." });
    }

    const body = (req.body ?? {}) as { permissions?: unknown };
    if (!Array.isArray(body.permissions)) {
      return reply.code(400).send({ error: "permissions must be an array." });
    }
    const json = serializePerms(body.permissions);
    stmts.user.setPermissions.run({ id: target.id, permissions: json, updated_at: Date.now() });

    const granted = (JSON.parse(json) as Capability[]).join(", ") || "none";
    notify(
      `🔑 <b>Admin permissions updated</b> by ${me.email}\n` +
        `${target.email} · <code>${target.code11}</code>\ngranted: ${granted}`
    );
    recordAudit({
      actorId: me.id,
      actorEmail: me.email,
      action: "admin.permissions",
      targetId: target.id,
      targetLabel: target.code11,
      detail: { granted }
    });
    return reply.send({ ok: true, permissions: JSON.parse(json) as Capability[] });
  });

  // ── Demote a sub-admin back to a regular member ────────────────────────
  app.post("/auth/admin/users/:id/demote", async (req, reply) => {
    const me = await requireFounder(req, reply);
    if (!me) return;

    const { id } = req.params as { id: string };
    const target = stmts.user.byId.get(id);
    if (!target) return reply.code(404).send({ error: "User not found." });
    if (isFounder(target.email)) {
      return reply.code(400).send({ error: "The main admin can't be demoted." });
    }
    if (target.id === me.id) {
      return reply.code(400).send({ error: "You can't demote yourself." });
    }
    if (target.role !== "admin") {
      return reply.code(400).send({ error: "That member isn't an admin." });
    }

    stmts.user.demoteById.run({ id: target.id, updated_at: Date.now() });
    notify(`⬇️ <b>Admin demoted</b> by ${me.email}\n${target.email} · <code>${target.code11}</code>`);
    recordAudit({
      actorId: me.id,
      actorEmail: me.email,
      action: "admin.demote",
      targetId: target.id,
      targetLabel: target.code11,
      detail: { email: target.email }
    });
    return reply.send({ ok: true });
  });
}

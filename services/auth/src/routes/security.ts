import type { FastifyInstance } from "fastify";
import { stmts } from "../db.js";
import { verifyAccessToken, verifySecureToken } from "../jwt.js";
import { permsForUser, isFounder } from "../permissions.js";
import { recordAudit } from "../audit.js";
import { notify } from "../notify.js";

export async function securityRoutes(app: FastifyInstance) {
  /**
   * Public — the "this wasn't me" action from a login-alert email. Verifies the
   * signed, short-lived token, suspends the account, and revokes every session.
   * No auth (the owner may be locked out). Rate-limited; idempotent.
   */
  app.post(
    "/auth/secure-account",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = req.body as { token?: unknown } | undefined;
      if (!body || typeof body.token !== "string") {
        return reply.code(400).send({ error: "Missing token." });
      }
      const claims = await verifySecureToken(body.token);
      if (!claims) return reply.code(401).send({ error: "This link is invalid or has expired." });
      const user = stmts.user.byId.get(claims.sub);
      if (!user) return reply.code(404).send({ error: "Account not found." });

      const now = Date.now();
      if (!user.suspended_at) {
        stmts.user.setSuspended.run({ id: user.id, suspended_at: now, suspended_by: null, updated_at: now });
        stmts.refresh.revokeAllForUser.run(now, user.id);
        notify(
          `🛑 <b>Account suspended</b> (member self-secured via login alert)\n` +
            `${user.email}\nID: <code>${user.code11}</code>`
        , "members");
        recordAudit({
          actorId: user.id,
          actorEmail: user.email,
          action: "member.self_secure",
          targetId: user.id,
          targetLabel: user.code11
        });
      }
      return reply.send({ ok: true, suspended: true });
    }
  );

  /**
   * Main admin (founder) only — suspend a member from the panel: blocks their
   * sign-in and revokes every active session. Cannot suspend yourself or another
   * admin. Idempotent.
   */
  app.post("/auth/admin/users/:id/suspend", async (req, reply) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return reply.code(401).send({ error: "Missing bearer token." });
    const claims = await verifyAccessToken(header.slice(7).trim());
    if (!claims) return reply.code(401).send({ error: "Invalid token." });
    const me = stmts.user.byId.get(claims.sub);
    if (!me || me.role !== "admin") return reply.code(403).send({ error: "Admin only." });
    if (!permsForUser(me).includes("suspend")) {
      return reply.code(403).send({ error: "You don't have permission to suspend members." });
    }

    const { id } = req.params as { id: string };
    const user = stmts.user.byId.get(id);
    if (!user) return reply.code(404).send({ error: "User not found." });
    if (user.id === me.id) return reply.code(400).send({ error: "You can't suspend your own account." });
    if (user.role === "admin") return reply.code(400).send({ error: "Admins can't be suspended." });

    const now = Date.now();
    if (!user.suspended_at) {
      stmts.user.setSuspended.run({ id: user.id, suspended_at: now, suspended_by: me.id, updated_at: now });
      stmts.refresh.revokeAllForUser.run(now, user.id);
      notify(`🛑 <b>Account suspended</b> by ${me.email}\n${user.email} · <code>${user.code11}</code>`);
      recordAudit({
        actorId: me.id,
        actorEmail: me.email,
        action: "member.suspend",
        targetId: user.id,
        targetLabel: user.code11,
        detail: { email: user.email }
      });
    }
    return reply.send({ ok: true, suspended: true });
  });

  /** Admin — lift a suspension so the member can sign in again. */
  app.post("/auth/admin/users/:id/unsuspend", async (req, reply) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return reply.code(401).send({ error: "Missing bearer token." });
    const claims = await verifyAccessToken(header.slice(7).trim());
    if (!claims) return reply.code(401).send({ error: "Invalid token." });
    const me = stmts.user.byId.get(claims.sub);
    if (!me || me.role !== "admin") return reply.code(403).send({ error: "Admin only." });
    if (!permsForUser(me).includes("suspend")) {
      return reply.code(403).send({ error: "You don't have permission to unsuspend members." });
    }

    const { id } = req.params as { id: string };
    const user = stmts.user.byId.get(id);
    if (!user) return reply.code(404).send({ error: "User not found." });
    // Hierarchy: a sub-admin can't overturn a suspension the founder applied.
    // Only the founder can lift what the founder set.
    if (user.suspended_by && !isFounder(me.email)) {
      const setter = stmts.user.byId.get(user.suspended_by);
      if (isFounder(setter?.email)) {
        return reply.code(403).send({ error: "Only the founder can lift a suspension the founder applied." });
      }
    }

    const now = Date.now();
    stmts.user.clearSuspended.run({ id: user.id, updated_at: now });
    notify(`✅ <b>Account unsuspended</b> by ${me.email}\n${user.email} · <code>${user.code11}</code>`, "members");
    recordAudit({
      actorId: me.id,
      actorEmail: me.email,
      action: "member.unsuspend",
      targetId: user.id,
      targetLabel: user.code11,
      detail: { email: user.email }
    });
    return reply.send({ ok: true });
  });
}

import type { FastifyInstance } from "fastify";
import { stmts } from "../db.js";
import { verifyAccessToken } from "../jwt.js";
import * as argon2 from "@node-rs/argon2";

const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;

// Route types
type WalletPasswordBody = { password?: string };
type WalletStatusBody = { status?: string };

export async function walletRoutes(app: FastifyInstance) {
  // Helper for internal service-to-service auth
  const requireInternal = (req: any, reply: any) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      reply.code(401).send({ error: "Missing bearer token." });
      return false;
    }
    const token = header.slice("Bearer ".length).trim();
    if (!INTERNAL_TOKEN || token !== INTERNAL_TOKEN) {
      reply.code(401).send({ error: "Invalid internal service token." });
      return false;
    }
    return true;
  };

  // Helper for normal user auth
  const requireAuth = async (req: any, reply: any) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      reply.code(401).send({ error: "Missing bearer token." });
      return null;
    }
    const token = header.slice("Bearer ".length).trim();
    const claims = await verifyAccessToken(token);
    if (!claims) {
      reply.code(401).send({ error: "Invalid or expired access token." });
      return null;
    }
    const user = stmts.user.byId.get(claims.sub);
    if (!user) {
      reply.code(401).send({ error: "User no longer exists." });
      return null;
    }
    return user;
  };

  // POST /auth/wallet-password
  app.post("/auth/wallet-password", async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return; // reply already sent

    const body = (req.body ?? {}) as WalletPasswordBody;
    const pwd = body.password;

    if (!pwd || pwd.length < 12 || !/[a-zA-Z]/.test(pwd) || !/[0-9]/.test(pwd)) {
      return reply.code(400).send({ error: "Password must be at least 12 characters and contain a letter and a number." });
    }

    const hash = await argon2.hash(pwd, {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4
    });

    const now = Date.now();
    stmts.user.updateWalletPassword.run({
      id: user.id,
      wallet_password_hash: hash,
      wallet_password_set_at: now,
      wallet_status: "pending_initial_deposit",
      wallet_status_changed_at: now,
      updated_at: now
    });

    const updatedUser = stmts.user.byId.get(user.id)!;
    return reply.send({
      ok: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        code11: updatedUser.code11,
        firstName: updatedUser.first_name,
        lastName: updatedUser.last_name,
        role: updatedUser.role,
        walletStatus: updatedUser.wallet_status,
        initialDepositCreditedUsd: updatedUser.initial_deposit_credited_usd
      }
    });
  });

  // POST /auth/wallet-password/verify
  app.post("/auth/wallet-password/verify", async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;

    const body = (req.body ?? {}) as WalletPasswordBody;
    const pwd = body.password;

    if (!pwd || !user.wallet_password_hash) {
      return reply.code(401).send({ error: "Invalid password." });
    }

    const valid = await argon2.verify(user.wallet_password_hash, pwd);
    if (!valid) {
      return reply.code(401).send({ error: "Invalid password." });
    }

    return reply.send({ ok: true });
  });

  // POST /internal/users/:id/wallet-status
  app.post("/internal/users/:id/wallet-status", async (req: any, reply) => {
    if (!requireInternal(req, reply)) return;

    const { id } = req.params;
    const user = stmts.user.byId.get(id);
    if (!user) return reply.code(404).send({ error: "User not found." });

    const body = (req.body ?? {}) as any;
    const { status, initialDepositCreditedUsd, initialDepositCompletedAt } = body;

    const now = Date.now();
    const creditedUsd =
      initialDepositCreditedUsd ?? user.initial_deposit_credited_usd;

    // Auto state-machine transition: once a user awaiting their activation
    // deposit has cumulatively credited >= $1, flip them to 'active' and
    // stamp the completion time. No manual admin step needed.
    let nextStatus = status ?? user.wallet_status;
    let completedAt =
      initialDepositCompletedAt ?? user.initial_deposit_completed_at;

    if (
      (nextStatus === "pending_initial_deposit" ||
        user.wallet_status === "pending_initial_deposit") &&
      Number(creditedUsd) >= 1.0
    ) {
      nextStatus = "active";
      if (!completedAt) completedAt = now;
    }

    stmts.user.updateWalletStatus.run({
      id,
      wallet_status: nextStatus,
      wallet_status_changed_at: now,
      initial_deposit_credited_usd: creditedUsd,
      initial_deposit_completed_at: completedAt,
      updated_at: now
    });

    return reply.send({ ok: true, walletStatus: nextStatus });
  });

  // POST /internal/users/:id/studio-unlock
  // Called by the wallet service after it has collected the $18 Studio fee.
  // Idempotent: re-calling on an already-unlocked user is a no-op success.
  app.post("/internal/users/:id/studio-unlock", async (req: any, reply) => {
    if (!requireInternal(req, reply)) return;

    const { id } = req.params;
    const user = stmts.user.byId.get(id);
    if (!user) return reply.code(404).send({ error: "User not found." });

    const now = Date.now();
    if (!user.studio_unlocked_at) {
      stmts.user.unlockStudio.run({
        id,
        studio_unlocked_at: now,
        updated_at: now
      });
    }

    const updated = stmts.user.byId.get(id)!;
    return reply.send({
      ok: true,
      studioUnlockedAt: updated.studio_unlocked_at
    });
  });

  // POST /admin/users/:id/wallet-status
  app.post("/admin/users/:id/wallet-status", async (req: any, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;
    if (user.role !== "admin") {
      return reply.code(403).send({ error: "Admin role required." });
    }

    const { id } = req.params;
    const targetUser = stmts.user.byId.get(id);
    if (!targetUser) return reply.code(404).send({ error: "User not found." });

    const body = (req.body ?? {}) as WalletStatusBody;
    const newStatus = body.status;
    if (!newStatus) return reply.code(400).send({ error: "Missing status." });

    const now = Date.now();
    stmts.user.updateWalletStatus.run({
      id,
      wallet_status: newStatus,
      wallet_status_changed_at: now,
      initial_deposit_credited_usd: targetUser.initial_deposit_credited_usd,
      initial_deposit_completed_at: newStatus === 'active' && targetUser.wallet_status !== 'active' ? now : targetUser.initial_deposit_completed_at,
      updated_at: now
    });

    return reply.send({ ok: true });
  });
}

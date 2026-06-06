import type { FastifyInstance } from "fastify";
import { db, stmts } from "../db.js";
import crypto from "node:crypto";
import { verifyAccessToken } from "../jwt.js";
import { notify } from "../notify.js";
import { performLiquidityExit } from "../liquidity.js";
import { sendWalletActivatedEmail, sendDepositEmail, sendWithdrawalEmail, sendWalletOtp } from "../emails.js";
import {
  generateCode,
  hashCode,
  OTP_TTL_SECONDS,
  MAX_OTP_ATTEMPTS,
  timingSafeEqualHex
} from "../otp.js";
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
    // Store the password hash but DO NOT advance the wallet yet — the user must
    // confirm with a branded OTP first (POST /auth/wallet-password/confirm).
    stmts.user.updateWalletPassword.run({
      id: user.id,
      wallet_password_hash: hash,
      wallet_password_set_at: now,
      wallet_status: "pending_password",
      wallet_status_changed_at: now,
      updated_at: now
    });

    // Issue a wallet-verification OTP (branded email).
    const code = generateCode();
    stmts.otp.insert.run({
      id: crypto.randomUUID(),
      email: user.email,
      code_hash: hashCode(code),
      // Stored as 'login' to satisfy the otp_sessions CHECK constraint; the
      // emailed code is the branded wallet-verification one (sendWalletOtp).
      mode: "login",
      first_name: null,
      last_name: null,
      expires_at: now + OTP_TTL_SECONDS * 1000,
      attempts: 0,
      idempotency_key: null,
      created_at: now
    });
    try {
      await sendWalletOtp({ to: user.email, code });
    } catch (err) {
      req.log.error({ err }, "[wallet-password] OTP send failed");
      return reply.code(502).send({ error: "Couldn't send the verification code. Please try again." });
    }

    return reply.send({ ok: true, otpRequired: true });
  });

  // POST /auth/wallet-password/confirm — verify the wallet OTP, then advance.
  app.post("/auth/wallet-password/confirm", async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;
    if (!user.wallet_password_hash) {
      return reply.code(400).send({ error: "Set a wallet password first." });
    }
    const code = (req.body as { code?: string } | undefined)?.code;
    if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
      return reply.code(400).send({ error: "Enter the 6-digit code." });
    }
    const session = stmts.otp.activeForEmail.get(user.email, Date.now());
    if (!session) {
      return reply.code(400).send({ error: "No pending code — set your password again to get a new one." });
    }
    if (session.attempts >= MAX_OTP_ATTEMPTS) {
      stmts.otp.delete.run(session.id);
      return reply.code(429).send({ error: "Too many attempts — set your password again." });
    }
    if (!timingSafeEqualHex(hashCode(code), session.code_hash)) {
      stmts.otp.bumpAttempts.run(session.id);
      return reply.code(400).send({ error: "Incorrect code." });
    }
    stmts.otp.delete.run(session.id);

    const now = Date.now();
    stmts.user.updateWalletStatus.run({
      id: user.id,
      wallet_status: "pending_initial_deposit",
      wallet_status_changed_at: now,
      initial_deposit_credited_usd: user.initial_deposit_credited_usd,
      initial_deposit_completed_at: user.initial_deposit_completed_at,
      updated_at: now
    });
    const u = stmts.user.byId.get(user.id)!;
    return reply.send({
      ok: true,
      user: {
        id: u.id,
        email: u.email,
        code11: u.code11,
        firstName: u.first_name,
        lastName: u.last_name,
        role: u.role,
        walletStatus: u.wallet_status,
        initialDepositCreditedUsd: u.initial_deposit_credited_usd
      }
    });
  });

  // POST /auth/wallet-otp/request — issue a BRANDED wallet OTP for a sensitive
  // wallet action (e.g. a withdrawal). Authenticated; emails sendWalletOtp.
  app.post("/auth/wallet-otp/request", async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;
    const code = generateCode();
    const now = Date.now();
    stmts.otp.insert.run({
      id: crypto.randomUUID(),
      email: user.email,
      code_hash: hashCode(code),
      mode: "login", // satisfies the otp_sessions CHECK; email is the wallet one
      first_name: null,
      last_name: null,
      expires_at: now + OTP_TTL_SECONDS * 1000,
      attempts: 0,
      idempotency_key: null,
      created_at: now
    });
    try {
      await sendWalletOtp({ to: user.email, code });
    } catch (err) {
      req.log.error({ err }, "[wallet-otp] send failed");
      return reply.code(502).send({ error: "Couldn't send the verification code." });
    }
    return reply.send({ ok: true });
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

  // GET /internal/users/lookup?email=  — resolve an account by email (internal
  // only). Used by the wallet credit CLI to map email → user id.
  app.get("/internal/users/lookup", async (req: any, reply) => {
    if (!requireInternal(req, reply)) return;
    const email = String(req.query?.email ?? "").trim().toLowerCase();
    if (!email) return reply.code(400).send({ error: "email query param required." });
    const user = stmts.user.byEmail.get(email);
    if (!user) return reply.code(404).send({ error: "User not found." });
    return reply.send({
      id: user.id,
      email: user.email,
      code11: user.code11,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      walletStatus: user.wallet_status,
      tokensMinted: user.tokens_minted,
      initialDepositCreditedUsd: user.initial_deposit_credited_usd
    });
  });

  // POST /internal/users/:id/purge — DELETE an account and all its auth-side
  // data (used to tear down a demo account after recording). Best-effort per
  // table so a missing column/table never blocks the purge. Internal only.
  app.post("/internal/users/:id/purge", async (req: any, reply) => {
    if (!requireInternal(req, reply)) return;
    const { id } = req.params;
    const user = stmts.user.byId.get(id);
    if (!user) return reply.code(404).send({ error: "User not found." });
    const email = user.email;
    const byUserId = [
      "refresh_tokens",
      "community_votes",
      "community_reactions",
      "community_comment_likes",
      "community_comments",
      "token_reclaims",
      "email_sends"
    ];
    for (const t of byUserId) {
      try { db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(id); } catch { /* table/col may not exist */ }
    }
    for (const t of ["otp_sessions", "email_sends", "email_unsubscribes"]) {
      try { db.prepare(`DELETE FROM ${t} WHERE email = ?`).run(email); } catch { /* ignore */ }
    }
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    notify(`🧹 <b>Demo account purged</b>\n${email}`);
    return reply.send({ ok: true, purged: email });
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

    // Wallet just became active (the $1 activation cleared). The member can
    // now GENERATE their Seva Credit on demand from the dashboard — see
    // POST /auth/seva/generate. We don't auto-mint here.
    if (nextStatus === "active" && user.wallet_status !== "active") {
      notify(
        `✅ <b>Wallet activated</b>\n${user.email}\n` +
          `ID: <code>${user.code11}</code> · credited $${Number(creditedUsd).toFixed(2)}`
      );
      sendWalletActivatedEmail({
        to: user.email,
        firstName: user.first_name,
        creditedUsd: Number(creditedUsd)
      }).catch(() => {});
    }

    return reply.send({ ok: true, walletStatus: nextStatus });
  });

  // POST /internal/users/:id/exit-liquidity
  // Called by the wallet service when a member's withdrawal drops their total
  // usable balance below the protected $1 floor. Forfeits their tokens to the
  // admin's holdings (recorded with their reference number) and notifies.
  // Idempotent: no-op if the member has no tokens.
  app.post("/internal/users/:id/exit-liquidity", async (req: any, reply) => {
    if (!requireInternal(req, reply)) return;
    const { id } = req.params;
    const user = stmts.user.byId.get(id);
    if (!user) return reply.code(404).send({ error: "User not found." });
    const result = performLiquidityExit(id, "withdrawal_floor");
    return reply.send({
      ok: true,
      forfeited: !!result,
      tokens: result?.tokens ?? 0,
      referenceNo: result?.referenceNo ?? user.code11
    });
  });

  // POST /internal/email/deposit — wallet service calls this after indexing a
  // new incoming deposit, so we can email the member a branded confirmation.
  app.post("/internal/email/deposit", async (req: any, reply) => {
    if (!requireInternal(req, reply)) return;
    const b = (req.body ?? {}) as {
      userId?: string; amount?: string; symbol?: string; chain?: string; usd?: number | null; txHash?: string | null;
    };
    const u = b.userId ? stmts.user.byId.get(b.userId) : null;
    if (!u) return reply.code(404).send({ error: "User not found." });
    sendDepositEmail({
      to: u.email,
      firstName: u.first_name,
      amount: String(b.amount ?? "0"),
      symbol: String(b.symbol ?? ""),
      chain: String(b.chain ?? ""),
      usd: b.usd ?? null,
      txHash: b.txHash ?? null
    }).catch(() => {});
    return reply.send({ ok: true });
  });

  // POST /internal/email/withdrawal — wallet service calls after a broadcast.
  app.post("/internal/email/withdrawal", async (req: any, reply) => {
    if (!requireInternal(req, reply)) return;
    const b = (req.body ?? {}) as {
      userId?: string; amount?: string; symbol?: string; chain?: string; dest?: string | null; txHash?: string | null;
    };
    const u = b.userId ? stmts.user.byId.get(b.userId) : null;
    if (!u) return reply.code(404).send({ error: "User not found." });
    sendWithdrawalEmail({
      to: u.email,
      firstName: u.first_name,
      amount: String(b.amount ?? "0"),
      symbol: String(b.symbol ?? ""),
      chain: String(b.chain ?? ""),
      dest: b.dest ?? null,
      txHash: b.txHash ?? null
    }).catch(() => {});
    return reply.send({ ok: true });
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

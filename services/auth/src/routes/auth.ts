import type { FastifyInstance } from "fastify";
import { stmts } from "../db.js";
import {
  consumeRefreshToken,
  issueRefreshToken,
  revokeRefreshToken,
  setReplacedBy,
  signAccessToken,
  TTL,
  verifyAccessToken
} from "../jwt.js";
import crypto from "node:crypto";
import { notify } from "../notify.js";

// 10 billion personalized tokens — minted once the member builds in the Studio.
const TOKENS_PER_MEMBER = 10_000_000_000;

type RefreshBody = { refreshToken?: unknown };
type LogoutBody = { refreshToken?: unknown };

export async function authRoutes(app: FastifyInstance) {
  // ────────────────────────────────────────────────────────────────────────
  // GET /auth/exists?email=... — lightweight account-existence check (no OTP
  // sent). Used by the landing hero to route to login (prefilled) vs signup.
  // Note: leaks account existence (enumeration) — accepted trade-off for UX.
  app.get("/auth/exists", async (req, reply) => {
    const email = String((req.query as any)?.email ?? "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.code(400).send({ error: "Valid email required." });
    }
    const user = stmts.user.byEmail.get(email);
    return reply.send({ exists: !!user });
  });

  // ────────────────────────────────────────────────────────────────────────
  // POST /auth/refresh — rotate refresh, issue new access. Returns 401 on
  // any failure (unknown/expired/reused). On reuse, the entire family is
  // burned (handled inside consumeRefreshToken).
  app.post("/auth/refresh", async (req, reply) => {
    const body = (req.body ?? {}) as RefreshBody;
    const presented = body.refreshToken;
    if (typeof presented !== "string" || presented.length < 16) {
      return reply.code(400).send({ error: "Missing refresh token." });
    }

    const result = consumeRefreshToken(presented);
    if (!result.ok) {
      return reply.code(401).send({ error: `Invalid refresh token (${result.reason}).` });
    }

    const user = stmts.user.byId.get(result.userId);
    if (!user) {
      return reply.code(401).send({ error: "User no longer exists." });
    }

    const refresh = issueRefreshToken({
      userId: user.id,
      familyId: result.familyId,
      userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      ip: req.ip
    });
    // Link the old token to the new one for audit / chain visualisation.
    const presentedHash = crypto
      .createHash("sha256")
      .update(presented)
      .digest("hex");
    setReplacedBy(presentedHash, refresh.id);

    const accessToken = await signAccessToken(user);

    return reply.send({
      ok: true,
      accessToken,
      accessTokenExpiresIn: TTL.access,
      refreshToken: refresh.token,
      refreshTokenExpiresAt: refresh.expiresAt
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // POST /auth/logout — revoke a single refresh (this session only).
  app.post("/auth/logout", async (req, reply) => {
    const body = (req.body ?? {}) as LogoutBody;
    const token = body.refreshToken;
    if (typeof token === "string" && token.length >= 16) {
      revokeRefreshToken(token);
    }
    return reply.send({ ok: true });
  });

  // ────────────────────────────────────────────────────────────────────────
  // GET /auth/me — return the user behind the Bearer access token.
  app.get("/auth/me", async (req, reply) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Missing bearer token." });
    }
    const token = header.slice("Bearer ".length).trim();
    const claims = await verifyAccessToken(token);
    if (!claims) return reply.code(401).send({ error: "Invalid or expired access token." });

    const user = stmts.user.byId.get(claims.sub);
    if (!user) return reply.code(401).send({ error: "User no longer exists." });

    return reply.send({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        code11: user.code11,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        age: user.age,
        country: user.country,
        gender: user.gender,
        consentedTermsAt: user.consented_terms_at,
        consentedPrivacyAt: user.consented_privacy_at,
        notificationsOptIn: user.notifications_opt_in === 1,
        profileCompletedAt: user.profile_completed_at,
        walletStatus: user.wallet_status,
        initialDepositCreditedUsd: user.initial_deposit_credited_usd,
        tokensMinted: user.tokens_minted,
        studioUnlocked: !!user.studio_unlocked_at,
        studioUnlockedAt: user.studio_unlocked_at,
        createdAt: user.created_at
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // POST /auth/profile — onboarding form after first OTP signup.
  // Required: age (>=18), country, consent to T&C + privacy.
  // Optional: gender, notifications opt-in.
  app.post("/auth/profile", async (req, reply) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Missing bearer token." });
    }
    const token = header.slice("Bearer ".length).trim();
    const claims = await verifyAccessToken(token);
    if (!claims) return reply.code(401).send({ error: "Invalid or expired access token." });

    const user = stmts.user.byId.get(claims.sub);
    if (!user) return reply.code(401).send({ error: "User no longer exists." });

    const body = (req.body ?? {}) as {
      age?: unknown;
      country?: unknown;
      gender?: unknown;
      consentTerms?: unknown;
      consentPrivacy?: unknown;
      notificationsOptIn?: unknown;
    };

    const age = typeof body.age === "number" ? body.age : Number(body.age);
    if (!Number.isFinite(age) || age < 18 || age > 120) {
      return reply.code(400).send({ error: "You must be at least 18 to use this service." });
    }
    if (typeof body.country !== "string" || !body.country.trim()) {
      return reply.code(400).send({ error: "Country is required." });
    }
    if (body.consentTerms !== true || body.consentPrivacy !== true) {
      return reply.code(400).send({ error: "You must accept the Terms and Privacy Policy." });
    }
    const gender =
      typeof body.gender === "string" && body.gender.trim() ? body.gender.trim() : null;
    const notif = body.notificationsOptIn === true;
    const now = Date.now();

    stmts.user.updateProfile.run({
      id: user.id,
      age: Math.floor(age),
      country: body.country.trim(),
      gender,
      consented_terms_at: now,
      consented_privacy_at: now,
      notifications_opt_in: notif ? 1 : 0,
      notifications_opt_in_at: notif ? now : null,
      profile_completed_at: now,
      updated_at: now
    });

    // Only fire on the FIRST completion — re-saving an edit shouldn't ping you.
    if (!user.profile_completed_at) {
      notify(
        `📝 <b>Profile completed</b>\n${user.email}\n` +
          `ID: <code>${user.code11}</code> · age ${Math.floor(age)} · ${body.country.trim()}`
      );
    }

    return reply.send({ ok: true });
  });

  // ────────────────────────────────────────────────────────────────────────
  // POST /auth/studio/build — mint the member's 10B personalized tokens, once,
  // after they've built their business in the AI Studio. Requires the Studio
  // to be unlocked ($18 paid). Idempotent.
  app.post("/auth/studio/build", async (req, reply) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Missing bearer token." });
    }
    const claims = await verifyAccessToken(header.slice("Bearer ".length).trim());
    if (!claims) return reply.code(401).send({ error: "Invalid or expired access token." });

    const user = stmts.user.byId.get(claims.sub);
    if (!user) return reply.code(401).send({ error: "User no longer exists." });

    if (!user.studio_unlocked_at) {
      return reply.code(403).send({ error: "Unlock the AI Studio first." });
    }

    if (user.tokens_minted > 0) {
      return reply.send({ ok: true, alreadyMinted: true, tokensMinted: user.tokens_minted });
    }

    const now = Date.now();
    stmts.user.mintTokens.run({
      id: user.id,
      tokens_minted: TOKENS_PER_MEMBER,
      tokens_minted_at: now,
      updated_at: now
    });
    notify(
      `🪙 <b>Tokens minted</b>\n${user.email}\nID: <code>${user.code11}</code>\n` +
        `${TOKENS_PER_MEMBER.toLocaleString()} personalized tokens`
    );

    return reply.send({ ok: true, tokensMinted: TOKENS_PER_MEMBER });
  });

  // ────────────────────────────────────────────────────────────────────────
  // GET /auth/admin/users — list every registered user. Admin-only.
  app.get("/auth/admin/users", async (req, reply) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Missing bearer token." });
    }
    const claims = await verifyAccessToken(header.slice("Bearer ".length).trim());
    if (!claims) return reply.code(401).send({ error: "Invalid or expired access token." });

    const me = stmts.user.byId.get(claims.sub);
    if (!me || me.role !== "admin") {
      return reply.code(403).send({ error: "Admin access required." });
    }

    const rows = stmts.user.listAll.all() as Array<{
      id: string;
      email: string;
      code11: string;
      first_name: string;
      last_name: string;
      role: "admin" | "user";
      age: number | null;
      country: string | null;
      gender: string | null;
      profile_completed_at: number | null;
      wallet_status: string;
      initial_deposit_credited_usd: number;
      tokens_minted: number;
      notifications_opt_in: number;
      studio_unlocked_at: number | null;
      created_at: number;
    }>;

    return reply.send({
      ok: true,
      total: rows.length,
      users: rows.map((u) => ({
        id: u.id,
        email: u.email,
        code11: u.code11,
        firstName: u.first_name,
        lastName: u.last_name,
        role: u.role,
        age: u.age,
        country: u.country,
        gender: u.gender,
        profileCompleted: !!u.profile_completed_at,
        walletStatus: u.wallet_status,
        initialDepositCreditedUsd: u.initial_deposit_credited_usd,
        tokensMinted: u.tokens_minted,
        notificationsOptIn: u.notifications_opt_in === 1,
        studioUnlocked: !!u.studio_unlocked_at,
        createdAt: u.created_at
      }))
    });
  });
}

import type { FastifyInstance } from "fastify";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { db, stmts } from "../db.js";
import { performLiquidityExit } from "../liquidity.js";
import { sendSevaCreditEmail } from "../emails.js";
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
import { encryptSecret, decryptSecret } from "../crypto.js";

// 10 billion GoogolPlex Seva Credit — generated once, on demand, by an active
// member against their deposited $1 (see POST /auth/seva/generate).
const TOKENS_PER_MEMBER = 10_000_000_000;
const SEVA_CREDIT_AMOUNT = TOKENS_PER_MEMBER;

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
      refreshTokenExpiresAt: refresh.expiresAt,
      // New session id after rotation — UI must update its pinned value.
      sessionId: refresh.id
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
        consentedConsultationAt: user.consented_consultation_at,
        notificationsOptIn: user.notifications_opt_in === 1,
        profileCompletedAt: user.profile_completed_at,
        walletStatus: user.wallet_status,
        initialDepositCreditedUsd: user.initial_deposit_credited_usd,
        tokensMinted: user.tokens_minted,
        studioUnlocked: !!user.studio_unlocked_at,
        studioUnlockedAt: user.studio_unlocked_at,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at
      }
    });
  });

  // POST /auth/profile/avatar — upload a profile image as a base64 data URL
  // (the client resizes it small first). Written to the media volume and served
  // at AVATAR_BASE_URL. Per-route bodyLimit lifted above the global 64KB.
  app.post(
    "/auth/profile/avatar",
    { bodyLimit: 1024 * 1024 },
    async (req, reply) => {
      const header = req.headers.authorization;
      if (!header || !header.startsWith("Bearer ")) {
        return reply.code(401).send({ error: "Missing bearer token." });
      }
      const claims = await verifyAccessToken(header.slice("Bearer ".length).trim());
      if (!claims) return reply.code(401).send({ error: "Invalid or expired access token." });
      const user = stmts.user.byId.get(claims.sub);
      if (!user) return reply.code(401).send({ error: "User no longer exists." });

      const dataUrl = (req.body as { image?: string } | undefined)?.image;
      const m =
        typeof dataUrl === "string"
          ? dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/)
          : null;
      if (!m) {
        return reply.code(400).send({ error: "Send a PNG/JPEG/WebP image as a data URL." });
      }
      const ext = m[1] === "jpeg" ? "jpg" : m[1];
      const buf = Buffer.from(m[2]!, "base64");
      if (buf.length > 800 * 1024) {
        return reply.code(413).send({ error: "Image too large (max 800KB). Try a smaller one." });
      }

      const dir = process.env.AVATAR_DIR || "/srv/media/avatars";
      const base = (
        process.env.AVATAR_BASE_URL || "https://ggakingclub.com/media/avatars"
      ).replace(/\/$/, "");
      try {
        mkdirSync(dir, { recursive: true });
        // New filename each upload (timestamp) so the immutable /media cache
        // never serves a stale avatar.
        const fname = `${user.id}-${Date.now()}.${ext}`;
        writeFileSync(join(dir, fname), buf);
        const url = `${base}/${fname}`;
        const now = Date.now();
        db.prepare("UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?").run(
          url,
          now,
          user.id
        );
        return reply.send({ ok: true, avatarUrl: url });
      } catch (e) {
        req.log.error({ err: e }, "[avatar] write failed");
        return reply.code(500).send({ error: "Could not save the image." });
      }
    }
  );

  // POST /auth/notifications — toggle the product/account email opt-in.
  app.post("/auth/notifications", async (req, reply) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Missing bearer token." });
    }
    const claims = await verifyAccessToken(header.slice("Bearer ".length).trim());
    if (!claims) return reply.code(401).send({ error: "Invalid or expired access token." });
    const user = stmts.user.byId.get(claims.sub);
    if (!user) return reply.code(401).send({ error: "User no longer exists." });

    const optIn = (req.body as { optIn?: unknown } | undefined)?.optIn === true;
    const now = Date.now();
    db.prepare(
      "UPDATE users SET notifications_opt_in = ?, notifications_opt_in_at = ?, updated_at = ? WHERE id = ?"
    ).run(optIn ? 1 : 0, optIn ? now : null, now, user.id);
    return reply.send({ ok: true, notificationsOptIn: optIn });
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
      consentConsultation?: unknown;
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
    if (body.consentConsultation !== true) {
      return reply
        .code(400)
        .send({ error: "You must acknowledge the consultation-fee terms to continue." });
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
      consented_consultation_at: now,
      notifications_opt_in: notif ? 1 : 0,
      notifications_opt_in_at: notif ? now : null,
      profile_completed_at: now,
      updated_at: now
    });

    // Consent audit trail — one immutable record per agreement, capturing the
    // time, the device (user-agent), and the client IP (encrypted at rest,
    // server-captured via trustProxy so it can't be spoofed by the client).
    // Never surfaced to clients.
    try {
      const ua = String(req.headers["user-agent"] ?? "").slice(0, 500);
      const ipEnc = req.ip ? encryptSecret(req.ip) : null;
      const writeConsent = db.transaction((kinds: string[]) => {
        for (const kind of kinds) {
          stmts.consent.insert.run({
            id: crypto.randomUUID(),
            user_id: user.id,
            kind,
            consented_at: now,
            ip_enc: ipEnc,
            user_agent: ua || null,
            created_at: now
          });
        }
      });
      writeConsent(["consultation", "terms", "privacy"]);
    } catch (err) {
      // Audit write must never block onboarding; log and move on.
      req.log.error({ err }, "consent audit write failed");
    }

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
  // POST /auth/seva/generate — member generates their 10B GoogolPlex Seva
  // Credit against the $1 they deposited. Requires an ACTIVE wallet (the $1
  // has cleared). Deliberate, one-time, idempotent.
  app.post("/auth/seva/generate", async (req, reply) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Missing bearer token." });
    }
    const claims = await verifyAccessToken(header.slice("Bearer ".length).trim());
    if (!claims) return reply.code(401).send({ error: "Invalid or expired access token." });

    const user = stmts.user.byId.get(claims.sub);
    if (!user) return reply.code(401).send({ error: "User no longer exists." });

    if (user.wallet_status !== "active") {
      return reply.code(403).send({
        error: "Deposit $1 to activate your wallet before generating Seva Credit."
      });
    }
    if (Number(user.tokens_minted) > 0) {
      return reply.send({ ok: true, alreadyGenerated: true, sevaCredit: user.tokens_minted });
    }

    const now = Date.now();
    stmts.user.mintTokens.run({
      id: user.id,
      tokens_minted: SEVA_CREDIT_AMOUNT,
      tokens_minted_at: now,
      updated_at: now
    });
    notify(
      `🪙 <b>GoogolPlex Seva Credit generated</b>\n${user.email}\n` +
        `ID: <code>${user.code11}</code>\n` +
        `${SEVA_CREDIT_AMOUNT.toLocaleString()} credits`
    );
    sendSevaCreditEmail({
      to: user.email,
      firstName: user.first_name,
      memberId: user.code11,
      amount: SEVA_CREDIT_AMOUNT
    }).catch(() => {});

    return reply.send({ ok: true, sevaCredit: SEVA_CREDIT_AMOUNT });
  });

  // ────────────────────────────────────────────────────────────────────────
  // POST /auth/wallet/exit-liquidity — the member withdraws their protected
  // $1 (exits the liquidity that backs their 10B personalized tokens). In
  // exchange, ALL their minted tokens are transferred to the admin's holdings,
  // recorded in token_reclaims tagged with the member's reference number
  // (code11). This is an explicit, deliberate action — never auto-triggered by
  // a normal withdrawal. Idempotent-ish: a second call with nothing to exit
  // 400s rather than double-recording.
  app.post("/auth/wallet/exit-liquidity", async (req, reply) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Missing bearer token." });
    }
    const claims = await verifyAccessToken(header.slice("Bearer ".length).trim());
    if (!claims) return reply.code(401).send({ error: "Invalid or expired access token." });

    const user = stmts.user.byId.get(claims.sub);
    if (!user) return reply.code(401).send({ error: "User no longer exists." });

    if (Number(user.tokens_minted) <= 0) {
      return reply.code(400).send({
        error:
          "You have no tokens to surrender. Tokens are minted when you build your business in the AI Studio."
      });
    }

    const result = performLiquidityExit(user.id, "explicit");
    if (!result) {
      return reply.code(400).send({ error: "Nothing to exit." });
    }
    return reply.send({
      ok: true,
      tokensTransferred: result.tokens,
      usdReleased: result.usdReleased,
      referenceNo: result.referenceNo
    });
  });

  // GET /auth/admin/token-reclaims — admin audit of all liquidity exits.
  // Shows every batch of tokens transferred in, with the originating member's
  // reference number, plus aggregate holdings.
  app.get("/auth/admin/token-reclaims", async (req, reply) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Missing bearer token." });
    }
    const claims = await verifyAccessToken(header.slice("Bearer ".length).trim());
    if (!claims) return reply.code(401).send({ error: "Invalid or expired access token." });
    const me = stmts.user.byId.get(claims.sub);
    if (!me || me.role !== "admin") return reply.code(403).send({ error: "Admin only." });

    const reclaims = stmts.reclaim.listAll.all();
    const totals = stmts.reclaim.totals.get() as { tokens: number; usd: number; n: number };
    return reply.send({ reclaims, totals });
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
      avatar_url: string | null;
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
        avatarUrl: u.avatar_url,
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

  // GET /auth/admin/users/:id/consents — the consent audit trail for a member:
  // what they signed, when, on which device, and from which IP. Admin-only;
  // the IP is decrypted here (server-side) and returned only to admins.
  app.get("/auth/admin/users/:id/consents", async (req: any, reply) => {
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

    const rows = stmts.consent.listForUser.all(req.params.id) as Array<{
      id: string;
      kind: string;
      consented_at: number;
      ip_enc: string | null;
      user_agent: string | null;
      created_at: number;
    }>;
    return reply.send({
      ok: true,
      consents: rows.map((r) => {
        let ip: string | null = null;
        try {
          ip = r.ip_enc ? decryptSecret(r.ip_enc) : null;
        } catch {
          ip = null; // key rotated or corrupt — surface as unavailable
        }
        return {
          id: r.id,
          kind: r.kind,
          consentedAt: r.consented_at,
          ip,
          userAgent: r.user_agent
        };
      })
    });
  });
}

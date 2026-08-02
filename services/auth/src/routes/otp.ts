import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { stmts } from "../db.js";
import { generateUniqueUserCode } from "../code.js";
import {
  MAX_OTP_ATTEMPTS,
  OTP_TTL_SECONDS,
  generateCode,
  hashCode,
  isValidEmail,
  isValidIdempotencyKey,
  timingSafeEqualHex
} from "../otp.js";
import { sendSignupOtp, sendLoginOtp, sendWelcomeEmail, sendLoginAlertEmail } from "../emails.js";
import { issueRefreshToken, signAccessToken, signSecureToken, TTL } from "../jwt.js";
import { setRefreshCookie } from "../cookies.js";
import { notify } from "../notify.js";
import { resolveGeo } from "../geoip.js";

const SITE_URL = process.env.PUBLIC_SITE_URL || "https://ggakingclub.com";
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
function countryName(code: string): string {
  try { return regionNames.of(code) ?? code; } catch { return code; }
}
/** Tiny user-agent → "Chrome on Windows" label for the login alert. */
function deviceLabel(ua: string): string {
  const b = /Edg/.test(ua) ? "Edge" : /OPR|Opera/.test(ua) ? "Opera" : /Chrome/.test(ua) ? "Chrome"
    : /Firefox/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android"
    : /iPhone|iPad|iPod|iOS/.test(ua) ? "iOS" : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${b} on ${os}` : b;
}

type RequestBody = {
  email?: unknown;
  mode?: unknown;
  firstName?: unknown;
  lastName?: unknown;
};

type VerifyBody = {
  email?: unknown;
  code?: unknown;
};

export async function otpRoutes(app: FastifyInstance) {
  app.post(
    "/auth/otp/request",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const body = (req.body ?? {}) as RequestBody;
    const { email, mode, firstName, lastName } = body;

    if (!isValidEmail(email)) {
      return reply.code(400).send({ error: "Please enter a valid email address." });
    }
    if (mode !== "signup" && mode !== "login") {
      return reply.code(400).send({ error: "Invalid mode." });
    }
    if (mode === "signup") {
      if (typeof firstName !== "string" || !firstName.trim()) {
        return reply.code(400).send({ error: "First name is required." });
      }
      if (typeof lastName !== "string" || !lastName.trim()) {
        return reply.code(400).send({ error: "Last name is required." });
      }
    }

    const normalisedEmail = email.trim().toLowerCase();

    // Up-front existence check — saves an email and gives a clean UX message.
    // Trade-off: leaks account-existence to the caller (enumeration vector).
    const existing = stmts.user.byEmail.get(normalisedEmail);
    if (mode === "login" && !existing) {
      return reply.code(404).send({
        error: "No account found for that email. Try Sign Up instead.",
        code: "NO_ACCOUNT"
      });
    }
    if (mode === "signup" && existing) {
      return reply.code(409).send({
        error: "An account already exists for that email. Try Log In instead.",
        code: "ACCOUNT_EXISTS"
      });
    }

    const rawKey =
      (req.headers["idempotency-key"] as string | undefined) ??
      (req.headers["x-idempotency-key"] as string | undefined);
    const idempotencyKey = isValidIdempotencyKey(rawKey) ? rawKey : null;

    // Idempotency replay: if a row exists with the same key and is still
    // valid, return ok without sending a second email.
    if (idempotencyKey) {
      const prior = stmts.otp.byIdempotency.get(idempotencyKey, Date.now());
      if (prior && prior.email === normalisedEmail && prior.mode === mode) {
        return reply.send({ ok: true, replayed: true });
      }
    }

    const code = generateCode();
    const id = crypto.randomUUID();
    const now = Date.now();

    stmts.otp.insert.run({
      id,
      email: normalisedEmail,
      code_hash: hashCode(code),
      mode,
      first_name: mode === "signup" ? (firstName as string).trim() : null,
      last_name: mode === "signup" ? (lastName as string).trim() : null,
      expires_at: now + OTP_TTL_SECONDS * 1000,
      attempts: 0,
      idempotency_key: idempotencyKey,
      created_at: now
    });

    try {
      if (mode === "signup") {
        await sendSignupOtp({
          to: normalisedEmail,
          code,
          firstName: (firstName as string)?.trim() || null
        });
      } else {
        await sendLoginOtp({ to: normalisedEmail, code });
      }
    } catch (err) {
      req.log.error({ err }, "[otp/request] resend send failed");
      // Roll back the OTP row so the user can retry without hitting the
      // active-row guard. Best-effort.
      try {
        stmts.otp.delete.run(id);
      } catch {
        /* ignore */
      }
      return reply
        .code(502)
        .send({ error: "We couldn't send the code right now. Please try again." });
    }

    return reply.send({ ok: true });
  });

  app.post(
    "/auth/otp/verify",
    { config: { rateLimit: { max: 15, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const body = (req.body ?? {}) as VerifyBody;
    const { email, code } = body;

    if (!isValidEmail(email)) {
      return reply.code(400).send({ error: "Please enter a valid email address." });
    }
    if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
      return reply.code(400).send({ error: "Please enter the 6-digit code." });
    }

    const normalisedEmail = email.trim().toLowerCase();
    const session = stmts.otp.activeForEmail.get(normalisedEmail, Date.now());
    if (!session) {
      return reply.code(400).send({ error: "No pending code — please request a new one." });
    }

    if (session.attempts >= MAX_OTP_ATTEMPTS) {
      stmts.otp.delete.run(session.id);
      return reply
        .code(429)
        .send({ error: "Too many attempts — please request a new code." });
    }

    const hashed = hashCode(code);
    if (!timingSafeEqualHex(hashed, session.code_hash)) {
      stmts.otp.bumpAttempts.run(session.id);
      return reply.code(400).send({
        error: "Incorrect code.",
        attemptsLeft: MAX_OTP_ATTEMPTS - (session.attempts + 1)
      });
    }

    // Success — burn the OTP row.
    stmts.otp.delete.run(session.id);

    // Find or create the user.
    let user = stmts.user.byEmail.get(normalisedEmail);
    if (!user) {
      if (session.mode !== "signup") {
        // Tried to log in to an account that doesn't exist — leak nothing
        // beyond a generic message.
        return reply.code(400).send({
          error:
            "We couldn't find that account. Try the Sign Up flow to create one."
        });
      }
      const id = crypto.randomUUID();
      const code11 = generateUniqueUserCode();
      const now = Date.now();
      // Admin allowlist via env: comma-separated emails get role='admin' on
      // first signup. Everything else defaults to 'user'.
      const adminEmails = (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const role: "admin" | "user" = adminEmails.includes(normalisedEmail)
        ? "admin"
        : "user";
      // Tokens are NOT minted at signup. The member's 10-billion personalized
      // allocation is minted only once they have built their business in the
      // AI Studio (see POST /auth/studio/build).
      stmts.user.insert.run({
        id,
        email: normalisedEmail,
        code11,
        first_name: session.first_name ?? "",
        last_name: session.last_name ?? "",
        role,
        wallet_status: "pending_password",
        wallet_status_changed_at: now,
        initial_deposit_credited_usd: 0,
        tokens_minted: 0,
        tokens_minted_at: null,
        created_at: now,
        updated_at: now
      });
      user = stmts.user.byEmail.get(normalisedEmail)!;

      // Ops notification — new signup.
      notify(
        `🆕 <b>New signup</b>\n` +
          `${user.first_name} ${user.last_name}\n` +
          `${user.email}\n` +
          `ID: <code>${user.code11}</code> · role: ${user.role}`,
        "signup"
      );
      // Welcome email (best-effort).
      sendWelcomeEmail({
        to: user.email,
        firstName: user.first_name,
        memberId: user.code11
      }).catch(() => {});
    } else {
      // Existing user logging back in. Useful as a "was that you?" signal.
      // IP is via req.ip (trustProxy on); UA truncated to keep the message tidy.
      const ua = String((req.headers["user-agent"] as string | undefined) ?? "").slice(0, 80);
      notify(
        `🔓 <b>Login</b>\n${user.email}\n` +
          `ID: <code>${user.code11}</code> · role: ${user.role}\n` +
          `IP: ${req.ip}` +
          (ua ? `\nUA: ${ua}` : ""),
        "login"
      );

      // Login-alert email — throttled to a new device/IP OR at most weekly.
      try {
        const WEEK = 7 * 24 * 60 * 60 * 1000;
        const seenIp = req.ip ? stmts.refresh.hasFromIp.get(user.id, req.ip) : { one: 1 };
        const stale = !user.last_login_alert_at || Date.now() - user.last_login_alert_at >= WEEK;
        if (!seenIp || stale) {
          const when = Date.now();
          // Member-facing "was this you?" alert — worth the precise lookup.
          const hit = await resolveGeo(req.ip);
          const location = hit
            ? [hit.city, hit.region, countryName(hit.country)].filter(Boolean).join(", ") || "Unknown"
            : "Unknown";
          const fullUa = String((req.headers["user-agent"] as string | undefined) ?? "");
          const secureUrl = `${SITE_URL}/secure-account?token=${encodeURIComponent(await signSecureToken(user.id))}`;
          sendLoginAlertEmail({
            to: user.email,
            firstName: user.first_name,
            ip: req.ip || "unknown",
            location,
            device: deviceLabel(fullUa),
            when,
            secureUrl
          }).catch(() => {});
          stmts.user.stampLoginAlert.run({ id: user.id, last_login_alert_at: when });
        }
      } catch {
        /* alerts are best-effort — never block login */
      }
    }

    // A suspended account cannot sign in — even with a valid code.
    if (user.suspended_at) {
      return reply
        .code(403)
        .send({ error: "This account is suspended. Contact support to restore access." });
    }

    // Issue access + refresh. The refresh token goes into an httpOnly cookie
    // (never the body / localStorage) — see cookies.ts.
    const accessToken = await signAccessToken(user);
    const refresh = issueRefreshToken({
      userId: user.id,
      userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      ip: req.ip
    });
    setRefreshCookie(req, reply, refresh.token);

    return reply.send({
      ok: true,
      accessToken,
      accessTokenExpiresIn: TTL.access,
      // The session id is the refresh row id. UIs pin it so they can mark
      // "this device" on the sessions list and protect it from revoke-others.
      sessionId: refresh.id,
      user: {
        id: user.id,
        email: user.email,
        code11: user.code11,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        walletStatus: user.wallet_status,
        initialDepositCreditedUsd: user.initial_deposit_credited_usd
      }
    });
  });
}

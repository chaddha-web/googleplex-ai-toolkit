import crypto from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { stmts, type UserRow } from "./db.js";

const SECRET = process.env.JWT_SECRET ?? "";
if (!SECRET || SECRET.length < 32) {
  // Fail loud in production, just warn in dev so first-time setup isn't blocked.
  const msg =
    "[auth] JWT_SECRET must be set to a random string of at least 32 chars (openssl rand -hex 32).";
  if (process.env.NODE_ENV === "production") throw new Error(msg);
  console.warn(msg, "Using a derived dev key — DO NOT deploy this way.");
}

const KEY = new TextEncoder().encode(
  SECRET || "dev-only-secret-replace-immediately-with-a-real-secret-please"
);

const ACCESS_TTL_S = Number(process.env.ACCESS_TOKEN_TTL ?? 15 * 60);
const REFRESH_TTL_S = Number(process.env.REFRESH_TOKEN_TTL ?? 30 * 24 * 60 * 60);
const ISS = "googolplex.auth";
const AUD = "googolplex.client";

export type AccessClaims = JWTPayload & {
  sub: string;        // user id
  email: string;
  code11: string;
  role: "user" | "admin";
  type: "access";
};

// ────────────────────────────────────────────────────────────────────────────
// Access tokens — short-lived signed JWTs.

export async function signAccessToken(user: UserRow): Promise<string> {
  return new SignJWT({
    email: user.email,
    code11: user.code11,
    role: user.role,
    type: "access"
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(ISS)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_S}s`)
    .sign(KEY);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, KEY, {
      issuer: ISS,
      audience: AUD
    });
    if (payload.type !== "access") return null;
    return payload as AccessClaims;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Refresh tokens — opaque random bytes, stored sha256-hashed in DB so a
// DB leak doesn't yield usable tokens. Rotating: every /refresh issues a
// fresh pair and revokes the presented refresh. Token theft is detected
// when a *revoked* refresh shows up — at which point we burn the whole
// family (every refresh that descended from the same login).

export type IssuedRefresh = {
  /** The plaintext token to hand back to the client. */
  token: string;
  /** Persisted row id (= JWT jti style identifier, in case we ever switch). */
  id: string;
  /** Group id tying together a rotation chain — for theft detection. */
  familyId: string;
  expiresAt: number;
};

function newToken(): { token: string; hash: string } {
  const buf = crypto.randomBytes(32);
  const token = buf.toString("base64url");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

function newId(): string {
  return crypto.randomUUID();
}

export function issueRefreshToken(opts: {
  userId: string;
  familyId?: string;
  userAgent?: string | null;
  ip?: string | null;
}): IssuedRefresh {
  const { token, hash } = newToken();
  const id = newId();
  const familyId = opts.familyId ?? newId();
  const now = Date.now();
  const expiresAt = now + REFRESH_TTL_S * 1000;

  stmts.refresh.insert.run({
    id,
    user_id: opts.userId,
    token_hash: hash,
    family_id: familyId,
    expires_at: expiresAt,
    user_agent: opts.userAgent ?? null,
    ip: opts.ip ?? null,
    created_at: now
  });

  return { token, id, familyId, expiresAt };
}

export type RotateResult =
  | { ok: true; userId: string; familyId: string }
  | { ok: false; reason: "unknown" | "expired" | "reused" };

/**
 * Verify a refresh token presented by the client. On success the token row
 * is marked revoked and the caller can issue a new pair. On a *reuse* (the
 * token was already revoked), the entire family is burned — that's the
 * theft-detection signal.
 */
export function consumeRefreshToken(token: string): RotateResult {
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const row = stmts.refresh.byHash.get(hash);
  if (!row) return { ok: false, reason: "unknown" };

  const now = Date.now();
  if (row.expires_at < now) return { ok: false, reason: "expired" };

  if (row.revoked_at !== null) {
    // Token reuse — torch the whole family so any still-live siblings
    // can't be used. Real session monitoring would also notify the user.
    stmts.refresh.revokeFamily.run(now, row.family_id);
    return { ok: false, reason: "reused" };
  }

  // Mark this token revoked. The caller will issue a replacement and call
  // setReplacedBy() with its id so the audit chain stays linked.
  stmts.refresh.revoke.run(now, null, row.id);
  return { ok: true, userId: row.user_id, familyId: row.family_id };
}

export function setReplacedBy(originalHash: string, replacementId: string) {
  const row = stmts.refresh.byHash.get(originalHash);
  if (!row) return;
  stmts.refresh.revoke.run(row.revoked_at ?? Date.now(), replacementId, row.id);
}

/**
 * Revoke a refresh by plaintext (logout). Doesn't burn the whole family,
 * just this single token — sibling sessions on other devices stay alive.
 */
export function revokeRefreshToken(token: string): boolean {
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const row = stmts.refresh.byHash.get(hash);
  if (!row || row.revoked_at !== null) return false;
  stmts.refresh.revoke.run(Date.now(), null, row.id);
  return true;
}

export const TTL = {
  access: ACCESS_TTL_S,
  refresh: REFRESH_TTL_S
};

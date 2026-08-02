/**
 * Shared route guards. The older route files each roll their own copy of this;
 * new routes share one so the admin/capability rules can only drift in one place.
 * Mirrors services/wallet/src/lib/guard.ts.
 */

import { stmts, type UserRow } from "./db.js";
import { verifyAccessToken } from "./jwt.js";
import { permsForUser, type Capability } from "./permissions.js";

/** Resolve the caller from the bearer token, or 401. */
export async function requireUser(req: any, reply: any): Promise<UserRow | null> {
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
  const user = stmts.user.byId.get(claims.sub);
  if (!user) {
    reply.code(401).send({ error: "No such user." });
    return null;
  }
  return user;
}

/** Caller must be an admin. */
export async function requireAdmin(req: any, reply: any): Promise<UserRow | null> {
  const user = await requireUser(req, reply);
  if (!user) return null;
  if (user.role !== "admin") {
    reply.code(403).send({ error: "Admin access required." });
    return null;
  }
  return user;
}

/** Caller must be an admin holding `cap` (the founder implicitly holds all). */
export async function requireCapability(
  req: any,
  reply: any,
  cap: Capability
): Promise<UserRow | null> {
  const user = await requireAdmin(req, reply);
  if (!user) return null;
  if (!permsForUser(user).includes(cap)) {
    reply.code(403).send({ error: `You don't have the "${cap}" permission.` });
    return null;
  }
  return user;
}

/** Internal service-to-service token check. */
export function requireInternal(req: any, reply: any): boolean {
  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7).trim()
    : "";
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  if (!expected || token !== expected) {
    reply.code(401).send({ error: "Invalid internal token." });
    return false;
  }
  return true;
}

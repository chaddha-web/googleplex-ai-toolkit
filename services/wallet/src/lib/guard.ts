import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyAccessToken, type AccessClaims } from "../jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AccessClaims;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    reply.code(401).send({ error: "Missing bearer token." });
    return false;
  }
  const token = header.slice("Bearer ".length).trim();
  const claims = await verifyAccessToken(token);
  if (!claims) {
    reply.code(401).send({ error: "Invalid or expired access token." });
    return false;
  }
  req.user = claims;
  return true;
}

export async function requireRole(req: FastifyRequest, reply: FastifyReply, role: "admin" | "user") {
  if (!(await requireAuth(req, reply))) return false;
  if (req.user!.role !== role) {
    reply.code(403).send({ error: `Requires ${role} role.` });
    return false;
  }
  return true;
}

export function requireInternal(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    reply.code(401).send({ error: "Missing bearer token." });
    return false;
  }
  const token = header.slice("Bearer ".length).trim();
  const internalToken = process.env.INTERNAL_SERVICE_TOKEN;
  if (!internalToken || token !== internalToken) {
    reply.code(401).send({ error: "Invalid internal service token." });
    return false;
  }
  return true;
}

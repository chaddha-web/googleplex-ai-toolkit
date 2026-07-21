/**
 * Refresh-token cookie helpers.
 *
 * The refresh token lives in an httpOnly cookie (not localStorage) so JavaScript
 * — including any injected XSS — can't read it, and so it is shared across every
 * *.ggakingclub.com frontend (the cookie is scoped to the auth host, and any
 * credentialed fetch to the auth service carries it → cross-subdomain SSO).
 *
 * Attributes: HttpOnly; Secure; SameSite=Lax; Domain=auth.ggakingclub.com;
 * Path=/auth; Max-Age=<refresh TTL>. On non-prod hosts (localhost) we drop
 * Secure + Domain so the cookie still works over plain http.
 */

import type { FastifyReply, FastifyRequest } from "fastify";
import { TTL } from "./jwt.js";

const COOKIE_NAME = "gplex_rt";

/** Prod detection from the request host → decides Secure + Domain. */
function cookieEnv(req: FastifyRequest): { secure: boolean; domain?: string } {
  const host = (req.hostname || "").toLowerCase();
  if (host.endsWith("ggakingclub.com")) {
    return { secure: true, domain: "auth.ggakingclub.com" };
  }
  return { secure: false };
}

function build(req: FastifyRequest, value: string, maxAgeS: number): string {
  const { secure, domain } = cookieEnv(req);
  const parts = [
    `${COOKIE_NAME}=${value}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/auth",
    `Max-Age=${maxAgeS}`
  ];
  if (secure) parts.push("Secure");
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join("; ");
}

/** Set (or refresh) the httpOnly refresh cookie. */
export function setRefreshCookie(req: FastifyRequest, reply: FastifyReply, token: string): void {
  reply.header("Set-Cookie", build(req, token, TTL.refresh));
}

/** Clear the refresh cookie (logout). */
export function clearRefreshCookie(req: FastifyRequest, reply: FastifyReply): void {
  reply.header("Set-Cookie", build(req, "", 0));
}

/** Read the refresh token out of the request Cookie header (or null). */
export function readRefreshCookie(req: FastifyRequest): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    if (k === COOKIE_NAME) return part.slice(eq + 1).trim() || null;
  }
  return null;
}

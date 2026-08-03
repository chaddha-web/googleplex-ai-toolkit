/**
 * Alchemy JWT authentication.
 *
 * The API key sits in the RPC URL, which makes it a bearer credential: anyone
 * who sees the URL can use it. We just proved how easily that happens — viem
 * put the URL into an error message and 73 copies of the key ended up in the
 * container log.
 *
 * With JWT auth the URL stops being sufficient. Requests carry a short-lived
 * token signed by a private key that never travels anywhere, and Alchemy
 * verifies it against a public key uploaded to the dashboard. A leaked URL is
 * then worthless on its own.
 *
 * Setup (see docs/DEPLOYMENT.md):
 *   1. Generate an RSA keypair ON THE SERVER — the private key must never be
 *      pasted into a chat, a note, or a message.
 *   2. Upload the SPKI public key in Alchemy → your app → Security → Import
 *      Public Key, and note the `kid` it returns.
 *   3. Set ALCHEMY_JWT_KEY_FILE and ALCHEMY_JWT_KID.
 *
 * Entirely optional: with neither set, everything falls back to the plain
 * API-key URL and behaves exactly as before.
 */

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const KID = process.env.ALCHEMY_JWT_KID?.trim();
const KEY_FILE = process.env.ALCHEMY_JWT_KEY_FILE?.trim();

/** Token lifetime. Short, because it costs nothing to re-sign. */
const TTL_SECONDS = 600;
/** Re-sign this far before expiry so an in-flight request never dies. */
const SKEW_SECONDS = 60;

let privateKeyPem: string | null = null;
let loadFailed = false;

function loadKey(): string | null {
  if (privateKeyPem || loadFailed) return privateKeyPem;
  if (!KEY_FILE) {
    loadFailed = true;
    return null;
  }
  try {
    privateKeyPem = readFileSync(KEY_FILE, "utf8");
    return privateKeyPem;
  } catch (e) {
    // Deliberately not fatal: falling back to the API key keeps the service
    // running. A misconfigured hardening must not take the wallet offline.
    loadFailed = true;
    console.warn(`[alchemy-jwt] could not read ${KEY_FILE} — falling back to API key auth`);
    return null;
  }
}

/** Is JWT auth configured and usable? */
export function jwtEnabled(): boolean {
  return !!KID && !!loadKey();
}

const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

let cachedToken: string | null = null;
let cachedUntil = 0;

/**
 * A signed RS256 token. Alchemy needs `kid` in the header; the payload can be
 * empty beyond the timestamps. Cached until shortly before it expires.
 */
export function alchemyJwt(): string | null {
  const key = loadKey();
  if (!KID || !key) return null;

  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < cachedUntil - SKEW_SECONDS) return cachedToken;

  try {
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: KID }));
    const payload = b64url(JSON.stringify({ iat: now, exp: now + TTL_SECONDS }));
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    signer.end();
    const sig = b64url(signer.sign(key));

    cachedToken = `${header}.${payload}.${sig}`;
    cachedUntil = now + TTL_SECONDS;
    return cachedToken;
  } catch (e) {
    console.warn("[alchemy-jwt] signing failed — falling back to API key auth");
    return null;
  }
}

/**
 * fetch wrapper that attaches the token. Pass to viem's `http(url, { fetchFn })`
 * so the header is minted per request rather than baked in at client creation —
 * a static header would expire and take the service down with it.
 *
 * Only touches Alchemy hosts, so a fallback public RPC is unaffected.
 */
export const alchemyFetch: typeof fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("g.alchemy.com")) return fetch(input as any, init);

  const token = alchemyJwt();
  if (!token) return fetch(input as any, init);

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(input as any, { ...init, headers });
};

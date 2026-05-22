/**
 * Symmetric encryption for settings secrets (AI keys, wallet private keys).
 * AES-256-GCM. The key is derived from JWT_SECRET via scrypt, so no extra
 * env var is needed; rotating JWT_SECRET would invalidate stored secrets
 * (acceptable — re-enter them in the admin settings page).
 *
 * Format: base64( salt[16] | iv[12] | tag[16] | ciphertext ).
 */

import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const SECRET = process.env.JWT_SECRET || "dev-insecure-secret";

function keyFor(salt: Buffer): Buffer {
  return scryptSync(SECRET, salt, 32);
}

export function encryptSecret(plain: string): string {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(salt), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, ct]).toString("base64");
}

export function decryptSecret(blob: string): string {
  const buf = Buffer.from(blob, "base64");
  const salt = buf.subarray(0, 16);
  const iv = buf.subarray(16, 28);
  const tag = buf.subarray(28, 44);
  const ct = buf.subarray(44);
  const decipher = createDecipheriv("aes-256-gcm", keyFor(salt), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** Mask a secret for display — show only the last 4 chars. */
export function maskSecret(plain: string): string {
  if (!plain) return "";
  if (plain.length <= 4) return "••••";
  return "••••" + plain.slice(-4);
}

import crypto from "node:crypto";
import { stmts } from "./db.js";

/**
 * 11-character alphanumeric user code (e.g. "K7M2X9P3RNQ").
 * Charset is Crockford-style — uppercase A-Z + 0-9 minus the visually
 * ambiguous I, L, O, U so codes copied by hand from emails / chat
 * don't get misread. 32^11 ≈ 1.1e16 combinations — collisions are
 * essentially impossible at any realistic scale, but we still
 * collision-check the DB and retry to be safe.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ0123456789"; // 32 chars
const LEN = 11;

function rollOne(): string {
  const bytes = crypto.randomBytes(LEN);
  let out = "";
  for (let i = 0; i < LEN; i++) {
    // Modulo bias is negligible for a 32-char alphabet from an 8-bit byte
    // (256 % 32 == 0). Keep the mask simple.
    out += ALPHABET[bytes[i]! & 0x1f];
  }
  return out;
}

export function generateUniqueUserCode(): string {
  for (let i = 0; i < 8; i++) {
    const candidate = rollOne();
    const existing = stmts.user.byCode.get(candidate);
    if (!existing) return candidate;
  }
  // Astronomically unlikely path — fail loudly rather than silently retry forever.
  throw new Error("Failed to allocate a unique user code after 8 attempts.");
}

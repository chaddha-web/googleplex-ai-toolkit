import crypto from "node:crypto";

const SECRET = process.env.JWT_SECRET ?? "dev-otp-hmac";

export const OTP_TTL_SECONDS = 10 * 60;
export const MAX_OTP_ATTEMPTS = 5;

export function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashCode(code: string): string {
  return crypto.createHmac("sha256", SECRET).update(code).digest("hex");
}

export function isValidEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function isValidIdempotencyKey(v: unknown): v is string {
  return typeof v === "string" && v.length >= 8 && v.length <= 128 && /^[\w.\-:]+$/.test(v);
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

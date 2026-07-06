/**
 * Withdrawal guardrail config: global limits (admin settings, cached), per-user
 * overrides, and the signup / password-change cooldown check. Fails CLOSED on
 * any error in the cooldown path (deny the withdrawal) and falls back to env
 * defaults for the limits (never removes a cap).
 */

import { eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { userWithdrawLimits } from "./db/schema.js";

const AUTH_BASE = (process.env.AUTH_BASE_URL || "http://auth:4200").replace(/\/$/, "");
const INTERNAL = process.env.INTERNAL_SERVICE_TOKEN;

const ENV = {
  maxPerTxUsd: Number(process.env.MAX_WITHDRAW_PER_TX_USD ?? 1000),
  dailyUsd: Number(process.env.MAX_WITHDRAW_DAILY_USD ?? 5000),
  reviewThresholdUsd: Number(process.env.WITHDRAW_REVIEW_THRESHOLD_USD ?? 500),
  signupCooldownHours: Number(process.env.WITHDRAW_SIGNUP_COOLDOWN_H ?? 24),
  pwchangeCooldownHours: Number(process.env.WITHDRAW_PWCHANGE_COOLDOWN_H ?? 24)
};

export type Limits = typeof ENV;

let cache: { at: number; limits: Limits } | null = null;

async function globalLimits(): Promise<Limits> {
  if (cache && Date.now() - cache.at < 60_000) return cache.limits;
  let limits: Limits = { ...ENV };
  if (INTERNAL) {
    try {
      const res = await fetch(`${AUTH_BASE}/internal/settings/withdrawal-limits`, {
        headers: { Authorization: `Bearer ${INTERNAL}` }
      });
      if (res.ok) {
        const d = (await res.json()) as Record<string, number | null>;
        limits = {
          maxPerTxUsd: d.maxPerTxUsd ?? ENV.maxPerTxUsd,
          dailyUsd: d.dailyUsd ?? ENV.dailyUsd,
          reviewThresholdUsd: d.reviewThresholdUsd ?? ENV.reviewThresholdUsd,
          signupCooldownHours: d.signupCooldownHours ?? ENV.signupCooldownHours,
          pwchangeCooldownHours: d.pwchangeCooldownHours ?? ENV.pwchangeCooldownHours
        };
      }
    } catch {
      /* keep env defaults */
    }
  }
  cache = { at: Date.now(), limits };
  return limits;
}

/** Effective limits for a user = per-user override where set, else global. */
export async function effectiveLimits(userId: string): Promise<Limits> {
  const g = await globalLimits();
  const rows = await db
    .select()
    .from(userWithdrawLimits)
    .where(eq(userWithdrawLimits.user_id, userId))
    .limit(1);
  const o = rows[0];
  return {
    maxPerTxUsd: o?.max_per_tx_usd ?? g.maxPerTxUsd,
    dailyUsd: o?.daily_usd ?? g.dailyUsd,
    reviewThresholdUsd: o?.review_threshold_usd ?? g.reviewThresholdUsd,
    signupCooldownHours: g.signupCooldownHours,
    pwchangeCooldownHours: g.pwchangeCooldownHours
  };
}

/** Cooldown gate. Fails CLOSED (deny) if eligibility can't be verified. */
export async function checkCooldown(
  userId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const g = await globalLimits();
  if (!INTERNAL) return { ok: false, message: "Withdrawals are temporarily unavailable." };
  let elig: { createdAt: number; walletPasswordChangedAt: number | null };
  try {
    const res = await fetch(`${AUTH_BASE}/internal/user/${userId}/withdraw-eligibility`, {
      headers: { Authorization: `Bearer ${INTERNAL}` }
    });
    if (!res.ok) return { ok: false, message: "Could not verify withdrawal eligibility." };
    elig = (await res.json()) as { createdAt: number; walletPasswordChangedAt: number | null };
  } catch {
    return { ok: false, message: "Could not verify withdrawal eligibility." };
  }
  const now = Date.now();
  const H = 3_600_000;
  const signupMs = g.signupCooldownHours * H;
  if (elig.createdAt && now - elig.createdAt < signupMs) {
    const h = Math.ceil((signupMs - (now - elig.createdAt)) / H);
    return {
      ok: false,
      message: `New accounts have a ${g.signupCooldownHours}h withdrawal hold — available in ~${h}h.`
    };
  }
  const pwMs = g.pwchangeCooldownHours * H;
  if (elig.walletPasswordChangedAt && now - elig.walletPasswordChangedAt < pwMs) {
    const h = Math.ceil((pwMs - (now - elig.walletPasswordChangedAt)) / H);
    return {
      ok: false,
      message: `Withdrawals are paused for ${g.pwchangeCooldownHours}h after a password change — available in ~${h}h.`
    };
  }
  return { ok: true };
}

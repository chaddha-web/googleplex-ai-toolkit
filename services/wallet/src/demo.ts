/**
 * Demo accounts — a member whose withdrawals COMPLETE IN THE UI without ever
 * broadcasting, and whose balances can be credited from nothing. For sales
 * walkthroughs and end-to-end UI testing on the live box.
 *
 * This is the only path in the system that reports money as sent when nothing
 * moved, so it is deliberately the most constrained thing here.
 *
 * ── Threat model ───────────────────────────────────────────────────────────
 * The dangerous move is NOT the fake withdrawal (nothing leaves). It is
 * **laundering fabricated balance into real money**:
 *
 *     credit 1,000,000 USDT to a demo account
 *       → turn demo mode OFF
 *       → withdraw for real, from the treasury
 *
 * Fabricated credit is therefore tracked per (user, chain, symbol) in
 * `demo_credits`, and turning demo mode off **reverses whatever fabricated
 * balance is still sitting there** before the account can transact for real.
 * A demo account can never hand back more than it was legitimately given.
 *
 * ── Controls ───────────────────────────────────────────────────────────────
 *  1. Founder-only. Not `settings` — a capability several admins hold.
 *  2. Fails closed: any error resolving demo status takes the REAL broadcast
 *     path. A broken database never silently stops a payout.
 *  3. `DEMO_ACCOUNTS_ENABLED=0` disables every demo account with no deploy.
 *  4. Cannot be applied to an account with real deposit history, so a paying
 *     member can never be quietly switched to fake withdrawals.
 *  5. Cannot be applied to an admin or the founder.
 *  6. Fabricated credit is capped per-credit and in aggregate
 *     (`DEMO_MAX_CREDIT_USD`, default $100k).
 *  7. Every enable / disable / credit is audited and pushed to Telegram.
 *  8. Demo balances and demo withdrawals are excluded from platform accounting.
 */

import { rawDb } from "./db/index.js";
import { randomBytes } from "node:crypto";

/** Master switch — set DEMO_ACCOUNTS_ENABLED=0 to kill every demo account. */
const ENABLED = (process.env.DEMO_ACCOUNTS_ENABLED ?? "1") !== "0";

/** Ceiling on fabricated value per credit AND in aggregate per account. */
export const MAX_CREDIT_USD = Number(process.env.DEMO_MAX_CREDIT_USD ?? 100_000);

/**
 * Is this user a demo account? Fails CLOSED: on any error we return false, so
 * the withdrawal takes the real path rather than silently not sending.
 */
export function isDemoAccount(userId: string): boolean {
  if (!ENABLED) return false;
  try {
    return !!rawDb.prepare(`SELECT 1 AS x FROM demo_accounts WHERE user_id = ?`).get(userId);
  } catch {
    return false;
  }
}

/** Every demo user id — used to exclude them from platform accounting. */
export function demoUserIds(): string[] {
  try {
    return (rawDb.prepare(`SELECT user_id FROM demo_accounts`).all() as { user_id: string }[]).map(
      (r) => r.user_id
    );
  } catch {
    return [];
  }
}

export type DemoCredit = { chain: string; symbol: string; raw: string; usd: number };

/** Outstanding fabricated credit for one account, per (chain, symbol). */
export function fabricatedCredits(userId: string): DemoCredit[] {
  try {
    return rawDb
      .prepare(`SELECT chain, symbol, raw, usd FROM demo_credits WHERE user_id = ?`)
      .all(userId) as DemoCredit[];
  } catch {
    return [];
  }
}

/** Total fabricated USD currently attributed to an account. */
export function fabricatedUsd(userId: string): number {
  return fabricatedCredits(userId).reduce((s, c) => s + (c.usd ?? 0), 0);
}

/** Record fabricated credit so it can be reversed when demo mode is lifted. */
export function recordFabricated(
  userId: string,
  chain: string,
  symbol: string,
  raw: bigint,
  usd: number
): void {
  const existing = rawDb
    .prepare(`SELECT raw, usd FROM demo_credits WHERE user_id=? AND chain=? AND symbol=?`)
    .get(userId, chain, symbol) as { raw: string; usd: number } | undefined;
  if (existing) {
    rawDb
      .prepare(`UPDATE demo_credits SET raw=?, usd=? WHERE user_id=? AND chain=? AND symbol=?`)
      .run((BigInt(existing.raw) + raw).toString(), (existing.usd ?? 0) + usd, userId, chain, symbol);
  } else {
    rawDb
      .prepare(
        `INSERT INTO demo_credits (user_id, chain, symbol, raw, usd, created_at) VALUES (?,?,?,?,?,?)`
      )
      .run(userId, chain, symbol, raw.toString(), usd, Date.now());
  }
}

/** Clear the fabricated-credit record for an account (after reversal). */
export function clearFabricated(userId: string): void {
  rawDb.prepare(`DELETE FROM demo_credits WHERE user_id = ?`).run(userId);
}

/**
 * How much of each fabricated credit is still sitting in the ledger, i.e. what
 * must be clawed back before this account is allowed to transact for real.
 *
 * Capped at the CURRENT balance: if the demo account already "withdrew" the
 * fabricated funds, that balance is gone and there is nothing to reverse —
 * and nothing real left either, because the withdrawal never sent anything.
 */
export function reversalPlan(userId: string): Array<DemoCredit & { reverseRaw: string }> {
  const out: Array<DemoCredit & { reverseRaw: string }> = [];
  for (const c of fabricatedCredits(userId)) {
    const bal = rawDb
      .prepare(`SELECT raw FROM ledger_balances WHERE user_id=? AND chain=? AND symbol=?`)
      .get(userId, c.chain, c.symbol) as { raw: string } | undefined;
    const have = bal ? BigInt(bal.raw) : 0n;
    const owed = BigInt(c.raw);
    const reverse = have < owed ? have : owed;
    if (reverse > 0n) out.push({ ...c, reverseRaw: reverse.toString() });
  }
  return out;
}

/**
 * A synthetic, correctly-shaped tx hash for a demo withdrawal.
 *
 * It has to look real to the member UI (which links it to a block explorer,
 * where it simply will not resolve). Admin surfaces key off `is_demo`, not the
 * hash, so nothing internal is fooled by it.
 */
export function demoTxHash(chain: string): string {
  const hex = randomBytes(32).toString("hex");
  // Tron hashes carry no 0x prefix; every other chain we support does.
  return chain === "tron" ? hex : "0x" + hex;
}

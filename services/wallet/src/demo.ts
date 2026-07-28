/**
 * ⚠ TEMPORARY — DEMO ACCOUNTS. Delete this whole feature when the demo is over.
 *
 * A demo account's withdrawals complete in the member UI **without ever
 * broadcasting** and without touching the treasury. It exists so the full
 * member flow can be exercised on the live box without spending real crypto.
 *
 * This re-introduces a bypass that `f76ec1f` deliberately removed ("every
 * withdrawal now broadcasts on-chain through the treasury, no exceptions").
 * It is only safe to run beside real members because of these guardrails —
 * do not weaken them:
 *
 *   1. **Opt-in per user id**, stored in `demo_accounts`. Never an env list of
 *      emails (the old bypass keyed on email, which a user can change).
 *   2. **Decided inside the wallet service.** No cross-service call, so a
 *      degraded auth service can never accidentally make a real account demo.
 *   3. **Fails closed.** Any error resolving demo status returns `false`, i.e.
 *      a real broadcast, never a silent skip.
 *   4. **Kill switch.** `DEMO_ACCOUNTS_ENABLED=0` disables every demo account
 *      instantly without a deploy.
 *   5. **Marked and excluded.** Demo withdrawals set `withdrawals.is_demo = 1`
 *      and are left out of platform accounting, so the real books stay honest.
 *
 * ── TEARDOWN (when the demo ends) ──────────────────────────────────────────
 *   1. Delete this file.
 *   2. Remove the `isDemoAccount` branch in `routes.ts` (POST /wallet/withdraw)
 *      and the demo admin endpoints.
 *   3. Remove `demo_accounts` + the `is_demo` column from `db/index.ts`.
 *   4. Zero any demo balances still sitting in `ledger_balances`.
 *   5. Drop `DEMO_ACCOUNTS_ENABLED` from `.env.prod`.
 * Grep for "TEMPORARY — DEMO" to find every touchpoint.
 */

import { rawDb } from "./db/index.js";
import { randomBytes } from "node:crypto";

/** Master switch — set DEMO_ACCOUNTS_ENABLED=0 to kill every demo account. */
const ENABLED = (process.env.DEMO_ACCOUNTS_ENABLED ?? "1") !== "0";

/**
 * Is this user a demo account? Fails CLOSED: on any error we return false, so
 * the withdrawal takes the real path rather than silently not sending.
 */
export function isDemoAccount(userId: string): boolean {
  if (!ENABLED) return false;
  try {
    const row = rawDb.prepare(`SELECT 1 AS x FROM demo_accounts WHERE user_id = ?`).get(userId);
    return !!row;
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

/**
 * A synthetic, correctly-shaped tx hash for a demo withdrawal.
 *
 * It has to look real to the member UI (which links it to a block explorer,
 * where it will simply not resolve). Admin surfaces read `is_demo`, not the
 * hash, so nothing internal is fooled by it.
 */
export function demoTxHash(chain: string): string {
  const hex = randomBytes(32).toString("hex");
  // Tron hashes carry no 0x prefix; every other chain we support does.
  return chain === "tron" ? hex : "0x" + hex;
}

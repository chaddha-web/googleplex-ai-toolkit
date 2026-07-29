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
 * Fabricated credit is tracked per (user, chain, symbol) in `demo_credits`, and
 * turning demo mode off **claws back every unit of value the account holds
 * beyond its real deposit inflow** before it can transact for real.
 *
 * Matching the claw-back to the credited (chain, symbol) alone is NOT enough:
 * a convert moves fabricated value into a pair that was never credited, and it
 * walks straight out of a per-pair reversal. (This happened on the live box —
 * 0.01 fabricated ETH became 18.77 bsc USDC and survived.) So the plan is
 * computed on VALUE, not on pairs: drain `holdings − real deposits`, taking
 * from credited pairs first. Real deposits are the floor and are never touched.
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
import { findToken } from "./tokens.js";
import { priceUsd } from "./prices.js";
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

/** Below this the residue is rounding noise, not money. */
const DUST_USD = 0.01;

type BalanceRow = { chain: string; symbol: string; raw: string };

/** Every non-zero ledger balance for an account. */
function heldBalances(userId: string): BalanceRow[] {
  try {
    return rawDb
      .prepare(`SELECT chain, symbol, raw FROM ledger_balances WHERE user_id = ? AND raw != '0'`)
      .all(userId) as BalanceRow[];
  } catch {
    return [];
  }
}

/** Best-effort USD value of a raw amount at the CURRENT price (0 if unpriced). */
function usdOf(chain: string, symbol: string, raw: bigint): number {
  const dec = findToken(chain as any, symbol)?.decimals ?? 18;
  const price = priceUsd(symbol as any) ?? 0;
  return (Number(raw) / 10 ** dec) * price;
}

/**
 * USD the account genuinely received on-chain. A demo account cannot be created
 * with deposit history, but it can be deposited INTO while demo mode is on —
 * that money is the member's, and the claw-back must never reach it.
 */
function realDepositUsd(userId: string): number {
  try {
    const rows = rawDb
      .prepare(`SELECT chain, symbol, amount_raw FROM deposits WHERE user_id = ?`)
      .all(userId) as Array<{ chain: string; symbol: string; amount_raw: string }>;
    return rows.reduce((s, d) => s + usdOf(d.chain, d.symbol, BigInt(d.amount_raw)), 0);
  } catch {
    return 0;
  }
}

export type ReversalLeg = {
  chain: string;
  symbol: string;
  reverseRaw: string;
  usd: number;
  /** `credited` — this exact pair was fabricated. `residual` — value that was
   *  converted into a pair we never credited, and would otherwise escape. */
  reason: "credited" | "residual";
};

/**
 * What must come out of the ledger before this account may transact for real.
 *
 * Computed on value, not on pairs: everything the account holds above its real
 * deposit inflow is fabricated, however it got shuffled between assets. Value
 * the demo account already destroyed (a demo withdrawal, the studio fee) is
 * simply absent from holdings, so it is never double-clawed — nothing was sent,
 * so there is nothing to recover.
 */
export function reversalPlan(userId: string): ReversalLeg[] {
  const held = heldBalances(userId);
  if (held.length === 0) return [];

  // Ceiling: we never take back more value than we handed out, revalued at
  // today's price so appreciation on fabricated coin can't be kept either.
  // With no fabricated credit on file this is 0 — a legitimately credited
  // balance (referral, manual adjustment) is not ours to confiscate.
  const credits = fabricatedCredits(userId);
  const capUsd = credits.reduce(
    (s, c) => s + Math.max(c.usd ?? 0, usdOf(c.chain, c.symbol, BigInt(c.raw))),
    0
  );
  if (capUsd <= DUST_USD) return [];

  const holdingsUsd = held.reduce((s, b) => s + usdOf(b.chain, b.symbol, BigInt(b.raw)), 0);
  let drainUsd = Math.min(holdingsUsd - realDepositUsd(userId), capUsd);

  // Fabricated pairs come out first so the claw-back mirrors the credit; the
  // shortfall is then taken from wherever the value was moved to, largest first.
  const owedByPair = new Map<string, bigint>();
  for (const c of credits) {
    const k = `${c.chain}:${c.symbol}`;
    owedByPair.set(k, (owedByPair.get(k) ?? 0n) + BigInt(c.raw));
  }
  const order = [...held].sort((a, b) => {
    const ra = owedByPair.has(`${a.chain}:${a.symbol}`) ? 0 : 1;
    const rb = owedByPair.has(`${b.chain}:${b.symbol}`) ? 0 : 1;
    if (ra !== rb) return ra - rb;
    return usdOf(b.chain, b.symbol, BigInt(b.raw)) - usdOf(a.chain, a.symbol, BigInt(a.raw));
  });

  const legs: ReversalLeg[] = [];
  for (const b of order) {
    const have = BigInt(b.raw);
    if (have <= 0n) continue;
    const key = `${b.chain}:${b.symbol}`;
    const owed = owedByPair.get(key);
    const haveUsd = usdOf(b.chain, b.symbol, have);

    // Unpriced token: value math is meaningless, so fall back to the per-pair
    // rule. Never leave fabricated units behind just because we lack a price.
    if (haveUsd <= 0) {
      if (owed === undefined) continue;
      const take = have < owed ? have : owed;
      if (take > 0n) {
        legs.push({ chain: b.chain, symbol: b.symbol, reverseRaw: take.toString(), usd: 0, reason: "credited" });
      }
      continue;
    }

    if (drainUsd <= DUST_USD) continue;
    let take: bigint;
    if (haveUsd <= drainUsd) {
      take = have;
    } else {
      const num = BigInt(Math.round((drainUsd / haveUsd) * 1_000_000));
      take = (have * num) / 1_000_000n;
    }
    if (take <= 0n) continue;
    const takeUsd = usdOf(b.chain, b.symbol, take);
    legs.push({
      chain: b.chain,
      symbol: b.symbol,
      reverseRaw: take.toString(),
      usd: takeUsd,
      reason: owed === undefined ? "residual" : "credited"
    });
    drainUsd -= takeUsd;
  }
  return legs;
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

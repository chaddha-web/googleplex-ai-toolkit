/**
 * Demo-account safety tests.
 *
 *   npx tsx src/demo.test.ts
 *
 * Focused on the two decisions where a bug costs real money:
 *   1. is a withdrawal allowed to skip the broadcast, and
 *   2. how much fabricated balance must be clawed back when demo mode is lifted
 *      (get this wrong and fake credit becomes a real treasury payout).
 *
 * Runs against a scratch SQLite file so it never touches a real wallet.db.
 */

import assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Point the db module at a throwaway file BEFORE importing anything that opens it.
const dir = mkdtempSync(join(tmpdir(), "gplex-demo-test-"));
process.env.WALLET_DB_PATH = join(dir, "wallet.db");
process.env.DEMO_ACCOUNTS_ENABLED = "1";

const { rawDb } = await import("./db/index.js");
const demo = await import("./demo.js");

const USER = "user-under-test";
const OTHER = "some-other-user";

function setBalance(userId: string, chain: string, symbol: string, raw: string, decimals = 18) {
  rawDb
    .prepare(
      `INSERT INTO ledger_balances (user_id, chain, symbol, raw, decimals, updated_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(user_id, chain, symbol) DO UPDATE SET raw = excluded.raw`
    )
    .run(userId, chain, symbol, raw, decimals, Date.now());
}

let depositSeq = 0;
function addDeposit(userId: string, chain: string, symbol: string, raw: string) {
  rawDb
    .prepare(
      `INSERT INTO deposits (id, user_id, chain, symbol, amount_raw, tx_hash, credited_at)
       VALUES (?,?,?,?,?,?,?)`
    )
    .run(`dep-${++depositSeq}`, userId, chain, symbol, raw, `0xtest${depositSeq}`, Date.now());
}

// ── Demo status ────────────────────────────────────────────────────────────
assert.equal(demo.isDemoAccount(USER), false, "unknown user is not a demo account");

rawDb
  .prepare(`INSERT INTO demo_accounts (user_id, note, created_by, created_at) VALUES (?,?,?,?)`)
  .run(USER, "test", "tester", Date.now());

assert.equal(demo.isDemoAccount(USER), true, "marked user is a demo account");
assert.equal(demo.isDemoAccount(OTHER), false, "demo status does not leak to other users");
assert.deepEqual(demo.demoUserIds(), [USER]);

// ── Fabricated-credit accounting ───────────────────────────────────────────
assert.equal(demo.fabricatedUsd(USER), 0, "no credit yet");

demo.recordFabricated(USER, "polygon", "USDC", 55_000_000n, 55);
demo.recordFabricated(USER, "bsc", "USDT", 10_000_000_000_000_000_000n, 10);
assert.equal(demo.fabricatedUsd(USER), 65, "credits accumulate in USD");

// Same (chain, symbol) twice must add, not overwrite — otherwise a second
// credit would silently erase the first one's claw-back obligation.
demo.recordFabricated(USER, "polygon", "USDC", 45_000_000n, 45);
const usdc = demo.fabricatedCredits(USER).find((c) => c.symbol === "USDC")!;
assert.equal(usdc.raw, "100000000", "raw amounts accumulate");
assert.equal(demo.fabricatedUsd(USER), 110, "usd accumulates");

// ── Reversal plan ──────────────────────────────────────────────────────────
// Balance still fully present → claw back the whole fabricated amount.
setBalance(USER, "polygon", "USDC", "100000000", 6);
setBalance(USER, "bsc", "USDT", "10000000000000000000");
{
  const plan = demo.reversalPlan(USER);
  const p = plan.find((x) => x.symbol === "USDC")!;
  assert.equal(p.reverseRaw, "100000000", "full fabricated amount is reversed");
  assert.equal(plan.length, 2);
}

// Partially spent → claw back only what is actually there. Reversing more
// would drive a real member's balance negative.
setBalance(USER, "polygon", "USDC", "30000000", 6);
{
  const p = demo.reversalPlan(USER).find((x) => x.symbol === "USDC")!;
  assert.equal(p.reverseRaw, "30000000", "reversal is capped at the current balance");
}

// Fully spent → nothing to reverse, and no negative entry produced.
setBalance(USER, "polygon", "USDC", "0", 6);
{
  const plan = demo.reversalPlan(USER);
  assert.equal(
    plan.find((x) => x.symbol === "USDC"),
    undefined,
    "a zero balance yields no reversal leg"
  );
}

// Balance ABOVE the fabricated amount, with no real deposits behind it. The
// account was funded from nothing, so the surplus is fabricated too (it can
// only be credit or appreciation on credit) and all of it comes back.
setBalance(USER, "bsc", "USDT", "25000000000000000000");
{
  const p = demo.reversalPlan(USER).find((x) => x.symbol === "USDT")!;
  assert.equal(p.reverseRaw, "25000000000000000000", "surplus over real inflow is clawed back");
}

// …but a REAL deposit is the member's money and is the floor. With 15 USDT
// genuinely deposited, only the 10 fabricated USDT may be taken.
addDeposit(USER, "bsc", "USDT", "15000000000000000000");
{
  const p = demo.reversalPlan(USER).find((x) => x.symbol === "USDT")!;
  assert.equal(p.reverseRaw, "10000000000000000000", "real deposits are never clawed back");
}
rawDb.prepare(`DELETE FROM deposits WHERE user_id = ?`).run(USER);

// The escape that per-pair matching missed on the live box: fabricated value
// CONVERTED into a pair that was never credited. Reversal must follow the
// value, not the (chain, symbol) it was handed out in.
setBalance(USER, "bsc", "USDT", "0");
setBalance(USER, "polygon", "USDC", "0", 6);
setBalance(USER, "bsc", "USDC", "18768100000000000000");
{
  const plan = demo.reversalPlan(USER);
  const p = plan.find((x) => x.chain === "bsc" && x.symbol === "USDC")!;
  assert.ok(p, "converted fabricated value is still reversed");
  assert.equal(p.reverseRaw, "18768100000000000000", "the whole converted residue comes back");
  assert.equal(p.reason, "residual", "flagged as value that moved between assets");
}

// ── Clearing ───────────────────────────────────────────────────────────────
demo.clearFabricated(USER);
assert.equal(demo.fabricatedUsd(USER), 0, "credits cleared");
assert.deepEqual(demo.reversalPlan(USER), [], "nothing left to reverse");

// ── Kill switch ────────────────────────────────────────────────────────────
{
  process.env.DEMO_ACCOUNTS_ENABLED = "0";
  // Cache-busting specifier so the module re-reads the env at import time.
  const fresh = (await import("./demo.js?killswitch" as string)) as typeof demo;
  assert.equal(
    fresh.isDemoAccount(USER),
    false,
    "DEMO_ACCOUNTS_ENABLED=0 disables demo mode even for a listed user"
  );
}

// ── Tx hash shape ──────────────────────────────────────────────────────────
assert.match(demo.demoTxHash("polygon"), /^0x[0-9a-f]{64}$/, "EVM hash is 0x + 64 hex");
assert.match(demo.demoTxHash("tron"), /^[0-9a-f]{64}$/, "Tron hash has no 0x prefix");
assert.notEqual(demo.demoTxHash("eth"), demo.demoTxHash("eth"), "hashes are unique");

// Best-effort: Windows keeps the SQLite handle open until the process exits,
// so the scratch dir can't always be removed here. The OS reclaims it.
try {
  rmSync(dir, { recursive: true, force: true });
} catch {
  /* leftover temp dir — harmless */
}
console.log("✓ demo account safety tests passed");

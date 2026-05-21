/**
 * Generates the company treasury (hot-wallet) keys that pay out withdrawals —
 * one per chain family (EVM, Tron, BTC) — KMS-encrypts each to
 *   $WALLET_SEED_DIR/treasury-<family>.bin
 * and prints the public addresses for you to FUND.
 *
 *   docker compose ... exec wallet npx tsx services/wallet/bin/init-treasury.ts
 *
 * ⚠ Run ONCE per environment. Refuses to clobber existing files. After running,
 *   fund the printed addresses with native gas + the stablecoin/PARTY liquidity
 *   you intend to pay withdrawals from. Losing these files + the KMS key means
 *   the company funds are unrecoverable.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  generateTreasuryKey,
  saveTreasuryKey,
  type TreasuryFamily
} from "../src/treasury.js";

const FAMILIES: TreasuryFamily[] = ["evm", "tron", "btc"];
const SEED_DIR = process.env.WALLET_SEED_DIR || "./data/seeds";

for (const f of FAMILIES) {
  const path = resolve(`${SEED_DIR}/treasury-${f}.bin`);
  if (existsSync(path)) {
    console.error(
      `[init-treasury] Refusing to overwrite ${path}\n` +
        `  A treasury key already exists. Delete BY HAND only if you really\n` +
        `  mean to rotate it (old company funds become inaccessible).`
    );
    process.exit(1);
  }
}

if (!process.env.KMS_KEY_ID || !process.env.AWS_REGION) {
  console.error("[init-treasury] AWS_REGION and KMS_KEY_ID must be set");
  process.exit(1);
}

console.log("Generating company treasury keys…\n");

const addrs: Record<string, string> = {};
for (const f of FAMILIES) {
  const { privHex, address } = generateTreasuryKey(f);
  await saveTreasuryKey(f, privHex);
  addrs[f] = address;
  console.log(`  ✓ ${f.padEnd(5)} key encrypted → ${SEED_DIR}/treasury-${f}.bin`);
}

console.log("\n──────────────────────────────────────────────────────────");
console.log("FUND THESE COMPANY ADDRESSES (native gas + liquidity):\n");
console.log(`  EVM (ETH + BSC):  ${addrs.evm}`);
console.log(`  TRON (TRX/TRC20): ${addrs.tron}`);
console.log(`  BTC:              ${addrs.btc}`);
console.log("\nReminder:");
console.log("  • EVM: hold ETH (gas) + BNB (gas) + USDT/USDC on each chain.");
console.log("  • TRON: hold TRX (energy/bandwidth) + USDT/USDC/PARTY.");
console.log("  • BTC: hold BTC (covers the send + miner fee).");
console.log("──────────────────────────────────────────────────────────");

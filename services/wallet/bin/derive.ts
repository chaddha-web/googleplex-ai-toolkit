/**
 * Derives the 4 deposit addresses for a given userIndex.
 *
 *   npm run derive --workspace @googolplex/wallet -- 42
 */

import { deriveUserAddresses } from "../src/hd.js";

const arg = process.argv[2];
if (!arg || !/^\d+$/.test(arg)) {
  console.error("usage: derive <userIndex>");
  process.exit(1);
}
const userIndex = Number(arg);

const evmXpub = process.env.EVM_MASTER_XPUB;
const btcXpub = process.env.BTC_MASTER_XPUB;
const tronXpub = process.env.TRON_MASTER_XPUB;

if (!evmXpub || !btcXpub || !tronXpub) {
  console.error("EVM_MASTER_XPUB / BTC_MASTER_XPUB / TRON_MASTER_XPUB not set in .env");
  console.error("Run `npm run init-seeds` first.");
  process.exit(1);
}

const addrs = deriveUserAddresses({ userIndex, evmXpub, btcXpub, tronXpub });

console.log(`\nDeposit addresses for user #${userIndex}\n`);
console.log(`  ETH   ${addrs.eth}`);
console.log(`  BSC   ${addrs.bsc}   (same as ETH)`);
console.log(`  TRON  ${addrs.tron}`);
console.log(`  BTC   ${addrs.btc}`);
console.log("");

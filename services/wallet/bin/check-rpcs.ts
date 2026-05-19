/**
 * Pings every configured RPC and reports success / failure. Run this first
 * after dropping keys into .env to confirm everything's reachable.
 *
 *   npm run check-rpcs --workspace @googolplex/wallet
 */

import "node:process";
import { pingEth } from "../src/chain/eth.js";
import { pingBsc } from "../src/chain/bsc.js";
import { pingTron } from "../src/chain/tron.js";
import { pingBtc } from "../src/chain/btc.js";

type Check = { chain: string; run: () => Promise<unknown> };

const checks: Check[] = [
  { chain: "ETH ", run: pingEth },
  { chain: "BSC ", run: pingBsc },
  { chain: "TRON", run: pingTron },
  { chain: "BTC ", run: pingBtc }
];

let failures = 0;

for (const c of checks) {
  process.stdout.write(`[${c.chain}] `);
  try {
    const result = await c.run();
    process.stdout.write(`✓  block ${String(result)}\n`);
  } catch (err) {
    failures += 1;
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(`✗  ${msg}\n`);
  }
}

console.log("");
if (failures === 0) {
  console.log("All RPCs reachable.");
  process.exit(0);
} else {
  console.error(`${failures} RPC(s) failed. Check your .env.`);
  process.exit(1);
}

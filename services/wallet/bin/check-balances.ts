/**
 * Reads every supported asset's balance for one address on one chain.
 *
 *   npm run balances --workspace @googolplex/wallet -- eth  0xAbC...
 *   npm run balances --workspace @googolplex/wallet -- bsc  0xAbC...
 *   npm run balances --workspace @googolplex/wallet -- polygon 0xAbC...
 *   npm run balances --workspace @googolplex/wallet -- tron T...
 *   npm run balances --workspace @googolplex/wallet -- btc  bc1q...
 */

import { tokensByChain, type Chain } from "../src/tokens.js";
import { getEthBalance, getErc20Balance } from "../src/chain/eth.js";
import { getBnbBalance, getBep20Balance } from "../src/chain/bsc.js";
import { getPolBalance, getPolygonErc20Balance } from "../src/chain/polygon.js";
import { getTrxBalance, getTrc20Balance } from "../src/chain/tron.js";
import { getBtcBalance } from "../src/chain/btc.js";

const [, , rawChain, address] = process.argv;
if (!rawChain || !address || !["eth", "bsc", "polygon", "tron", "btc"].includes(rawChain)) {
  console.error("usage: balances <eth|bsc|polygon|tron|btc> <address>");
  process.exit(1);
}
const chain = rawChain as Chain;

const tokens = tokensByChain(chain);

console.log(`\nBalances for ${address} on ${chain}\n`);

for (const t of tokens) {
  try {
    let bal: string;
    if (t.native) {
      bal =
        chain === "eth"     ? await getEthBalance(address) :
        chain === "bsc"     ? await getBnbBalance(address) :
        chain === "polygon" ? await getPolBalance(address) :
        chain === "tron"    ? await getTrxBalance(address) :
                              await getBtcBalance(address);
    } else if (chain === "eth") {
      bal = await getErc20Balance({ holder: address, token: t.address!, decimals: t.decimals });
    } else if (chain === "bsc") {
      bal = await getBep20Balance({ holder: address, token: t.address!, decimals: t.decimals });
    } else if (chain === "polygon") {
      bal = await getPolygonErc20Balance({ holder: address, token: t.address!, decimals: t.decimals });
    } else if (chain === "tron") {
      bal = await getTrc20Balance({ holder: address, token: t.address!, decimals: t.decimals });
    } else {
      continue;
    }
    console.log(`  ${t.symbol.padEnd(8)} ${bal}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ${t.symbol.padEnd(8)} (error: ${msg})`);
  }
}

console.log("");

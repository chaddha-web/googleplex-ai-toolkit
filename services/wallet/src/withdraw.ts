/**
 * Withdrawal orchestrator — given (chain, symbol, amountRaw, dest), pays the
 * user out of the company treasury wallet on the right chain and returns the
 * broadcast tx hash. All funds leave the treasury, never per-user addresses.
 */

import { findToken } from "./tokens.js";
import { sendEvmNative, sendEvmErc20, isValidEvmAddress } from "./sign/evm.js";
import { sendTronNative, sendTronTrc20, isValidTronAddress } from "./sign/tron.js";
import { sendBtc, isValidBtcAddress } from "./sign/btc.js";

export function isValidDestination(chain: string, addr: string): boolean {
  if (chain === "eth" || chain === "bsc") return isValidEvmAddress(addr);
  if (chain === "tron") return isValidTronAddress(addr);
  if (chain === "btc") return isValidBtcAddress(addr);
  return false;
}

export async function sendWithdrawal(opts: {
  chain: string;
  symbol: string;
  amountRaw: string;
  destAddress: string;
}): Promise<string> {
  const { chain, symbol, amountRaw, destAddress } = opts;
  const token = findToken(chain as any, symbol);
  if (!token) throw new Error(`Unsupported asset ${symbol} on ${chain}`);
  if (!isValidDestination(chain, destAddress)) {
    throw new Error("Invalid destination address for this chain");
  }

  if (chain === "eth" || chain === "bsc") {
    if (token.native) {
      return sendEvmNative({ chain, to: destAddress, amountRaw });
    }
    return sendEvmErc20({ chain, token: token.address!, to: destAddress, amountRaw });
  }

  if (chain === "tron") {
    if (token.native) {
      return sendTronNative({ to: destAddress, amountRaw });
    }
    return sendTronTrc20({ contract: token.address!, to: destAddress, amountRaw });
  }

  if (chain === "btc") {
    return sendBtc({ to: destAddress, amountRaw });
  }

  throw new Error(`Unsupported chain ${chain}`);
}

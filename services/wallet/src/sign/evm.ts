/**
 * EVM payout signer (ETH + BSC) — sends native or ERC20 from the company
 * treasury key. viem handles nonce + gas estimation.
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  isAddress,
  type Chain as ViemChain
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, bsc } from "viem/chains";
import { loadTreasuryPriv } from "../treasury.js";

const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)"
]);

type EvmChain = "eth" | "bsc";

function chainConfig(chain: EvmChain): { viemChain: ViemChain; rpc: string } {
  if (chain === "eth") {
    return {
      viemChain: mainnet,
      rpc: process.env.ETH_RPC_URL ?? "https://cloudflare-eth.com"
    };
  }
  return {
    viemChain: bsc,
    rpc: process.env.BSC_RPC_URL ?? "https://bsc-dataseed.binance.org"
  };
}

async function clients(chain: EvmChain) {
  const { viemChain, rpc } = chainConfig(chain);
  const priv = await loadTreasuryPriv("evm");
  const account = privateKeyToAccount(`0x${priv.replace(/^0x/, "")}`);
  const wallet = createWalletClient({ account, chain: viemChain, transport: http(rpc) });
  const pub = createPublicClient({ chain: viemChain, transport: http(rpc) });
  return { wallet, pub, account };
}

export function isValidEvmAddress(addr: string): boolean {
  return isAddress(addr);
}

/** Send native ETH/BNB. amountRaw = wei string. Returns tx hash. */
export async function sendEvmNative(opts: {
  chain: EvmChain;
  to: string;
  amountRaw: string;
}): Promise<string> {
  if (!isAddress(opts.to)) throw new Error("Invalid destination address");
  const { wallet } = await clients(opts.chain);
  return wallet.sendTransaction({
    to: opts.to as `0x${string}`,
    value: BigInt(opts.amountRaw)
  });
}

/** Send an ERC20/BEP20 token. amountRaw = base units string. Returns tx hash. */
export async function sendEvmErc20(opts: {
  chain: EvmChain;
  token: string;
  to: string;
  amountRaw: string;
}): Promise<string> {
  if (!isAddress(opts.to)) throw new Error("Invalid destination address");
  const { wallet } = await clients(opts.chain);
  return wallet.writeContract({
    address: opts.token as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [opts.to as `0x${string}`, BigInt(opts.amountRaw)]
  });
}

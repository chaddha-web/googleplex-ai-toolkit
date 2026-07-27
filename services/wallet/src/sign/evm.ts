/**
 * EVM payout signer (ETH + BSC + Polygon) — sends native or ERC20 from the company
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
import { mainnet, bsc, polygon } from "viem/chains";
import { privKeyForChain } from "../treasury.js";

const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)"
]);

type EvmChain = "eth" | "bsc" | "polygon";

function chainConfig(chain: EvmChain): { viemChain: ViemChain; rpc: string } {
  if (chain === "eth") {
    return {
      viemChain: mainnet,
      rpc: process.env.ETH_RPC_URL ?? "https://cloudflare-eth.com"
    };
  }
  if (chain === "polygon") {
    return {
      viemChain: polygon,
      rpc: process.env.POLYGON_RPC_URL ?? "https://polygon-rpc.com"
    };
  }
  return {
    viemChain: bsc,
    rpc: process.env.BSC_RPC_URL ?? "https://bsc-dataseed.binance.org"
  };
}

async function clients(chain: EvmChain) {
  const { viemChain, rpc } = chainConfig(chain);
  const priv = await privKeyForChain(chain);
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

// ── Sweep primitives (read balances, estimate gas, sign from an arbitrary
// derived user key). Used only by the flush/sweep orchestrator. ────────────

function pubClient(chain: EvmChain) {
  const { viemChain, rpc } = chainConfig(chain);
  return createPublicClient({ chain: viemChain, transport: http(rpc) });
}
function walletFromPriv(chain: EvmChain, priv: string) {
  const { viemChain, rpc } = chainConfig(chain);
  const account = privateKeyToAccount(`0x${priv.replace(/^0x/, "")}`);
  return {
    account,
    wallet: createWalletClient({ account, chain: viemChain, transport: http(rpc) })
  };
}

export async function evmNativeBalance(chain: EvmChain, address: string): Promise<bigint> {
  return pubClient(chain).getBalance({ address: address as `0x${string}` });
}
export async function evmTokenBalance(
  chain: EvmChain,
  token: string,
  address: string
): Promise<bigint> {
  return pubClient(chain).readContract({
    address: token as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address as `0x${string}`]
  }) as Promise<bigint>;
}
export async function evmGasPrice(chain: EvmChain): Promise<bigint> {
  return pubClient(chain).getGasPrice();
}

/** Wait for a tx to be mined. Returns true on success. */
export async function evmWaitReceipt(chain: EvmChain, hash: string): Promise<boolean> {
  const r = await pubClient(chain).waitForTransactionReceipt({
    hash: hash as `0x${string}`,
    timeout: 180_000
  });
  return r.status === "success";
}

/** Sign a native transfer from an arbitrary derived key (sweep leg). */
export async function evmSendNativeFromPriv(opts: {
  chain: EvmChain;
  priv: string;
  to: string;
  amountRaw: string;
}): Promise<string> {
  if (!isAddress(opts.to)) throw new Error("Invalid destination address");
  const { wallet } = walletFromPriv(opts.chain, opts.priv);
  return wallet.sendTransaction({
    to: opts.to as `0x${string}`,
    value: BigInt(opts.amountRaw)
  });
}

/** Sign an ERC-20 transfer from an arbitrary derived key (token sweep leg). */
export async function evmSendErc20FromPriv(opts: {
  chain: EvmChain;
  priv: string;
  token: string;
  to: string;
  amountRaw: string;
}): Promise<string> {
  if (!isAddress(opts.to)) throw new Error("Invalid destination address");
  const { wallet } = walletFromPriv(opts.chain, opts.priv);
  return wallet.writeContract({
    address: opts.token as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [opts.to as `0x${string}`, BigInt(opts.amountRaw)]
  });
}

/** Gas costs (wei) for the two sweep leg types, at current gas price. */
export const EVM_NATIVE_GAS = 21_000n;
export const EVM_ERC20_GAS = 90_000n; // generous ceiling for a token transfer

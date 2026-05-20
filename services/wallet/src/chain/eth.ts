import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";

const RPC = process.env.ETH_RPC_URL;
if (!RPC) console.warn("[wallet/eth] ETH_RPC_URL not set");

export const ethClient = createPublicClient({
  chain: mainnet,
  transport: http(RPC ?? "https://cloudflare-eth.com")
});

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
]);

/** Returns ETH balance as a RAW base-unit string (wei). */
export async function getEthBalance(address: string): Promise<string> {
  const wei = await ethClient.getBalance({ address: address as `0x${string}` });
  return wei.toString();
}

/** Returns ERC20 balance as a RAW base-unit string (no decimal scaling). */
export async function getErc20Balance(opts: {
  holder: string;
  token: string;
  decimals: number;
}): Promise<string> {
  const raw = (await ethClient.readContract({
    address: opts.token as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [opts.holder as `0x${string}`]
  })) as bigint;
  return raw.toString();
}

/** Quick connectivity check — fetches the current block number. */
export async function pingEth(): Promise<bigint> {
  return ethClient.getBlockNumber();
}

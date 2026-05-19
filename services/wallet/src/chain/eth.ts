import { createPublicClient, http, parseAbi, formatUnits } from "viem";
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

/** Returns ETH balance as a decimal string ("0.0123"). */
export async function getEthBalance(address: string): Promise<string> {
  const wei = await ethClient.getBalance({ address: address as `0x${string}` });
  return formatUnits(wei, 18);
}

/** Returns ERC20 balance as a decimal string for the given token. */
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
  return formatUnits(raw, opts.decimals);
}

/** Quick connectivity check — fetches the current block number. */
export async function pingEth(): Promise<bigint> {
  return ethClient.getBlockNumber();
}

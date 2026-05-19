import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import { bsc } from "viem/chains";

const RPC = process.env.BSC_RPC_URL ?? "https://bsc-dataseed.binance.org";

export const bscClient = createPublicClient({
  chain: bsc,
  transport: http(RPC)
});

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
]);

/** Returns BNB balance as a decimal string. */
export async function getBnbBalance(address: string): Promise<string> {
  const wei = await bscClient.getBalance({ address: address as `0x${string}` });
  return formatUnits(wei, 18);
}

/** Returns BEP20 balance as a decimal string. */
export async function getBep20Balance(opts: {
  holder: string;
  token: string;
  decimals: number;
}): Promise<string> {
  const raw = (await bscClient.readContract({
    address: opts.token as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [opts.holder as `0x${string}`]
  })) as bigint;
  return formatUnits(raw, opts.decimals);
}

export async function pingBsc(): Promise<bigint> {
  return bscClient.getBlockNumber();
}

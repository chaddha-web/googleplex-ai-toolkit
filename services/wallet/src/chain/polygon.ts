import { createPublicClient, http, parseAbi } from "viem";
import { polygon } from "viem/chains";

const RPC = process.env.POLYGON_RPC_URL ?? "https://polygon-rpc.com";

export const polygonClient = createPublicClient({
  chain: polygon,
  transport: http(RPC)
});

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
]);

/** Returns POL balance as a RAW base-unit string (wei). */
export async function getPolBalance(address: string): Promise<string> {
  const wei = await polygonClient.getBalance({ address: address as `0x${string}` });
  return wei.toString();
}

/** Returns a Polygon ERC20 balance as a RAW base-unit string (no decimal scaling). */
export async function getPolygonErc20Balance(opts: {
  holder: string;
  token: string;
  decimals: number;
}): Promise<string> {
  const raw = (await polygonClient.readContract({
    address: opts.token as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [opts.holder as `0x${string}`]
  })) as bigint;
  return raw.toString();
}

export async function pingPolygon(): Promise<bigint> {
  return polygonClient.getBlockNumber();
}

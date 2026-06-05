/**
 * Incoming-transfer indexer. Where reconcile.ts reads *balances* (balanceOf),
 * this reads individual *transfers* into a user's deposit address — giving us
 * the real on-chain tx hash, the sender address, and per-deposit amounts for
 * the transaction history.
 *
 *   - TRON: TronGrid TRC20 transfer history (authoritative, has the API key).
 *   - EVM (ETH/BSC): viem getLogs over the ERC20 Transfer event, bounded to a
 *     recent block window (public RPCs cap getLogs ranges). Best-effort — if
 *     the RPC rejects the range, we skip and the balance path still credits.
 *   - BTC: not indexed here (balanceOf only) — added later if needed.
 *
 * Everything is read-only; callers persist + dedupe by tx hash.
 */

import { parseAbiItem } from "viem";
import { ethClient } from "./chain/eth.js";
import { bscClient } from "./chain/bsc.js";
import { TOKENS } from "./tokens.js";

export type IncomingTransfer = {
  chain: "eth" | "bsc" | "tron";
  symbol: string;
  amountRaw: string; // base units
  txHash: string;
  from: string;
  blockNumber: number | null;
  ts: number | null; // ms epoch
};

const TRON_API = process.env.TRON_API_URL ?? "https://api.trongrid.io";
const TRON_KEY = process.env.TRON_API_KEY;
// How many recent blocks to scan for EVM Transfer logs. ~ a few days on both
// chains; new deposits are caught on the refresh that follows them. Tunable.
const EVM_LOG_RANGE = BigInt(process.env.EVM_LOG_RANGE ?? 200_000);

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

/** TRC20 transfers INTO a Tron address (USDT/USDC/PARTY). */
async function scanTron(address: string): Promise<IncomingTransfer[]> {
  const tronTokens = TOKENS.filter((t) => t.chain === "tron" && !t.native);
  const byContract = new Map(tronTokens.map((t) => [(t as any).address as string, t]));
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (TRON_KEY) headers["TRON-PRO-API-KEY"] = TRON_KEY;

  const url = `${TRON_API}/v1/accounts/${address}/transactions/trc20?only_to=true&limit=50`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`TronGrid trc20 history ${res.status}`);
  const data = (await res.json()) as {
    data?: Array<{
      transaction_id: string;
      from: string;
      to: string;
      value: string;
      token_info?: { address?: string; symbol?: string; decimals?: number };
      block_timestamp?: number;
      type?: string;
    }>;
  };

  const out: IncomingTransfer[] = [];
  for (const t of data.data ?? []) {
    if (t.type && t.type !== "Transfer") continue;
    const contract = t.token_info?.address ?? "";
    const known = byContract.get(contract);
    if (!known) continue; // ignore unknown tokens (spam/airdrops)
    out.push({
      chain: "tron",
      symbol: known.symbol,
      amountRaw: String(t.value),
      txHash: t.transaction_id,
      from: t.from,
      blockNumber: null,
      ts: t.block_timestamp ?? null
    });
  }
  return out;
}

/** ERC20/BEP20 transfers INTO an EVM address, via getLogs (bounded). */
async function scanEvm(
  chain: "eth" | "bsc",
  address: string
): Promise<IncomingTransfer[]> {
  const client = chain === "eth" ? ethClient : bscClient;
  const tokens = TOKENS.filter((t) => t.chain === chain && !t.native);
  const out: IncomingTransfer[] = [];

  let latest: bigint;
  try {
    latest = await client.getBlockNumber();
  } catch {
    return out; // RPC down — skip, balance path still works
  }
  const fromBlock = latest > EVM_LOG_RANGE ? latest - EVM_LOG_RANGE : 0n;

  for (const tok of tokens) {
    try {
      const logs = await client.getLogs({
        address: (tok as any).address as `0x${string}`,
        event: TRANSFER_EVENT,
        args: { to: address as `0x${string}` },
        fromBlock,
        toBlock: "latest"
      });
      for (const log of logs) {
        const value = (log.args as any)?.value as bigint | undefined;
        const from = (log.args as any)?.from as string | undefined;
        if (value == null || !from) continue;
        out.push({
          chain,
          symbol: tok.symbol,
          amountRaw: value.toString(),
          txHash: log.transactionHash,
          from,
          blockNumber: log.blockNumber != null ? Number(log.blockNumber) : null,
          ts: null
        });
      }
    } catch {
      // Provider rejected the range / token — skip this token, keep going.
    }
  }
  return out;
}

/**
 * Scan all of a user's deposit addresses for incoming transfers. Per-chain
 * failures are swallowed so one bad RPC doesn't sink the whole scan.
 */
export async function scanIncomingTransfers(addrs: {
  eth: string;
  bsc: string;
  tron: string;
  btc: string;
}): Promise<IncomingTransfer[]> {
  const results = await Promise.allSettled([
    scanEvm("eth", addrs.eth),
    scanEvm("bsc", addrs.bsc),
    scanTron(addrs.tron)
  ]);
  const out: IncomingTransfer[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") out.push(...r.value);
  }
  return out;
}

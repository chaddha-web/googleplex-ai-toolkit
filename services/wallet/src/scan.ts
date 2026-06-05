/**
 * Incoming-transfer indexer — reads individual deposits into a user's address
 * across ALL chains, giving the real on-chain tx hash, sender, amount + time
 * for the transaction history. (reconcile.ts reads balances; this reads the
 * transfers behind them.)
 *
 *   - EVM (ETH/BSC): Etherscan V2 unified API (one ETHERSCAN_API_KEY, chainid
 *     switch) for native + ERC20/BEP20 transfers. Falls back to viem getLogs
 *     (bounded) for tokens if no key is set.
 *   - TRON: TronGrid — TRC20 transfers + native TRX transfers (TRON_API_KEY).
 *   - BTC: mempool.space address txs (no key).
 *
 * All read-only; callers persist + dedupe by tx hash. Per-chain failures are
 * swallowed so one bad provider doesn't sink the whole scan.
 */

import { createHash } from "node:crypto";
import { parseAbiItem } from "viem";
import { ethClient } from "./chain/eth.js";
import { bscClient } from "./chain/bsc.js";
import { TOKENS } from "./tokens.js";

export type IncomingTransfer = {
  chain: "eth" | "bsc" | "tron" | "btc";
  symbol: string;
  amountRaw: string; // base units
  txHash: string;
  from: string;
  blockNumber: number | null;
  ts: number | null; // ms epoch
};

const TRON_API = process.env.TRON_API_URL ?? "https://api.trongrid.io";
const TRON_KEY = process.env.TRON_API_KEY;
const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY; // V2: one key, all EVM chains
const ETHERSCAN_V2 = "https://api.etherscan.io/v2/api";
const BTC_API = process.env.BTC_API_URL ?? "https://mempool.space/api";
const EVM_LOG_RANGE = BigInt(process.env.EVM_LOG_RANGE ?? 200_000);
const ETH_RPC = process.env.ETH_RPC_URL ?? "";
const BSC_RPC = process.env.BSC_RPC_URL ?? "";
const isAlchemy = (u: string) => /alchemy\.com/i.test(u);

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

const lc = (s: string) => s.toLowerCase();

// ── EVM via Etherscan V2 (preferred — full history) ─────────────────────────
async function scanEvmEtherscan(
  chain: "eth" | "bsc",
  address: string
): Promise<IncomingTransfer[]> {
  const chainId = chain === "eth" ? 1 : 56;
  const nativeSym = chain === "eth" ? "ETH" : "BNB";
  const out: IncomingTransfer[] = [];
  const tokenByContract = new Map(
    TOKENS.filter((t) => t.chain === chain && !t.native).map((t) => [lc((t as any).address), t])
  );

  const base = `${ETHERSCAN_V2}?chainid=${chainId}&address=${address}&page=1&offset=100&sort=desc&apikey=${ETHERSCAN_KEY}`;

  // ERC20 / BEP20 transfers
  try {
    const r = await fetch(`${base}&module=account&action=tokentx`);
    const j = (await r.json()) as { status: string; result: any[] };
    if (Array.isArray(j.result)) {
      for (const t of j.result) {
        if (lc(t.to) !== lc(address)) continue; // incoming only
        const known = tokenByContract.get(lc(t.contractAddress));
        if (!known) continue; // ignore unknown tokens (spam)
        out.push({
          chain,
          symbol: known.symbol,
          amountRaw: String(t.value),
          txHash: t.hash,
          from: t.from,
          blockNumber: t.blockNumber ? Number(t.blockNumber) : null,
          ts: t.timeStamp ? Number(t.timeStamp) * 1000 : null
        });
      }
    }
  } catch {
    /* skip ERC20 */
  }

  // Native ETH / BNB transfers
  try {
    const r = await fetch(`${base}&module=account&action=txlist`);
    const j = (await r.json()) as { status: string; result: any[] };
    if (Array.isArray(j.result)) {
      for (const t of j.result) {
        if (lc(t.to ?? "") !== lc(address)) continue;
        if (t.isError !== "0") continue;
        if (!t.value || t.value === "0") continue;
        out.push({
          chain,
          symbol: nativeSym,
          amountRaw: String(t.value),
          txHash: t.hash,
          from: t.from,
          blockNumber: t.blockNumber ? Number(t.blockNumber) : null,
          ts: t.timeStamp ? Number(t.timeStamp) * 1000 : null
        });
      }
    }
  } catch {
    /* skip native */
  }
  return out;
}

// ── EVM via viem getLogs (fallback when no Etherscan key) ───────────────────
async function scanEvmLogs(
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
    return out;
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
      /* skip token */
    }
  }
  return out;
}

// ── EVM via Alchemy getAssetTransfers (preferred — full history, no key) ────
// Both our ETH + BSC RPCs are Alchemy, which exposes alchemy_getAssetTransfers:
// a single call returns the full incoming-transfer history (native + ERC20)
// with tx hash, sender, raw amount, and block timestamp. No block-range cap,
// no extra API key — reuses the RPC we already have.
async function scanEvmAlchemy(
  chain: "eth" | "bsc",
  address: string
): Promise<IncomingTransfer[]> {
  const rpc = chain === "eth" ? ETH_RPC : BSC_RPC;
  const nativeSym = chain === "eth" ? "ETH" : "BNB";
  const tokenByContract = new Map(
    TOKENS.filter((t) => t.chain === chain && !t.native).map((t) => [lc((t as any).address), t])
  );
  const out: IncomingTransfer[] = [];

  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "alchemy_getAssetTransfers",
    params: [
      {
        toAddress: address,
        category: ["external", "erc20"], // native + tokens
        withMetadata: true,
        excludeZeroValue: true,
        order: "desc",
        maxCount: "0x32" // 50
      }
    ]
  };

  const res = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`alchemy_getAssetTransfers ${res.status}`);
  const j = (await res.json()) as { result?: { transfers?: any[] } };

  for (const t of j.result?.transfers ?? []) {
    const rawHex = t.rawContract?.value as string | undefined;
    if (!rawHex) continue;
    let symbol: string | null = null;
    if (t.category === "external") {
      symbol = nativeSym;
    } else if (t.category === "erc20") {
      const known = tokenByContract.get(lc(t.rawContract?.address ?? ""));
      if (!known) continue; // ignore unknown tokens (spam/airdrops)
      symbol = known.symbol;
    } else {
      continue;
    }
    const ts = t.metadata?.blockTimestamp ? Date.parse(t.metadata.blockTimestamp) : null;
    out.push({
      chain,
      symbol,
      amountRaw: BigInt(rawHex).toString(),
      txHash: t.hash,
      from: t.from,
      blockNumber: t.blockNum ? parseInt(t.blockNum, 16) : null,
      ts: Number.isFinite(ts as number) ? (ts as number) : null
    });
  }
  return out;
}

async function scanEvm(chain: "eth" | "bsc", address: string): Promise<IncomingTransfer[]> {
  const rpc = chain === "eth" ? ETH_RPC : BSC_RPC;
  // Prefer Alchemy's transfer API (full history, reuses our RPC key), then
  // Etherscan V2 (if a key is configured), then bounded getLogs as a last
  // resort.
  if (isAlchemy(rpc)) {
    try {
      return await scanEvmAlchemy(chain, address);
    } catch {
      /* fall through */
    }
  }
  if (ETHERSCAN_KEY) {
    try {
      return await scanEvmEtherscan(chain, address);
    } catch {
      /* fall through */
    }
  }
  return scanEvmLogs(chain, address);
}

// ── TRON (TRC20 + native TRX) ───────────────────────────────────────────────
async function scanTron(address: string): Promise<IncomingTransfer[]> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (TRON_KEY) headers["TRON-PRO-API-KEY"] = TRON_KEY;
  const out: IncomingTransfer[] = [];
  const byContract = new Map(
    TOKENS.filter((t) => t.chain === "tron" && !t.native).map((t) => [(t as any).address as string, t])
  );

  // TRC20
  try {
    const r = await fetch(`${TRON_API}/v1/accounts/${address}/transactions/trc20?only_to=true&limit=50`, { headers });
    const j = (await r.json()) as { data?: any[] };
    for (const t of j.data ?? []) {
      if (t.type && t.type !== "Transfer") continue;
      const known = byContract.get(t.token_info?.address ?? "");
      if (!known) continue;
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
  } catch {
    /* skip trc20 */
  }

  // Native TRX (TransferContract)
  try {
    const r = await fetch(`${TRON_API}/v1/accounts/${address}/transactions?only_to=true&limit=30`, { headers });
    const j = (await r.json()) as { data?: any[] };
    for (const t of j.data ?? []) {
      const c = t.raw_data?.contract?.[0];
      if (c?.type !== "TransferContract") continue;
      const v = c.parameter?.value;
      if (!v?.amount) continue;
      // owner_address / to_address are hex (41…) here; we keep the tx + amount.
      out.push({
        chain: "tron",
        symbol: "TRX",
        amountRaw: String(v.amount),
        txHash: t.txID,
        from: hexToTronBase58(v.owner_address) ?? v.owner_address ?? "",
        blockNumber: null,
        ts: t.block_timestamp ?? null
      });
    }
  } catch {
    /* skip native */
  }
  return out;
}

// ── BTC via mempool.space ───────────────────────────────────────────────────
async function scanBtc(address: string): Promise<IncomingTransfer[]> {
  const out: IncomingTransfer[] = [];
  try {
    const r = await fetch(`${BTC_API}/address/${address}/txs`);
    const txs = (await r.json()) as any[];
    if (!Array.isArray(txs)) return out;
    for (const tx of txs) {
      // Received = sum of outputs paying our address.
      let received = 0n;
      for (const vout of tx.vout ?? []) {
        if (vout.scriptpubkey_address === address) received += BigInt(vout.value ?? 0);
      }
      if (received <= 0n) continue;
      // Skip if we were also an input (self-transfer / change) — net it out.
      let spent = 0n;
      for (const vin of tx.vin ?? []) {
        if (vin.prevout?.scriptpubkey_address === address) spent += BigInt(vin.prevout.value ?? 0);
      }
      const net = received - spent;
      if (net <= 0n) continue;
      const from = tx.vin?.[0]?.prevout?.scriptpubkey_address ?? "";
      out.push({
        chain: "btc",
        symbol: "BTC",
        amountRaw: net.toString(),
        txHash: tx.txid,
        from,
        blockNumber: tx.status?.block_height ?? null,
        ts: tx.status?.block_time ? tx.status.block_time * 1000 : null
      });
    }
  } catch {
    /* skip btc */
  }
  return out;
}

/** Scan every deposit address for incoming transfers across all chains. */
export async function scanIncomingTransfers(addrs: {
  eth: string;
  bsc: string;
  tron: string;
  btc: string;
}): Promise<IncomingTransfer[]> {
  const results = await Promise.allSettled([
    scanEvm("eth", addrs.eth),
    scanEvm("bsc", addrs.bsc),
    scanTron(addrs.tron),
    scanBtc(addrs.btc)
  ]);
  const out: IncomingTransfer[] = [];
  for (const r of results) if (r.status === "fulfilled") out.push(...r.value);
  return out;
}

// Minimal hex(41-prefixed) → Tron base58check, for native TRX sender display.
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function hexToTronBase58(hex?: string): string | null {
  if (!hex) return null;
  try {
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    const payload = Buffer.from(clean, "hex"); // 21 bytes (0x41 + 20)
    const sha256 = (b: Buffer) => createHash("sha256").update(b).digest();
    const checksum = sha256(sha256(payload)).subarray(0, 4);
    const full = Buffer.concat([payload, checksum]);
    let num = BigInt("0x" + full.toString("hex"));
    let str = "";
    while (num > 0n) {
      str = B58[Number(num % 58n)] + str;
      num /= 58n;
    }
    for (const byte of full) {
      if (byte === 0) str = "1" + str;
      else break;
    }
    return str;
  } catch {
    return null;
  }
}

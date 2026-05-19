// EVM ChainAdapter — read-only. Uses JSON-RPC `eth_getBalance` against a public endpoint.
// No signing or tx submission in M1 wallet read-path; see ADR-001 for the MPC signing flow.

import type { Address, Balance, ChainAdapter, ChainId } from "../index.js";

type EvmChain = Extract<ChainId, "ethereum" | "bsc" | "polygon">;

const DEFAULT_RPC: Record<EvmChain, string> = {
  ethereum: "https://eth.llamarpc.com",
  bsc: "https://bsc-dataseed.binance.org",
  polygon: "https://polygon-rpc.com"
};

const NATIVE_SYMBOL: Record<EvmChain, string> = {
  ethereum: "ETH",
  bsc: "BNB",
  polygon: "MATIC"
};

export interface EvmAdapterOptions {
  chain: EvmChain;
  rpcUrl?: string;
}

export class EvmAdapter implements ChainAdapter {
  readonly chain: ChainId;
  private readonly rpcUrl: string;

  constructor(opts: EvmAdapterOptions) {
    this.chain = opts.chain;
    this.rpcUrl = opts.rpcUrl ?? DEFAULT_RPC[opts.chain];
  }

  async getBalances(address: Address): Promise<Balance[]> {
    const wei = await this.rpc<string>("eth_getBalance", [address, "latest"]);
    const amount = formatWei(BigInt(wei));
    return [
      {
        chain: this.chain,
        address,
        symbol: NATIVE_SYMBOL[this.chain as EvmChain],
        amount
      }
    ];
  }

  async sendTransaction(_tx: unknown): Promise<string> {
    throw new Error("EvmAdapter.sendTransaction not implemented in M1 read-only path; see ADR-001");
  }

  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    const res = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
    });
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`RPC error: ${json.error.message}`);
    if (json.result === undefined) throw new Error("RPC: missing result");
    return json.result;
  }
}

// Wei (1e18) → human-readable decimal string, no external bignumber dep.
function formatWei(wei: bigint): string {
  const base = 10n ** 18n;
  const whole = wei / base;
  const frac = wei % base;
  const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
  return fracStr.length === 0 ? whole.toString() : `${whole}.${fracStr}`;
}

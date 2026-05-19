/**
 * Logical assets — what users see in the UI.
 *
 * A "logical asset" is the user-facing symbol (USDT, PARTY, etc.). One logical
 * asset can be backed by multiple on-chain token instances — e.g. USDT exists
 * as ERC20 on Ethereum, BEP20 on BSC, and TRC20 on Tron. We sum them and show
 * one number, but we remember which chain holds which slice so withdrawals can
 * pick the right chain.
 *
 *   Display:    USDT  → 1,234.56   (= 500 ERC20 + 400 BEP20 + 334.56 TRC20)
 *   Withdraw:   user picks chain  → chain-specific row is debited
 *   Deposit:    inbound tx on chain X  → that chain's row credited
 */

import { TOKENS, type Chain, type Token } from "./tokens.js";

export type LogicalAsset =
  | "ETH"
  | "BNB"
  | "TRX"
  | "BTC"
  | "USDT"
  | "USDC"
  | "PARTY";

/** Every (logical asset → list of on-chain backers) for the v1 token set. */
export const ASSET_INSTANCES: Record<LogicalAsset, Token[]> = (() => {
  const map: Partial<Record<LogicalAsset, Token[]>> = {};
  for (const t of TOKENS) {
    const sym = t.symbol as LogicalAsset;
    (map[sym] ??= []).push(t);
  }
  return map as Record<LogicalAsset, Token[]>;
})();

export const LOGICAL_ASSETS: LogicalAsset[] = Object.keys(
  ASSET_INSTANCES
) as LogicalAsset[];

/** Per-chain balances for a single logical asset. */
export type AssetBreakdown = {
  asset: LogicalAsset;
  /** Sum of all chain instances. */
  total: number;
  /** USD value at fixed prices, or null if asset is unpriced. */
  usd: number | null;
  /** Detailed view — used by the withdrawal form to let user pick which chain. */
  perChain: Array<{
    chain: Chain;
    amount: number;
    isNative: boolean;
    contract?: string;
  }>;
};

/** Per-chain raw balance numbers (decimal strings as returned from RPCs). */
export type PerChainRawBalances = {
  eth: Record<string, string>;  // { ETH: "0.04", USDC: "120", USDT: "0" }
  bsc: Record<string, string>;  // { BNB: "0.5",  USDT: "75", USDC: "0" }
  tron: Record<string, string>; // { TRX: "100",  USDT: "20", PARTY: "0.5" }
  btc: Record<string, string>;  // { BTC: "0.001" }
};

/**
 * Aggregate per-chain raw balances into the user-facing logical-asset view.
 * Pure function — no IO. Pass it the output of `reconcile()` and it returns
 * exactly what the wallet UI should render.
 */
export function aggregate(raw: PerChainRawBalances): AssetBreakdown[] {
  const out: AssetBreakdown[] = [];

  for (const asset of LOGICAL_ASSETS) {
    const instances = ASSET_INSTANCES[asset];
    const perChain: AssetBreakdown["perChain"] = [];
    let total = 0;

    for (const t of instances) {
      const amountStr = raw[t.chain]?.[t.symbol] ?? "0";
      const amount = Number(amountStr);
      total += amount;
      perChain.push({
        chain: t.chain,
        amount,
        isNative: t.native,
        contract: t.address
      });
    }

    // Late import to avoid a hard cycle; prices.ts imports our LogicalAsset.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { priceUsd } = require("./prices.js");
    const p = priceUsd(asset) as number | null;

    out.push({
      asset,
      total,
      usd: p === null ? null : total * p,
      perChain
    });
  }

  return out;
}

/** Sum of USD values across all priced assets (USDT, USDC, PARTY). */
export function totalUsd(breakdowns: AssetBreakdown[]): number {
  return breakdowns.reduce((s, b) => s + (b.usd ?? 0), 0);
}

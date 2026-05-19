/**
 * Internal-market prices.
 *
 * For v1 we run a fixed price book — no CoinGecko, no oracle, no DEX feed.
 * - Stablecoins (USDT, USDC) are pegged at $1.
 * - PARTY is the platform's internal token, priced at $10 by fiat.
 * - The four gas tokens (ETH, BNB, TRX, BTC) are not used for spending
 *   inside the platform in v1 — users hold them, deposit/withdraw them,
 *   but USD valuation is a UX nice-to-have only. Leaving them null here
 *   means the UI shows balance without a USD figure.
 *
 * When we wire a real price source later, only this file changes. The
 * swap / display / ledger code all reads from `priceUsd(symbol)`.
 */

import type { LogicalAsset } from "./assets.js";

const FIXED_USD: Record<string, number> = {
  USDT: 1,
  USDC: 1,
  PARTY: 10
};

export function priceUsd(symbol: LogicalAsset): number | null {
  return FIXED_USD[symbol] ?? null;
}

/**
 * Quote a swap between two priced assets. Returns the amount of `to` you
 * receive for `fromAmount` of `from`, using the fixed price book.
 *
 *   quote("USDT", 10, "PARTY")  →  1   (10 USDT * $1 / $10 per PARTY)
 *   quote("PARTY", 1, "USDC")   →  10
 *
 * Returns null if either side is unpriced (the caller should refuse the swap).
 */
export function quoteSwap(
  from: LogicalAsset,
  fromAmount: number,
  to: LogicalAsset
): number | null {
  const pIn = priceUsd(from);
  const pOut = priceUsd(to);
  if (pIn === null || pOut === null) return null;
  return (fromAmount * pIn) / pOut;
}

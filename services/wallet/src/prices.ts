/**
 * Prices — live USD price book with a fixed-price fallback.
 *
 * Reads stay synchronous (`priceUsd(symbol)`), so all the swap / display /
 * ledger code is unchanged. Under the hood we keep an in-memory cache that a
 * background task refreshes from CoinGecko every REFRESH_MS. If a fetch fails
 * we keep the last good values (and on cold start we serve the fixed book), so
 * the service never blocks on the network.
 *
 *   - Stablecoins (USDT, USDC): live, but pinned to $1 if the feed is down.
 *   - Gas coins (ETH, BNB, TRX, BTC): live from CoinGecko; null until first
 *     successful fetch.
 *   - PARTY: platform-internal token, fixed at $10 (not on any exchange).
 */

import type { LogicalAsset } from "./assets.js";

// Cold-start / fallback book. PARTY is always fixed here.
const FIXED_USD: Record<string, number> = {
  USDT: 1,
  USDC: 1,
  PARTY: 10
};

// CoinGecko ids for the coins we can price live. PARTY has no listing.
const COINGECKO_IDS: Partial<Record<LogicalAsset, string>> = {
  ETH: "ethereum",
  BNB: "binancecoin",
  TRX: "tron",
  BTC: "bitcoin",
  USDT: "tether",
  USDC: "usd-coin"
};

const REFRESH_MS = 60_000;

// Live cache, seeded with the fixed book so cold reads still work.
const liveUsd: Record<string, number> = { ...FIXED_USD };
let lastRefreshOk = 0;

/** Current USD price for a logical asset, or null if we can't price it. */
export function priceUsd(symbol: LogicalAsset): number | null {
  return liveUsd[symbol] ?? null;
}

/** How many units of `asset` equal `usd` dollars. null if asset is unpriced. */
export function coinAmountForUsd(
  usd: number,
  asset: LogicalAsset
): number | null {
  const p = priceUsd(asset);
  if (p === null || p <= 0) return null;
  return usd / p;
}

/** Timestamp (ms) of the last successful refresh; 0 = never (cold/fixed). */
export function lastPriceRefresh(): number {
  return lastRefreshOk;
}

/**
 * Fetch fresh prices from CoinGecko and update the cache. Best-effort: on any
 * error we leave the existing cache intact and return false.
 */
export async function refreshPrices(): Promise<boolean> {
  const ids = Array.from(new Set(Object.values(COINGECKO_IDS)));
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=" +
    encodeURIComponent(ids.join(",")) +
    "&vs_currencies=usd";

  const headers: Record<string, string> = { accept: "application/json" };
  // Optional pro/demo key — CoinGecko free tier needs none.
  const key = process.env.COINGECKO_API_KEY;
  if (key) headers["x-cg-demo-api-key"] = key;

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8_000);
    const res = await fetch(url, { headers, signal: ac.signal });
    clearTimeout(timer);
    if (!res.ok) return false;

    const data = (await res.json()) as Record<string, { usd?: number }>;
    for (const [asset, id] of Object.entries(COINGECKO_IDS)) {
      const usd = data[id!]?.usd;
      if (typeof usd === "number" && usd > 0) {
        liveUsd[asset] = usd;
      }
    }
    // PARTY always fixed.
    liveUsd.PARTY = FIXED_USD.PARTY!;
    lastRefreshOk = Date.now();
    return true;
  } catch {
    return false;
  }
}

let started = false;
/** Kick off the background refresh loop (idempotent). Call once at boot. */
export function startPriceRefresh(): void {
  if (started) return;
  started = true;
  void refreshPrices();
  const t = setInterval(() => void refreshPrices(), REFRESH_MS);
  // Don't keep the event loop alive just for prices.
  if (typeof t.unref === "function") t.unref();
}

/**
 * Quote a swap between two priced assets. Returns the amount of `to` you
 * receive for `fromAmount` of `from`, using current prices.
 *
 *   quote("USDT", 10, "PARTY")  →  1   (10 USDT * $1 / $10 per PARTY)
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

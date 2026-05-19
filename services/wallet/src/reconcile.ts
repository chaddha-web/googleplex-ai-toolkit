/**
 * Just-in-time balance reconciliation for one user.
 *
 *   reconcile(userAddresses)  → one parallel fan-out of RPC calls,
 *                               returns { perChain, byLogicalAsset, usdTotal }
 *
 * Cached in-memory per-user for REFRESH_CACHE_TTL_SECONDS. The frontend
 * "refresh" button calls this; spam-clicking is harmless because subsequent
 * calls inside the TTL window return the cached result.
 *
 * No DB writes here — this function only READS. The caller is responsible
 * for persisting deltas to the ledger when we add Postgres in the next pass.
 */

import { getEthBalance, getErc20Balance } from "./chain/eth.js";
import { getBnbBalance, getBep20Balance } from "./chain/bsc.js";
import { getTrxBalance, getTrc20Balance } from "./chain/tron.js";
import { getBtcBalance } from "./chain/btc.js";
import { tokensByChain, type Chain, type Token } from "./tokens.js";
import {
  aggregate,
  totalUsd,
  type AssetBreakdown,
  type PerChainRawBalances
} from "./assets.js";

const TTL_S = Number(process.env.REFRESH_CACHE_TTL_SECONDS ?? 30);

export type ReconcileResult = {
  /** When this snapshot was fetched (ms epoch). */
  fetchedAt: number;
  /** Raw per-(chain, token) balances as decimal strings. */
  perChain: PerChainRawBalances;
  /** User-facing aggregated view — drop straight into the UI. */
  byLogicalAsset: AssetBreakdown[];
  /** Sum of USD across priced assets (USDT, USDC, PARTY). */
  usdTotal: number;
};

export type UserAddressMap = {
  eth: string;
  bsc: string;
  tron: string;
  btc: string;
};

// ────────────────────────────────────────────────────────────────────────────
// In-memory cache. Process-local; if you scale to multiple wallet-service
// instances, swap this for Redis. For one Lightsail box, memory is fine.
// ────────────────────────────────────────────────────────────────────────────

const cache = new Map<string, ReconcileResult>();

function cacheKey(addrs: UserAddressMap): string {
  return [addrs.eth, addrs.bsc, addrs.tron, addrs.btc].join("|");
}

export function clearReconcileCache(addrs?: UserAddressMap) {
  if (!addrs) cache.clear();
  else cache.delete(cacheKey(addrs));
}

// ────────────────────────────────────────────────────────────────────────────
// Single-chain fetchers — return decimal-string balances keyed by symbol.
// ────────────────────────────────────────────────────────────────────────────

async function readChain(
  chain: Chain,
  address: string
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const tokens = tokensByChain(chain);

  // Fan-out per-token reads in parallel, but collect failures gracefully so
  // one flaky token doesn't tank the whole snapshot.
  await Promise.all(
    tokens.map(async (t: Token) => {
      try {
        out[t.symbol] = await readOne(chain, address, t);
      } catch (err) {
        // Log + zero. We do NOT raise — the user should still see the rest
        // of their balances. The error is observable in server logs.
        // eslint-disable-next-line no-console
        console.warn(
          `[reconcile] ${chain}/${t.symbol} read failed for ${address}:`,
          (err as Error).message
        );
        out[t.symbol] = "0";
      }
    })
  );

  return out;
}

async function readOne(
  chain: Chain,
  address: string,
  token: Token
): Promise<string> {
  if (token.native) {
    switch (chain) {
      case "eth":  return getEthBalance(address);
      case "bsc":  return getBnbBalance(address);
      case "tron": return getTrxBalance(address);
      case "btc":  return getBtcBalance(address);
    }
  }

  const opts = { holder: address, token: token.address!, decimals: token.decimals };
  switch (chain) {
    case "eth":  return getErc20Balance(opts);
    case "bsc":  return getBep20Balance(opts);
    case "tron": return getTrc20Balance(opts);
    case "btc":  return "0"; // BTC has no token contracts in our registry
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export type ReconcileOptions = {
  /** If true, ignore the cache and force a fresh fetch. */
  force?: boolean;
};

/**
 * Read every supported balance for one user across all four chains in
 * parallel. Returns a cached snapshot if one exists and is fresher than
 * REFRESH_CACHE_TTL_SECONDS (default 30).
 */
export async function reconcile(
  addrs: UserAddressMap,
  opts: ReconcileOptions = {}
): Promise<ReconcileResult> {
  const key = cacheKey(addrs);
  const now = Date.now();

  if (!opts.force) {
    const hit = cache.get(key);
    if (hit && now - hit.fetchedAt < TTL_S * 1000) return hit;
  }

  // Parallel fan-out across the 4 chains.
  const [eth, bsc, tron, btc] = await Promise.all([
    readChain("eth", addrs.eth),
    readChain("bsc", addrs.bsc),
    readChain("tron", addrs.tron),
    readChain("btc", addrs.btc)
  ]);

  const perChain: PerChainRawBalances = { eth, bsc, tron, btc };
  const byLogicalAsset = aggregate(perChain);
  const usdTotal = totalUsd(byLogicalAsset);

  const result: ReconcileResult = {
    fetchedAt: now,
    perChain,
    byLogicalAsset,
    usdTotal
  };

  cache.set(key, result);
  return result;
}

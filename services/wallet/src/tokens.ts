/**
 * Token registry — single source of truth for what assets we support.
 * Adding a new token is one entry here + (if it's an unfamiliar contract)
 * a verification step on the relevant block explorer.
 */

export type Chain = "eth" | "bsc" | "polygon" | "tron" | "btc";

export type Token = {
  /** Public ticker shown in UI (uppercase). */
  symbol: string;
  /** Which chain this token instance lives on. */
  chain: Chain;
  /** true = chain's gas token (ETH, BNB, TRX, BTC). false = ERC20/TRC20/BEP20. */
  native: boolean;
  /** Contract address, omitted for native assets. */
  address?: string;
  /** On-chain decimals. Always check on the explorer before adding a new entry. */
  decimals: number;
  /** CoinGecko id, used for USD prices. */
  coingeckoId?: string;
};

export const TOKENS: Token[] = [
  // ── Native gas tokens ───────────────────────────────────────────────────
  { symbol: "ETH",  chain: "eth",  native: true, decimals: 18, coingeckoId: "ethereum" },
  { symbol: "BNB",  chain: "bsc",  native: true, decimals: 18, coingeckoId: "binancecoin" },
  // POL — renamed from MATIC in Sept 2024; the contract and decimals are unchanged.
  { symbol: "POL",  chain: "polygon", native: true, decimals: 18, coingeckoId: "polygon-ecosystem-token" },
  { symbol: "TRX",  chain: "tron", native: true, decimals: 6,  coingeckoId: "tron" },
  { symbol: "BTC",  chain: "btc",  native: true, decimals: 8,  coingeckoId: "bitcoin" },

  // ── Stablecoins on Ethereum ─────────────────────────────────────────────
  {
    symbol: "USDC",
    chain: "eth",
    native: false,
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    decimals: 6,
    coingeckoId: "usd-coin"
  },
  {
    symbol: "USDT",
    chain: "eth",
    native: false,
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    decimals: 6,
    coingeckoId: "tether"
  },

  // ── Stablecoins on BSC ──────────────────────────────────────────────────
  {
    symbol: "USDT",
    chain: "bsc",
    native: false,
    address: "0x55d398326f99059fF775485246999027B3197955",
    decimals: 18, // note: USDT-BEP20 uses 18, not 6
    coingeckoId: "tether"
  },
  {
    symbol: "USDC",
    chain: "bsc",
    native: false,
    address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    decimals: 18,
    coingeckoId: "usd-coin"
  },

  // ── Stablecoins on Polygon ──────────────────────────────────────────────
  // Native (Circle-issued) only. The bridged USDC.e (0x2791Bca1…) is a
  // different contract and is deliberately NOT a deposit path — a user who
  // sends USDC.e would otherwise see a zero balance with no explanation.
  {
    symbol: "USDC",
    chain: "polygon",
    native: false,
    address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    decimals: 6,
    coingeckoId: "usd-coin"
  },
  {
    symbol: "USDT",
    chain: "polygon",
    native: false,
    address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    decimals: 6,
    coingeckoId: "tether"
  },

  // ── Tron tokens ─────────────────────────────────────────────────────────
  {
    symbol: "USDT",
    chain: "tron",
    native: false,
    address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    decimals: 6,
    coingeckoId: "tether"
  },
  // USDC on Tron is intentionally omitted — Circle deprecated it, so it's not a
  // real deposit path. USDC is ERC20 + BEP20 only; USDT covers TRC20.
  {
    // ⚠ Confirm decimals on tronscan before going live.
    symbol: "PARTY",
    chain: "tron",
    native: false,
    address: "TVb7HmtrrxA8vbgeHy2HeHKDhAxXXNJQwy",
    decimals: 6, // TODO: confirm on tronscan
    coingeckoId: undefined // probably no CG listing; show "—" in UI for USD value
  }
];

export const tokensByChain = (chain: Chain) => TOKENS.filter((t) => t.chain === chain);
export const findToken = (chain: Chain, symbol: string) =>
  TOKENS.find((t) => t.chain === chain && t.symbol === symbol);

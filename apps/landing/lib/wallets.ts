"use client";

/**
 * Browser wallet connection — MetaMask, Trust, Coinbase, Rabby, Phantom's EVM
 * mode, anything else the user has installed.
 *
 * Discovery uses EIP-6963 (Multi Injected Provider Discovery), which is how a
 * page enumerates EVERY installed wallet with its name and icon. The older
 * approach — reading `window.ethereum` — silently collapses to whichever
 * extension won the race to inject, so with two wallets installed the user gets
 * no choice. We keep `window.ethereum` only as a fallback for wallets that
 * haven't adopted 6963 yet, and de-duplicate against it.
 *
 * No dependencies and no API keys. WalletConnect would add desktop→mobile QR
 * pairing, but it needs a Cloud project ID; on mobile, wallet in-app browsers
 * implement 6963 already, so this covers them without one.
 */

export type EvmChain = "eth" | "bsc" | "polygon";

export type ChainSpec = {
  id: EvmChain;
  chainId: number;
  hexChainId: string;
  label: string;
  nativeSymbol: string;
  nativeDecimals: number;
  rpcUrls: string[];
  explorer: string;
};

export const CHAINS: Record<EvmChain, ChainSpec> = {
  eth: {
    id: "eth",
    chainId: 1,
    hexChainId: "0x1",
    label: "Ethereum",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    rpcUrls: ["https://eth.llamarpc.com"],
    explorer: "https://etherscan.io"
  },
  bsc: {
    id: "bsc",
    chainId: 56,
    hexChainId: "0x38",
    label: "BNB Chain",
    nativeSymbol: "BNB",
    nativeDecimals: 18,
    rpcUrls: ["https://bsc-dataseed.binance.org"],
    explorer: "https://bscscan.com"
  },
  polygon: {
    id: "polygon",
    chainId: 137,
    hexChainId: "0x89",
    label: "Polygon",
    nativeSymbol: "POL",
    nativeDecimals: 18,
    rpcUrls: ["https://polygon-rpc.com"],
    explorer: "https://polygonscan.com"
  }
};

/**
 * Token contracts, mirrored from services/wallet/src/tokens.ts. Decimals differ
 * per chain — USDT on BSC is 18, not the 6 it uses everywhere else — and
 * getting that wrong sends 1e12 times the intended amount, so they are listed
 * explicitly rather than assumed.
 */
export const TOKENS: Record<EvmChain, Record<string, { address: string; decimals: number }>> = {
  eth: {
    USDT: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
    USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 }
  },
  bsc: {
    USDT: { address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
    USDC: { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 }
  },
  polygon: {
    USDC: { address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
    USDT: { address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6 }
  }
};

// ── EIP-1193 / EIP-6963 shapes ─────────────────────────────────────────────

export type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] | object }): Promise<any>;
  on?(event: string, handler: (...args: any[]) => void): void;
  removeListener?(event: string, handler: (...args: any[]) => void): void;
};

export type DiscoveredWallet = {
  /** Stable id from the wallet itself (reverse-DNS), or "injected". */
  uuid: string;
  name: string;
  icon: string | null;
  rdns: string | null;
  provider: Eip1193Provider;
};

type Eip6963Detail = {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Eip1193Provider;
};

/**
 * Ask every installed wallet to announce itself. Synchronous in practice —
 * wallets respond to the request event immediately — but we wait a beat to
 * collect stragglers before resolving.
 */
export function discoverWallets(timeoutMs = 350): Promise<DiscoveredWallet[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve([]);

    const found = new Map<string, DiscoveredWallet>();
    const onAnnounce = (e: Event) => {
      const d = (e as CustomEvent<Eip6963Detail>).detail;
      if (!d?.info?.uuid || !d.provider) return;
      found.set(d.info.rdns || d.info.uuid, {
        uuid: d.info.uuid,
        name: d.info.name,
        icon: d.info.icon ?? null,
        rdns: d.info.rdns ?? null,
        provider: d.provider
      });
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce as EventListener);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce as EventListener);

      // Legacy fallback: a wallet that never announced, but did inject. Only
      // add it if nothing claimed the same identity, or we'd list MetaMask twice.
      const legacy = (window as any).ethereum as Eip1193Provider | undefined;
      if (legacy && found.size === 0) {
        const anyEth = legacy as any;
        const name = anyEth.isMetaMask
          ? "MetaMask"
          : anyEth.isTrust || anyEth.isTrustWallet
            ? "Trust Wallet"
            : anyEth.isCoinbaseWallet
              ? "Coinbase Wallet"
              : "Browser wallet";
        found.set("injected", { uuid: "injected", name, icon: null, rdns: null, provider: legacy });
      }

      resolve([...found.values()]);
    }, timeoutMs);
  });
}

/** Is this a phone? Used to offer deep links when no wallet is injected. */
export function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Deep links that reopen the current page inside a wallet's own browser, which
 * is how mobile works without WalletConnect. The wallet then injects a provider
 * and the normal flow applies.
 */
export function mobileDeepLinks(): Array<{ name: string; url: string }> {
  if (typeof window === "undefined") return [];
  const bare = window.location.host + window.location.pathname;
  const full = window.location.href;
  return [
    { name: "MetaMask", url: `https://metamask.app.link/dapp/${bare}` },
    { name: "Trust Wallet", url: `https://link.trustwallet.com/open_url?url=${encodeURIComponent(full)}` },
    { name: "Coinbase Wallet", url: `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(full)}` }
  ];
}

// ── Connection ─────────────────────────────────────────────────────────────

/** Prompt the wallet to connect. Returns the selected account. */
export async function connect(provider: Eip1193Provider): Promise<string> {
  const accounts: string[] = await provider.request({ method: "eth_requestAccounts" });
  if (!accounts?.length) throw new Error("No account was shared.");
  return accounts[0]!;
}

export async function currentChainId(provider: Eip1193Provider): Promise<number> {
  const hex: string = await provider.request({ method: "eth_chainId" });
  return parseInt(hex, 16);
}

/**
 * Move the wallet to `chain`, adding it first if the wallet doesn't know it.
 * 4902 = "unrecognised chain"; MetaMask ships Ethereum only, so BSC and Polygon
 * routinely need adding.
 */
export async function switchChain(provider: Eip1193Provider, chain: EvmChain): Promise<void> {
  const spec = CHAINS[chain];
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: spec.hexChainId }]
    });
    return;
  } catch (err: any) {
    const code = err?.code ?? err?.data?.originalError?.code;
    if (code !== 4902 && code !== -32603) throw err;
  }
  await provider.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId: spec.hexChainId,
        chainName: spec.label,
        nativeCurrency: { name: spec.nativeSymbol, symbol: spec.nativeSymbol, decimals: 18 },
        rpcUrls: spec.rpcUrls,
        blockExplorerUrls: [spec.explorer]
      }
    ]
  });
}

// ── Amounts + calldata ─────────────────────────────────────────────────────

/**
 * Decimal string → base units, done on strings so a float can never round the
 * amount. `toRaw("1.005", 6)` === 1005000n.
 */
export function toRaw(amount: string, decimals: number): bigint {
  const cleaned = amount.trim().replace(/,/g, "");
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === "" || cleaned === ".") {
    throw new Error("Enter a valid amount.");
  }
  const [whole = "0", frac = ""] = cleaned.split(".");
  if (frac.length > decimals) {
    throw new Error(`That token supports at most ${decimals} decimal places.`);
  }
  return BigInt(whole + frac.padEnd(decimals, "0"));
}

const TRANSFER_SELECTOR = "0xa9059cbb"; // transfer(address,uint256)

/** ABI-encode an ERC-20 transfer. Two 32-byte words, no library needed. */
export function encodeTransfer(to: string, raw: bigint): string {
  const addr = to.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const amount = raw.toString(16).padStart(64, "0");
  return `${TRANSFER_SELECTOR}${addr}${amount}`;
}

export type SendRequest = {
  provider: Eip1193Provider;
  from: string;
  chain: EvmChain;
  /** Native symbol (ETH/BNB/POL) or a token symbol (USDT/USDC). */
  symbol: string;
  /** Human amount, e.g. "1.00". */
  amount: string;
  /** The member's own deposit address. */
  to: string;
};

/**
 * Build and submit the transfer. The wallet shows its own confirmation — we
 * never see a key and never sign anything.
 */
export async function sendPayment(req: SendRequest): Promise<string> {
  const spec = CHAINS[req.chain];
  const token = TOKENS[req.chain][req.symbol.toUpperCase()];

  // Guard against a stale selection: if the wallet drifted to another network
  // between choosing and confirming, the funds would land on the wrong chain.
  const live = await currentChainId(req.provider);
  if (live !== spec.chainId) {
    throw new Error(`Your wallet is on a different network. Switch to ${spec.label} and try again.`);
  }

  const tx = token
    ? {
        from: req.from,
        to: token.address,
        data: encodeTransfer(req.to, toRaw(req.amount, token.decimals)),
        value: "0x0"
      }
    : {
        from: req.from,
        to: req.to,
        value: "0x" + toRaw(req.amount, spec.nativeDecimals).toString(16)
      };

  return (await req.provider.request({ method: "eth_sendTransaction", params: [tx] })) as string;
}

/** Human-readable reason a wallet rejected something. */
export function walletError(err: unknown): string {
  const e = err as any;
  const code = e?.code ?? e?.data?.originalError?.code;
  if (code === 4001 || /user rejected|user denied/i.test(e?.message ?? "")) {
    return "You cancelled the request in your wallet.";
  }
  if (code === -32002) return "Your wallet already has a pending request — open it and finish that first.";
  if (/insufficient funds/i.test(e?.message ?? "")) {
    return "Not enough balance to cover the amount plus network fees.";
  }
  return e?.message || "Your wallet refused the request.";
}

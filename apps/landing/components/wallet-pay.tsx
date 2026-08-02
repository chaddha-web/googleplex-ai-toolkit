"use client";

/**
 * "Pay from your wallet" — connect an installed browser wallet, pick a chain,
 * and approve the transfer in the wallet itself.
 *
 * Nothing here ever touches a private key. We hand the wallet an unsigned
 * transaction; it shows its own confirmation and signs. The destination is
 * always the member's OWN deposit address, supplied by the wallet service.
 */

import { useCallback, useEffect, useState } from "react";
import {
  CHAINS,
  TOKENS,
  connect,
  currentChainId,
  discoverWallets,
  isMobile,
  mobileDeepLinks,
  sendPayment,
  switchChain,
  walletError,
  type DiscoveredWallet,
  type EvmChain
} from "@/lib/wallets";

type Props = {
  /** The member's deposit address per chain, from the wallet service. */
  addresses: { eth?: string; bsc?: string; polygon?: string };
  /** Amount to pre-fill, e.g. "1.00". */
  defaultAmount?: string;
  /** Called with the tx hash once the wallet accepts it. */
  onSent?: (hash: string, chain: EvmChain) => void;
};

const CHAIN_ORDER: EvmChain[] = ["polygon", "bsc", "eth"];

export function WalletPay({ addresses, defaultAmount = "1.00", onSent }: Props) {
  const [wallets, setWallets] = useState<DiscoveredWallet[] | null>(null);
  const [selected, setSelected] = useState<DiscoveredWallet | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [chain, setChain] = useState<EvmChain>("polygon");
  const [symbol, setSymbol] = useState("USDT");
  const [amount, setAmount] = useState(defaultAmount);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [liveChainId, setLiveChainId] = useState<number | null>(null);

  useEffect(() => {
    void discoverWallets().then(setWallets);
  }, []);

  // Follow the wallet if the user switches account or network in the extension,
  // so what we show is never stale relative to what will actually sign.
  useEffect(() => {
    const p = selected?.provider;
    if (!p?.on) return;
    const onAccounts = (accs: string[]) => setAccount(accs?.[0] ?? null);
    const onChain = (hex: string) => setLiveChainId(parseInt(hex, 16));
    p.on("accountsChanged", onAccounts);
    p.on("chainChanged", onChain);
    return () => {
      p.removeListener?.("accountsChanged", onAccounts);
      p.removeListener?.("chainChanged", onChain);
    };
  }, [selected]);

  const chainsAvailable = CHAIN_ORDER.filter((c) => !!addresses[c]);
  const destination = addresses[chain];
  const tokenList = ["USDT", "USDC"].filter((s) => !!TOKENS[chain]?.[s]);
  const wrongNetwork = liveChainId !== null && liveChainId !== CHAINS[chain].chainId;

  const pick = useCallback(async (w: DiscoveredWallet) => {
    setError(null);
    setBusy("connect");
    try {
      const acct = await connect(w.provider);
      setSelected(w);
      setAccount(acct);
      setLiveChainId(await currentChainId(w.provider));
    } catch (e) {
      setError(walletError(e));
    } finally {
      setBusy(null);
    }
  }, []);

  async function ensureChain(next: EvmChain) {
    setChain(next);
    setError(null);
    if (!selected) return;
    setBusy("switch");
    try {
      await switchChain(selected.provider, next);
      setLiveChainId(await currentChainId(selected.provider));
    } catch (e) {
      setError(walletError(e));
    } finally {
      setBusy(null);
    }
  }

  async function pay() {
    if (!selected || !account || !destination) return;
    setError(null);
    setBusy("send");
    try {
      const h = await sendPayment({
        provider: selected.provider,
        from: account,
        chain,
        symbol,
        amount,
        to: destination
      });
      setHash(h);
      onSent?.(h, chain);
    } catch (e) {
      setError(walletError(e));
    } finally {
      setBusy(null);
    }
  }

  // ── Sent ─────────────────────────────────────────────────────────────────
  if (hash) {
    return (
      <div className="liquid-glass rounded-3xl p-6 ring-1 ring-emerald-300/20">
        <p className="text-emerald-300 text-sm font-medium">Sent from your wallet</p>
        <p className="text-white/50 text-xs mt-2 leading-relaxed">
          It needs a few confirmations on {CHAINS[chain].label}. This page updates itself as soon as
          the deposit is credited — you can leave it open.
        </p>
        <a
          href={`${CHAINS[chain].explorer}/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
          className="inline-block mt-4 text-white/70 hover:text-white text-xs underline break-all"
        >
          {hash.slice(0, 18)}…{hash.slice(-8)} ↗
        </a>
      </div>
    );
  }

  // ── Discovering ──────────────────────────────────────────────────────────
  if (wallets === null) {
    return (
      <div className="liquid-glass rounded-3xl p-6">
        <p className="text-white/40 text-sm flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
          Looking for wallets on this device…
        </p>
      </div>
    );
  }

  // ── None installed ───────────────────────────────────────────────────────
  if (wallets.length === 0) {
    const links = mobileDeepLinks();
    return (
      <div className="liquid-glass rounded-3xl p-6">
        <p className="text-white text-sm">No wallet detected on this device</p>
        {isMobile() ? (
          <>
            <p className="text-white/50 text-xs mt-2 leading-relaxed">
              Open this page inside your wallet&apos;s browser to pay directly:
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {links.map((l) => (
                <a
                  key={l.name}
                  href={l.url}
                  className="rounded-full ring-1 ring-white/20 text-white hover:bg-white/5 px-4 py-2 text-xs transition-colors"
                >
                  Open in {l.name} ↗
                </a>
              ))}
            </div>
          </>
        ) : (
          <p className="text-white/50 text-xs mt-2 leading-relaxed">
            Install MetaMask, Trust Wallet or another browser wallet, then reload this page. Or just
            send the deposit manually using the address below.
          </p>
        )}
      </div>
    );
  }

  // ── Choose a wallet ──────────────────────────────────────────────────────
  if (!selected || !account) {
    return (
      <div className="liquid-glass rounded-3xl p-6">
        <p className="text-white text-sm">Pay from your wallet</p>
        <p className="text-white/40 text-xs mt-1">
          {wallets.length === 1 ? "Found on this device:" : `Found ${wallets.length} wallets:`}
        </p>
        <div className="mt-4 grid sm:grid-cols-2 gap-2">
          {wallets.map((w) => (
            <button
              key={w.uuid}
              type="button"
              onClick={() => pick(w)}
              disabled={!!busy}
              className="flex items-center gap-3 rounded-2xl ring-1 ring-white/10 bg-white/[0.02] hover:bg-white/[0.06] px-4 py-3 text-left transition-colors disabled:opacity-50"
            >
              {w.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={w.icon} alt="" className="w-7 h-7 rounded-lg shrink-0" />
              ) : (
                <span className="w-7 h-7 rounded-lg bg-white/10 shrink-0" />
              )}
              <span className="text-white text-sm truncate">{w.name}</span>
              {busy === "connect" && (
                <span className="ml-auto w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
              )}
            </button>
          ))}
        </div>
        {error && <p className="text-rose-300/90 text-xs mt-4">{error}</p>}
      </div>
    );
  }

  // ── Connected: choose chain + asset, then approve ────────────────────────
  return (
    <div className="liquid-glass rounded-3xl p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          {selected.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selected.icon} alt="" className="w-6 h-6 rounded-md shrink-0" />
          ) : null}
          <span className="text-white text-sm truncate">{selected.name}</span>
          <span className="text-white/35 text-xs font-mono truncate">
            {account.slice(0, 6)}…{account.slice(-4)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setAccount(null);
            setLiveChainId(null);
          }}
          className="text-white/40 hover:text-white text-xs underline"
        >
          Change
        </button>
      </div>

      <p className="text-white/50 text-xs mt-5 mb-2">Network</p>
      <div className="flex flex-wrap gap-2">
        {chainsAvailable.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => ensureChain(c)}
            disabled={busy === "switch"}
            className={`rounded-full px-4 py-1.5 text-xs ring-1 transition-colors disabled:opacity-50 ${
              chain === c ? "bg-white/10 ring-white/40 text-white" : "ring-white/10 text-white/50 hover:text-white/80"
            }`}
          >
            {CHAINS[c].label}
          </button>
        ))}
      </div>

      <p className="text-white/50 text-xs mt-5 mb-2">Asset</p>
      <div className="flex flex-wrap gap-2">
        {tokenList.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSymbol(s)}
            className={`rounded-full px-4 py-1.5 text-xs ring-1 transition-colors ${
              symbol === s ? "bg-white/10 ring-white/40 text-white" : "ring-white/10 text-white/50 hover:text-white/80"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <label className="block mt-5">
        <span className="text-white/50 text-xs">Amount</span>
        <div className="mt-1 flex items-center gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="flex-1 rounded-xl bg-white/[0.04] ring-1 ring-white/10 px-4 py-2.5 text-sm text-white outline-none focus:ring-white/30 font-mono"
          />
          <span className="text-white/40 text-sm">{symbol}</span>
        </div>
      </label>

      {wrongNetwork && (
        <p className="text-amber-200/80 text-xs mt-4">
          Your wallet is on another network.{" "}
          <button type="button" onClick={() => ensureChain(chain)} className="underline">
            Switch to {CHAINS[chain].label}
          </button>
        </p>
      )}

      {!destination && (
        <p className="text-amber-200/80 text-xs mt-4">
          No deposit address for {CHAINS[chain].label} yet — pick another network.
        </p>
      )}

      <button
        type="button"
        onClick={pay}
        disabled={!!busy || !destination || wrongNetwork}
        className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-full bg-white text-black px-6 py-3 text-sm font-medium disabled:opacity-40 transition-opacity hover:opacity-90"
      >
        {busy === "send" && (
          <span className="w-3.5 h-3.5 rounded-full border-2 border-black/20 border-t-black animate-spin" />
        )}
        {busy === "send" ? "Confirm in your wallet…" : `Send ${amount} ${symbol}`}
      </button>

      <p className="text-white/30 text-[11px] mt-3 leading-relaxed">
        Goes to your own deposit address on {CHAINS[chain].label}. Your wallet shows the exact
        transaction before anything is signed — we never see your keys.
      </p>

      {error && <p className="text-rose-300/90 text-xs mt-4">{error}</p>}
    </div>
  );
}

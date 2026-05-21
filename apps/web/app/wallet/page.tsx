"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { authedFetch } from "@/lib/auth-client";
import { QrCode } from "@/components/qr-code";

const WALLET_BASE =
  process.env.NEXT_PUBLIC_WALLET_BASE || "http://localhost:4201";

type Chain = "eth" | "bsc" | "tron" | "btc";
type PerChain = {
  chain: Chain;
  amount: number;
  isNative: boolean;
  contract?: string;
};
type AssetBreakdown = {
  asset: string;
  total: number;
  usd: number | null;
  perChain: PerChain[];
};
type ChainAddrs = { eth?: string; bsc?: string; tron?: string; btc?: string };

// (chain, symbol) → on-chain decimals. Mirrors services/wallet/src/tokens.ts.
const DECIMALS: Record<string, number> = {
  "eth:ETH": 18, "eth:USDC": 6, "eth:USDT": 6,
  "bsc:BNB": 18, "bsc:USDT": 18, "bsc:USDC": 18,
  "tron:TRX": 6, "tron:USDT": 6, "tron:PARTY": 6,
  "btc:BTC": 8
};
const decimalsFor = (chain: string, symbol: string) =>
  DECIMALS[`${chain}:${symbol}`] ?? 18;

const CHAIN_LABEL: Record<Chain, string> = {
  eth: "Ethereum (ERC20)",
  bsc: "BSC (BEP20)",
  tron: "Tron (TRC20)",
  btc: "Bitcoin"
};

function fmt(n: number, max = 4): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: max });
}
function usdFmt(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function WalletPage() {
  const { user } = useAuth();
  const [addrs, setAddrs] = useState<ChainAddrs | null>(null);
  const [assets, setAssets] = useState<AssetBreakdown[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        authedFetch(`${WALLET_BASE}/wallet/addresses`),
        authedFetch(`${WALLET_BASE}/wallet/balances`)
      ]);
      if (a.status === 404 || b.status === 404) {
        setAddrs({});
        setAssets([]);
        return;
      }
      if (!a.ok || !b.ok) throw new Error("non-2xx");
      setAddrs(await a.json());
      const bal = await b.json();
      setAssets(Array.isArray(bal) ? bal : []);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const lastRefreshRef = useRef(0);
  async function refresh() {
    // Throttle: ignore manual refreshes fired within 5s of the last one
    // (server also caches reconcile for 30s + rate-limits the endpoint).
    const now = Date.now();
    if (refreshing || now - lastRefreshRef.current < 5000) return;
    lastRefreshRef.current = now;
    setRefreshing(true);
    try {
      const res = await authedFetch(`${WALLET_BASE}/wallet/refresh`, { method: "POST" });
      if (res.ok) {
        const bal = await res.json();
        setAssets(Array.isArray(bal) ? bal : []);
        setOffline(false);
      }
    } catch {
      /* keep last view */
    } finally {
      setRefreshing(false);
    }
  }

  const totalUsd = useMemo(
    () => (assets ?? []).reduce((acc, a) => acc + (a.usd ?? 0), 0),
    [assets]
  );
  const fundedAssets = useMemo(
    () => (assets ?? []).filter((a) => a.total > 0),
    [assets]
  );

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-white/40 text-xs tracking-[0.3em] uppercase">Wallet</p>
          <h1 className="font-serif text-5xl md:text-6xl tracking-tight mt-2">
            Your <em className="font-serif-i text-white/60">balances</em>.
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0 pt-2">
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="text-xs text-white/70 hover:text-white transition-colors px-4 py-2 rounded-full ring-1 ring-white/10 hover:ring-white/30 disabled:opacity-40 inline-flex items-center gap-2"
          >
            <span className={refreshing ? "inline-block animate-spin" : ""}>↻</span>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => setWithdrawOpen(true)}
            disabled={fundedAssets.length === 0}
            className="text-xs font-medium px-4 py-2 rounded-full bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Withdraw
          </button>
        </div>
      </div>

      {offline ? (
        <div className="mt-10 liquid-glass rounded-3xl p-6 ring-1 ring-amber-300/20">
          <p className="text-amber-200 text-xs tracking-[0.2em] uppercase mb-2">
            Wallet service offline
          </p>
          <p className="text-white/70 text-sm leading-relaxed">
            <code>services/wallet</code> on :4201 isn&apos;t reachable. Start it and
            run a refresh to see live balances.
          </p>
        </div>
      ) : (
        <>
          {/* Total balance header */}
          <div className="mt-10 liquid-glass rounded-3xl p-6 md:p-8">
            <p className="text-white/40 text-xs tracking-[0.3em] uppercase mb-2">
              Total balance
            </p>
            <p className="text-5xl font-medium tracking-tight">
              {assets === null ? "…" : usdFmt(totalUsd)}
            </p>
            <p className="text-white/40 text-sm mt-2">
              Across {fundedAssets.length} funded asset
              {fundedAssets.length === 1 ? "" : "s"} · fixed-price valuation
            </p>
          </div>

          {/* Holdings */}
          <section className="mt-10">
            <p className="text-white/40 text-xs tracking-[0.3em] uppercase mb-3">
              Holdings
            </p>
            {assets === null ? (
              <p className="text-white/40 text-sm">Loading…</p>
            ) : fundedAssets.length === 0 ? (
              <p className="text-white/40 text-sm">
                No balances yet. Deposit USDT or USDC to your addresses below,
                then hit Refresh.
              </p>
            ) : (
              <ul className="space-y-2">
                {fundedAssets.map((a) => (
                  <li key={a.asset} className="liquid-glass rounded-2xl p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-white text-lg">{a.asset}</span>
                      <span className="text-right">
                        <span className="block font-mono text-base text-white">
                          {fmt(a.total)} {a.asset}
                        </span>
                        {a.usd !== null && (
                          <span className="block text-white/40 text-xs">
                            {usdFmt(a.usd)}
                          </span>
                        )}
                      </span>
                    </div>
                    {a.perChain.filter((c) => c.amount > 0).length > 1 && (
                      <p className="text-white/40 text-xs mt-2">
                        {a.perChain
                          .filter((c) => c.amount > 0)
                          .map((c) => `${fmt(c.amount)} on ${CHAIN_LABEL[c.chain].split(" ")[0]}`)
                          .join(" · ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Deposit addresses */}
          <section className="mt-12">
            <p className="text-white/40 text-xs tracking-[0.3em] uppercase mb-3">
              Deposit addresses
            </p>
            {addrs === null ? (
              <p className="text-white/40 text-sm">Loading…</p>
            ) : !addrs.eth && !addrs.bsc && !addrs.tron && !addrs.btc ? (
              <p className="text-white/40 text-sm">
                Addresses not yet allocated. Finish wallet setup from onboarding
                to provision.
              </p>
            ) : (
              <div className="space-y-2">
                {(["tron", "eth", "bsc", "btc"] as const).map((k) =>
                  addrs[k] ? (
                    <AddressRow key={k} chain={CHAIN_LABEL[k]} address={addrs[k]!} />
                  ) : null
                )}
              </div>
            )}
          </section>
        </>
      )}

      <p className="mt-12 text-white/30 text-xs">
        Member ID{" "}
        <span className="font-mono text-white/60 tracking-widest">{user?.code11}</span>
      </p>

      {withdrawOpen && (
        <WithdrawModal
          assets={fundedAssets}
          walletStatus={user?.walletStatus}
          onClose={() => setWithdrawOpen(false)}
          onDone={() => {
            setWithdrawOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── Withdrawal modal ─────────────────────────── */

type Step = "form" | "auth" | "success";

function WithdrawModal({
  assets,
  walletStatus,
  onClose,
  onDone
}: {
  assets: AssetBreakdown[];
  walletStatus?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>("form");
  const [assetSym, setAssetSym] = useState(assets[0]?.asset ?? "");
  const asset = assets.find((a) => a.asset === assetSym);
  const fundedChains = (asset?.perChain ?? []).filter((c) => c.amount > 0);
  const [chain, setChain] = useState<Chain | "">(fundedChains[0]?.chain ?? "");
  const chainRow = fundedChains.find((c) => c.chain === chain);
  const [dest, setDest] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [withdrawalId, setWithdrawalId] = useState<string | null>(null);
  const usePassword = walletStatus === "active"; // password set during onboarding
  const [secret, setSecret] = useState(""); // OTP code or wallet password
  const [txHash, setTxHash] = useState<string | null>(null);

  const max = chainRow?.amount ?? 0;
  const amtNum = Number(amount);
  const canInitiate =
    !!asset && !!chain && !!dest.trim() && amtNum > 0 && amtNum <= max && !busy;

  async function initiate() {
    if (!canInitiate || !asset || !chain) return;
    setBusy(true);
    setError(null);
    try {
      const decimals = decimalsFor(chain, asset.asset);
      const amountRaw = BigInt(Math.round(amtNum * 10 ** decimals)).toString();
      const res = await authedFetch(`${WALLET_BASE}/wallet/withdrawals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chain, symbol: asset.asset, amountRaw, destAddress: dest.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not start withdrawal.");
      setWithdrawalId(data.withdrawalId);
      setStep("auth");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!withdrawalId || !secret.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const body = usePassword
        ? { walletPassword: secret }
        : { code: secret };
      const res = await authedFetch(
        `${WALLET_BASE}/wallet/withdrawals/${withdrawalId}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Verification failed.");
      setTxHash(data.txHash ?? "submitted");
      setStep("success");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md liquid-glass rounded-t-3xl sm:rounded-3xl p-6 md:p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-serif text-2xl tracking-tight">
            {step === "success" ? "Sent" : "Withdraw"}
          </h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-sm">
            ✕
          </button>
        </div>

        {step === "form" && (
          <div className="space-y-5">
            <Field label="Asset">
              <select
                value={assetSym}
                onChange={(e) => {
                  setAssetSym(e.target.value);
                  const next = assets.find((a) => a.asset === e.target.value);
                  const fc = (next?.perChain ?? []).filter((c) => c.amount > 0);
                  setChain(fc[0]?.chain ?? "");
                }}
                className="bg-[#1A1A1A] rounded-xl w-full h-11 px-4 text-white focus:ring-2 focus:ring-white/20 appearance-none"
              >
                {assets.map((a) => (
                  <option key={a.asset} value={a.asset}>
                    {a.asset} — {fmt(a.total)} available
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Network">
              <select
                value={chain}
                onChange={(e) => setChain(e.target.value as Chain)}
                className="bg-[#1A1A1A] rounded-xl w-full h-11 px-4 text-white focus:ring-2 focus:ring-white/20 appearance-none"
              >
                {fundedChains.map((c) => (
                  <option key={c.chain} value={c.chain}>
                    {CHAIN_LABEL[c.chain]} — {fmt(c.amount)} {assetSym}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Recipient address">
              <input
                value={dest}
                onChange={(e) => setDest(e.target.value)}
                placeholder="Paste destination wallet address"
                className="bg-[#1A1A1A] rounded-xl w-full h-11 px-4 text-white placeholder:text-white/20 focus:ring-2 focus:ring-white/20 font-mono text-sm"
              />
            </Field>

            <Field label="Amount">
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="bg-[#1A1A1A] rounded-xl w-full h-11 px-4 pr-16 text-white placeholder:text-white/20 focus:ring-2 focus:ring-white/20"
                />
                <button
                  type="button"
                  onClick={() => setAmount(String(max))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-white/60 hover:text-white px-2 py-1 rounded-md ring-1 ring-white/10"
                >
                  Max
                </button>
              </div>
              <p className="text-white/30 text-xs mt-1">
                {fmt(max)} {assetSym} available on {chain ? CHAIN_LABEL[chain as Chain] : "—"}
              </p>
            </Field>

            {error && <p className="text-rose-300/90 text-sm">{error}</p>}

            <button
              onClick={initiate}
              disabled={!canInitiate}
              className="w-full h-12 rounded-full bg-white text-black font-medium hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {busy ? "Starting…" : "Continue"}
            </button>
          </div>
        )}

        {step === "auth" && (
          <div className="space-y-5">
            <p className="text-white/60 text-sm leading-relaxed">
              {usePassword
                ? "Enter your wallet password to authorize this withdrawal."
                : "We sent a 6-digit code to your email. Enter it to authorize this withdrawal."}
            </p>
            <Field label={usePassword ? "Wallet password" : "Email code"}>
              <input
                type={usePassword ? "password" : "text"}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={usePassword ? "••••••••" : "123456"}
                autoComplete={usePassword ? "current-password" : "one-time-code"}
                className="bg-[#1A1A1A] rounded-xl w-full h-11 px-4 text-white placeholder:text-white/20 focus:ring-2 focus:ring-white/20"
              />
            </Field>
            {error && <p className="text-rose-300/90 text-sm">{error}</p>}
            <button
              onClick={confirm}
              disabled={!secret.trim() || busy}
              className="w-full h-12 rounded-full bg-white text-black font-medium hover:bg-white/90 transition-colors disabled:opacity-30"
            >
              {busy ? "Confirming…" : "Confirm withdrawal"}
            </button>
            <button
              onClick={() => { setStep("form"); setError(null); }}
              className="w-full text-white/40 hover:text-white text-xs"
            >
              ← Back
            </button>
          </div>
        )}

        {step === "success" && (
          <div className="space-y-5 text-center">
            <div className="mx-auto h-14 w-14 rounded-full bg-emerald-400 text-black flex items-center justify-center text-2xl">
              ✓
            </div>
            <p className="text-white text-lg">Withdrawal submitted</p>
            <p className="text-white/50 text-sm">
              {fmt(amtNum)} {assetSym} is on its way to your address.
            </p>
            <div className="liquid-glass rounded-xl p-3">
              <p className="text-white/40 text-[10px] tracking-[0.2em] uppercase mb-1">
                Transaction hash
              </p>
              <p className="font-mono text-xs text-white/80 break-all">{txHash}</p>
            </div>
            <button
              onClick={onDone}
              className="w-full h-12 rounded-full bg-white text-black font-medium hover:bg-white/90 transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-white block">{label}</label>
      {children}
    </div>
  );
}

/* ─────────────────────────── Deposit address row ──────────────────────── */

function AddressRow({ chain, address }: { chain: string; address: string }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }
  return (
    <div className="liquid-glass rounded-2xl p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase mb-1">{chain}</p>
          <p className="font-mono text-xs text-white/80 break-all">{address}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowQr((v) => !v)}
            className="text-xs text-white/70 hover:text-white transition-colors px-3 py-2 rounded-full ring-1 ring-white/10 hover:ring-white/30"
          >
            {showQr ? "Hide QR" : "Show QR"}
          </button>
          <button
            type="button"
            onClick={copy}
            className="text-xs text-white/70 hover:text-white transition-colors px-3 py-2 rounded-full ring-1 ring-white/10 hover:ring-white/30"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
      </div>
      {showQr && (
        <div className="mt-4 flex justify-center">
          <div className="p-3 bg-white rounded-2xl">
            <QrCode value={address} size={176} />
          </div>
        </div>
      )}
    </div>
  );
}

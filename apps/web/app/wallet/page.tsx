"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { authedFetch, exitLiquidity } from "@/lib/auth-client";
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
  const { user, refreshUser } = useAuth();
  const [addrs, setAddrs] = useState<ChainAddrs | null>(null);
  const [assets, setAssets] = useState<AssetBreakdown[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  // "minting" plays the Seva Credit issuance animation when the wallet just
  // activated (tokens went 0 → 10B during a refresh on this page).
  const [minting, setMinting] = useState(false);

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
    const tokensBefore = user?.tokensMinted ?? 0;
    try {
      const res = await authedFetch(`${WALLET_BASE}/wallet/refresh`, { method: "POST" });
      if (res.ok) {
        const bal = await res.json();
        setAssets(Array.isArray(bal) ? bal : []);
        setOffline(false);
      }
      // The refresh may have activated the wallet + issued Seva Credit. Pull
      // fresh /me; if tokens just went 0 → positive, play the minting process.
      const updated = await refreshUser();
      const tokensAfter = updated?.tokensMinted ?? 0;
      if (tokensBefore <= 0 && tokensAfter > 0) {
        setMinting(true);
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

          {/* GoogolPlex Seva Credit — the member's 10B allocation, issued on
              wallet activation. Shown only here, inside the wallet. When the
              wallet just activated, a minting process animates the issuance. */}
          {(user?.tokensMinted ?? 0) > 0 && (
            <SevaCreditCard
              total={user!.tokensMinted ?? 0}
              minting={minting}
              onDone={() => setMinting(false)}
            />
          )}

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

          {/* Deposit — asset first, then network */}
          <DepositSection addrs={addrs} />

          {/* Transaction history — grouped by date, click a row for detail */}
          <TransactionHistory />

          {/* Protected liquidity — the $1 backing the member's tokens */}
          {(user?.tokensMinted ?? 0) > 0 && (
            <ProtectedLiquidity
              tokens={user!.tokensMinted!}
              referenceNo={user?.code11 ?? ""}
              onExited={refresh}
            />
          )}
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

/* ─────────────────────────── Transaction history ───────────────────────── */

type Tx = {
  id: string;
  kind: string;
  chain: string | null;
  symbol: string;
  amount: number; // signed
  usd: number | null;
  tx_hash: string | null;
  to: string | null;
  from: string | null;
  status: string;
  created_at: number | null;
};

const EXPLORER_TX: Record<string, (h: string) => string> = {
  eth: (h) => `https://etherscan.io/tx/${h}`,
  bsc: (h) => `https://bscscan.com/tx/${h}`,
  tron: (h) => `https://tronscan.org/#/transaction/${h}`,
  btc: (h) => `https://blockstream.info/tx/${h}`
};

function explorerUrl(chain: string | null, hash: string | null): string | null {
  if (!chain || !hash) return null;
  // Our synthetic "sync-…" hashes for reconciled deposits aren't real on-chain
  // ids, so don't link them out.
  if (hash.startsWith("sync-")) return null;
  return EXPLORER_TX[chain]?.(hash) ?? null;
}

function txMeta(
  kind: string,
  amount: number
): { label: string; icon: string; tone: string; chip: string } {
  const inChip = "bg-emerald-400/15 text-emerald-300";
  const outChip = "bg-black/[0.06] text-white";
  const neutralChip = "bg-black/[0.06] text-white/60";
  if (kind === "deposit") return { label: "Received", icon: "↓", tone: "text-emerald-300", chip: inChip };
  if (kind === "withdrawal") return { label: "Sent", icon: "↑", tone: "text-white", chip: outChip };
  if (kind === "withdrawal_refund") return { label: "Refund", icon: "↺", tone: "text-emerald-300", chip: inChip };
  if (kind === "studio_fee") return { label: "Studio fee", icon: "•", tone: "text-white/60", chip: neutralChip };
  if (kind.includes("swap")) return { label: "Swap", icon: "⇄", tone: "text-white", chip: neutralChip };
  return amount >= 0
    ? { label: "Received", icon: "↓", tone: "text-emerald-300", chip: inChip }
    : { label: "Sent", icon: "↑", tone: "text-white", chip: outChip };
}

function shortHash(h: string): string {
  return h.length > 18 ? `${h.slice(0, 10)}…${h.slice(-8)}` : h;
}

function dayKey(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function TransactionHistory() {
  const [txs, setTxs] = useState<Tx[] | null>(null);
  const [open, setOpen] = useState<Tx | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await authedFetch(`${WALLET_BASE}/wallet/history`);
        const data = r.ok ? await r.json() : [];
        setTxs(Array.isArray(data) ? data : []);
      } catch {
        setTxs([]);
      }
    })();
  }, []);

  // Group by day, preserving recency order.
  const groups = useMemo(() => {
    const g: { day: string; items: Tx[] }[] = [];
    for (const t of txs ?? []) {
      const day = t.created_at ? dayKey(t.created_at) : "—";
      const last = g[g.length - 1];
      if (last && last.day === day) last.items.push(t);
      else g.push({ day, items: [t] });
    }
    return g;
  }, [txs]);

  return (
    <section className="mt-10">
      <p className="text-white/40 text-xs tracking-[0.3em] uppercase mb-3">
        Transaction history
      </p>
      {txs === null ? (
        <div className="liquid-glass rounded-2xl p-6 text-white/60 text-sm">Loading…</div>
      ) : txs.length === 0 ? (
        <div className="liquid-glass rounded-2xl p-6 text-white/60 text-sm">
          No transactions yet. Deposits and withdrawals will appear here.
        </div>
      ) : (
        <div className="liquid-glass rounded-2xl overflow-hidden divide-y divide-white/10">
          {groups.map((grp) => (
            <div key={grp.day}>
              <p className="px-5 pt-4 pb-2 text-white/50 text-[11px] font-semibold tracking-wider uppercase">
                {grp.day}
              </p>
              {grp.items.map((t) => {
                const m = txMeta(t.kind, t.amount);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setOpen(t)}
                    className="w-full flex items-center gap-3.5 px-5 py-3.5 hover:bg-black/[0.03] transition-colors text-left"
                  >
                    <span
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-[15px] font-semibold shrink-0 ${m.chip}`}
                    >
                      {m.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-white leading-tight">
                        {m.label}
                      </span>
                      <span className="block text-xs text-white/55 truncate font-mono mt-0.5">
                        {t.to ? shortHash(t.to) : t.tx_hash ? shortHash(t.tx_hash) : t.symbol}
                      </span>
                    </span>
                    <span className="text-right shrink-0 min-w-[96px]">
                      <span className={`block text-sm font-semibold tabular-nums leading-tight ${m.tone}`}>
                        {t.amount >= 0 ? "+" : ""}
                        {fmt(t.amount, 8)} {t.symbol}
                      </span>
                      {t.usd != null && (
                        <span className="block text-xs text-white/50 tabular-nums mt-0.5">
                          {t.amount >= 0 ? "+" : "-"}
                          {usdFmt(t.usd)}
                        </span>
                      )}
                    </span>
                    <span className="text-white/40 shrink-0 text-lg leading-none">›</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {open && <TxDetail tx={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function TxDetail({ tx, onClose }: { tx: Tx; onClose: () => void }) {
  const m = txMeta(tx.kind, tx.amount);
  const url = explorerUrl(tx.chain, tx.tx_hash);
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md sm:rounded-3xl min-h-screen sm:min-h-0 ring-1 ring-black/10 p-6 shadow-2xl"
        style={{ background: "var(--surface-card)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white text-xl">
            ✕
          </button>
        </div>

        <div className="text-center mb-6">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 text-lg font-semibold ${m.chip}`}
          >
            {m.icon}
          </div>
          <p className="text-white/60 text-sm">{m.label}</p>
          <p className={`text-3xl font-medium tracking-tight mt-1 tabular-nums ${m.tone}`}>
            {tx.amount >= 0 ? "+" : ""}
            {fmt(tx.amount, 18)} {tx.symbol}
          </p>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-2 text-sky-400 hover:text-sky-300 text-sm"
            >
              View in explorer ↗
            </a>
          )}
        </div>

        <dl className="divide-y divide-white/10 text-sm">
          {tx.usd != null && (
            <Detail label="Amount">
              {tx.amount >= 0 ? "+" : "-"}
              {usdFmt(tx.usd)}
            </Detail>
          )}
          <Detail label="Type">{m.label}</Detail>
          <Detail label="Status">
            <span className={tx.status === "confirmed" || tx.status === "broadcast" ? "text-emerald-400" : "text-amber-300"}>
              {tx.status === "broadcast" ? "Confirmed" : tx.status.replace(/_/g, " ")}
            </span>
          </Detail>
          <Detail label="Account">{tx.chain ? CHAIN_LABEL[tx.chain as Chain] ?? tx.chain : "—"}</Detail>
          <Detail label="Date">
            {tx.created_at ? new Date(tx.created_at).toLocaleString() : "—"}
          </Detail>
          {tx.tx_hash && !tx.tx_hash.startsWith("sync-") && (
            <Detail label="Transaction ID">
              <span className="font-mono text-xs break-all">{tx.tx_hash}</span>
            </Detail>
          )}
          {tx.from && (
            <Detail label="From">
              <span className="font-mono text-xs break-all">{tx.from}</span>
            </Detail>
          )}
          {tx.to && (
            <Detail label="To">
              <span className="font-mono text-xs break-all">{tx.to}</span>
            </Detail>
          )}
        </dl>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="text-white/50 shrink-0">{label}</dt>
      <dd className="text-white text-right min-w-0">{children}</dd>
    </div>
  );
}

/* ──────────────────────── GoogolPlex Seva Credit ───────────────────────── */

function SevaCreditCard({
  total,
  minting,
  onDone
}: {
  total: number;
  minting: boolean;
  onDone: () => void;
}) {
  // While minting, ramp the displayed count 0 → total over ~2.4s (ease-out),
  // then settle and tell the parent we're done.
  const [shown, setShown] = useState(minting ? 0 : total);

  useEffect(() => {
    if (!minting) {
      setShown(total);
      return;
    }
    setShown(0);
    const duration = 2400;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setShown(Math.floor(eased * total));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setShown(total);
        // Hold the "issued" state briefly, then exit minting mode.
        setTimeout(onDone, 900);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minting, total]);

  return (
    <div
      className={`mt-4 liquid-glass rounded-3xl p-6 md:p-8 ring-1 transition-all ${
        minting ? "ring-amber-300/50 shadow-[0_0_40px_-12px_rgba(252,211,77,0.4)]" : "ring-amber-300/15"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <p className="text-amber-200/80 text-xs tracking-[0.3em] uppercase">
          GoogolPlex Seva Credit
        </p>
        {minting && (
          <span className="inline-block w-3 h-3 rounded-full border-2 border-amber-300/40 border-t-amber-300 animate-spin" />
        )}
      </div>
      <p className="text-5xl font-medium tracking-tight tabular-nums">
        {shown.toLocaleString()}
      </p>
      <p className="text-white/40 text-sm mt-2">
        {minting
          ? "Issuing your GoogolPlex Seva Credit…"
          : "Issued the moment your wallet activated."}
      </p>
    </div>
  );
}

/* ───────────────────────── Protected liquidity ─────────────────────────── */

function ProtectedLiquidity({
  tokens,
  referenceNo,
  onExited
}: {
  tokens: number;
  referenceNo: string;
  onExited: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ usd: number; tokens: number } | null>(null);

  async function exit() {
    const ok = window.confirm(
      `Withdraw your protected $1?\n\nThis surrenders ALL ${tokens.toLocaleString()} of your tokens to the platform — they're transferred to admin holdings under your reference number (${referenceNo}). This cannot be undone.`
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const r = await exitLiquidity();
      setDone({ usd: r.usdReleased, tokens: r.tokensTransferred });
      onExited();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <h2 className="text-lg text-white mb-1">Liquidity exited</h2>
        <p className="text-white/60 text-sm">
          ${done.usd.toFixed(2)} released. {done.tokens.toLocaleString()} tokens transferred to the
          platform under reference <span className="font-mono text-white/80">{referenceNo}</span>.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-10 rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] p-6">
      <h2 className="text-lg text-white mb-1">Protected liquidity</h2>
      <p className="text-white/60 text-sm leading-relaxed max-w-2xl">
        Your <span className="text-white">$1</span> deposit is the protected liquidity backing your{" "}
        <span className="text-white">{tokens.toLocaleString()}</span> tokens. You can withdraw the
        rest of your balance freely — but the moment a withdrawal takes your{" "}
        <span className="text-white">total balance below $1</span>, you forfeit the liquidity and{" "}
        <span className="text-white">all your tokens are surrendered</span> to the platform
        (recorded under your reference number{" "}
        <span className="font-mono text-white/80">{referenceNo}</span>). This is permanent.
      </p>
      {error && (
        <div className="mt-3 text-sm text-red-300 bg-red-950/40 border border-red-900/40 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={exit}
        disabled={busy}
        className="mt-4 rounded-full bg-white/10 text-white text-sm font-medium px-5 py-2.5 hover:bg-white/15 disabled:opacity-40"
      >
        {busy ? "Processing…" : "Exit now & surrender tokens"}
      </button>
    </section>
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
  // Withdrawals require BOTH the wallet password AND the emailed OTP.
  const [pwd, setPwd] = useState("");
  const [code, setCode] = useState("");
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
    if (!withdrawalId || !pwd.trim() || !code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch(
        `${WALLET_BASE}/wallet/withdrawals/${withdrawalId}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletPassword: pwd, code })
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
              Authorize this withdrawal with your wallet password and the 6-digit
              code we just emailed you.
            </p>
            <Field label="Wallet password">
              <input
                type="password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="bg-[#1A1A1A] rounded-xl w-full h-11 px-4 text-white placeholder:text-white/20 focus:ring-2 focus:ring-white/20"
              />
            </Field>
            <Field label="Email code">
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                autoComplete="one-time-code"
                className="bg-[#1A1A1A] rounded-xl w-full h-11 px-4 text-white placeholder:text-white/20 focus:ring-2 focus:ring-white/20 tracking-[0.3em] font-mono"
              />
            </Field>
            {error && <p className="text-rose-300/90 text-sm">{error}</p>}
            <button
              onClick={confirm}
              disabled={!pwd.trim() || code.length !== 6 || busy}
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

/* ─────────────────────────── Deposit (asset → network) ────────────────── */

type DepositAsset = {
  sym: string;
  chains: { label: string; key: Chain }[];
};

// Which networks each asset can be received on (maps to the user's per-chain
// address). USDT/USDC are multi-chain; natives + PARTY are single-chain.
const DEPOSIT_ASSETS: DepositAsset[] = [
  {
    sym: "USDT",
    chains: [
      { label: "Ethereum · ERC20", key: "eth" },
      { label: "BNB Chain · BEP20", key: "bsc" },
      { label: "Tron · TRC20", key: "tron" }
    ]
  },
  {
    sym: "USDC",
    chains: [
      { label: "Ethereum · ERC20", key: "eth" },
      { label: "BNB Chain · BEP20", key: "bsc" },
      { label: "Tron · TRC20", key: "tron" }
    ]
  },
  { sym: "ETH", chains: [{ label: "Ethereum", key: "eth" }] },
  { sym: "BNB", chains: [{ label: "BNB Chain", key: "bsc" }] },
  { sym: "TRX", chains: [{ label: "Tron", key: "tron" }] },
  { sym: "BTC", chains: [{ label: "Bitcoin", key: "btc" }] },
  { sym: "PARTY", chains: [{ label: "Tron · TRC20", key: "tron" }] }
];

function DepositSection({ addrs }: { addrs: ChainAddrs | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const ready = addrs && (addrs.eth || addrs.bsc || addrs.tron || addrs.btc);

  return (
    <section className="mt-12">
      <p className="text-white/40 text-xs tracking-[0.3em] uppercase mb-1">Deposit</p>
      <p className="text-white/40 text-sm mb-4">
        Pick a coin, then the network you&apos;re sending on.
      </p>

      {addrs === null ? (
        <p className="text-white/40 text-sm">Loading…</p>
      ) : !ready ? (
        <p className="text-white/40 text-sm">
          Addresses not yet allocated — finish wallet setup to provision them.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {DEPOSIT_ASSETS.map((a) => {
              const active = open === a.sym;
              return (
                <button
                  key={a.sym}
                  type="button"
                  onClick={() => setOpen(active ? null : a.sym)}
                  className={`rounded-2xl px-3 py-3 text-sm font-medium transition-colors ${
                    active
                      ? "bg-white text-black"
                      : "liquid-glass text-white hover:bg-white/5"
                  }`}
                >
                  {a.sym}
                </button>
              );
            })}
          </div>

          {open && (
            <div className="mt-4 space-y-2">
              {DEPOSIT_ASSETS.find((a) => a.sym === open)!.chains.map((c) => {
                const address = addrs[c.key];
                if (!address) return null;
                return (
                  <AddressRow
                    key={c.key}
                    chain={`${open} · ${c.label}`}
                    address={address}
                  />
                );
              })}
              <p className="text-white/30 text-xs mt-2">
                Only send <span className="text-white/60">{open}</span> on the
                selected network. Sending the wrong asset or network can lose funds.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

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

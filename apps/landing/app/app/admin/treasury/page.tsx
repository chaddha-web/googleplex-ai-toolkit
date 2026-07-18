"use client";

/**
 * Admin → Treasury. The money display the panel was missing: platform-wide
 * accounting metrics, the unified on-chain transaction feed (deposits,
 * withdrawals, sweeps), and the full ledger of credits/debits against member
 * balances. Read-only; backed by the wallet service.
 */

import { useEffect, useState } from "react";
import { StatCard, TokenLogo, ChainBadge } from "@/components/admin/ui";
import {
  adminAccounting,
  adminTransactions,
  adminLedger,
  adminTreasuryWallets,
  type Accounting,
  type SystemTx,
  type LedgerEntry,
  type TreasuryWallets
} from "@/lib/auth-client";

const usd = (n: number) =>
  "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 8 });

function ago(ms: number | null): string {
  if (!ms) return "—";
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function explorer(chain: string, hash: string | null): string | null {
  if (!hash) return null;
  switch (chain) {
    case "eth": return `https://etherscan.io/tx/${hash}`;
    case "bsc": return `https://bscscan.com/tx/${hash}`;
    case "tron": return `https://tronscan.org/#/transaction/${hash}`;
    case "btc": return `https://mempool.space/tx/${hash}`;
    default: return null;
  }
}

function TxHash({ chain, hash }: { chain: string; hash: string | null }) {
  if (!hash) return <span className="text-white/25">—</span>;
  const url = explorer(chain, hash);
  const short = hash.length > 14 ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : hash;
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="font-mono text-xs text-sky-300/80 hover:text-sky-200">
      {short}
    </a>
  ) : (
    <span className="font-mono text-xs text-white/50">{short}</span>
  );
}

const DIR_TONE: Record<string, string> = {
  in: "bg-emerald-400/[0.13] text-emerald-300",
  out: "bg-rose-400/[0.13] text-rose-300",
  sweep: "bg-amber-400/[0.14] text-amber-300"
};

export default function TreasuryPage() {
  const [acct, setAcct] = useState<Accounting | null>(null);
  const [tx, setTx] = useState<SystemTx[] | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[] | null>(null);
  const [tw, setTw] = useState<TreasuryWallets | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminAccounting().then(setAcct).catch((e) => setError((e as Error).message));
    adminTransactions(100).then(setTx).catch(() => setTx([]));
    adminLedger({ limit: 100 }).then(setLedger).catch(() => setLedger([]));
    adminTreasuryWallets()
      .then(setTw)
      .catch(() =>
        setTw({ configured: false, addresses: { eth: "", bsc: "", tron: "", btc: "" }, balances: [], totalUsd: 0 })
      );
  }, []);

  return (
    <section className="max-w-6xl mx-auto">
      <p className="text-white/40 text-xs tracking-[0.3em] uppercase">Accounting</p>
      <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-2">
        Treasury <em className="font-serif-i text-white/60">&amp; ledger</em>.
      </h1>

      {error && <p className="mt-6 text-rose-300/90 text-sm">{error}</p>}

      <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Member holdings" value={acct ? usd(acct.holdingsUsd) : "…"} hint="ledger balances" />
        <StatCard
          label="Deposits in"
          value={acct ? usd(acct.depositsUsd) : "…"}
          tone="emerald"
          hint={acct ? `${acct.counts.deposits} txns` : ""}
        />
        <StatCard
          label="Withdrawn out"
          value={acct ? usd(acct.withdrawnUsd) : "…"}
          tone="rose"
          hint={acct ? `${acct.counts.withdrawals} total` : ""}
        />
        <StatCard
          label="Pending"
          value={acct ? usd(acct.pendingUsd) : "…"}
          tone="amber"
          hint={acct ? `${acct.counts.pendingWithdrawals} awaiting` : ""}
        />
      </div>

      {acct && Object.keys(acct.byChain).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(acct.byChain).map(([c, v]) => (
            <span key={c} className="liquid-glass rounded-full px-3 py-1.5 text-xs text-white/70">
              {c.toUpperCase()} · {usd(v)}
            </span>
          ))}
        </div>
      )}

      {/* Withdrawal (treasury) wallets */}
      <h2 className="mt-12 font-serif text-2xl tracking-tight">
        Withdrawal <em className="font-serif-i text-white/60">wallets</em>
      </h2>
      <p className="text-white/40 text-xs mt-1">
        Live on-chain balance of the company wallets that pay out withdrawals — native coin included (gas).
      </p>
      {tw === null ? (
        <div className="mt-4 liquid-glass rounded-2xl px-6 py-8 text-center text-white/40 text-sm">Loading…</div>
      ) : !tw.configured ? (
        <div className="mt-4 liquid-glass rounded-2xl px-6 py-6 text-center text-white/40 text-sm">
          No withdrawal wallets configured yet — set them in Settings.
        </div>
      ) : (
        <div className="mt-4 liquid-glass rounded-2xl p-6">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <p className="text-white/40 text-[11px] tracking-[0.2em] uppercase">Total balance</p>
            <p className="text-3xl font-light">{usd(tw.totalUsd)}</p>
          </div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {(tw.holdings ?? []).length === 0 ? (
              <p className="text-white/40 text-sm col-span-full">All balances are zero.</p>
            ) : (
              (tw.holdings ?? []).map((h) => (
                <div key={h.chain + h.symbol} className="rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <TokenLogo symbol={h.symbol} />
                    <p className="text-white/50 text-xs inline-flex items-center gap-1.5">
                      {h.symbol}
                      <span className="text-white/30">·</span>
                      <ChainBadge chain={h.chain} />
                      {h.chain.toUpperCase()}
                    </p>
                  </div>
                  <p className="text-white/90 text-lg mt-2">{amt(h.amount)}</p>
                  {h.usd > 0 && <p className="text-white/40 text-xs">{usd(h.usd)}</p>}
                </div>
              ))
            )}
          </div>
          <div className="mt-5 space-y-1.5">
            {(["eth", "bsc", "tron", "btc"] as const).map((c) =>
              tw.addresses[c] ? (
                <div key={c} className="flex items-center gap-3 text-xs">
                  <span className="text-white/40 uppercase w-10 shrink-0">{c}</span>
                  <span className="font-mono text-white/60 truncate">{tw.addresses[c]}</span>
                </div>
              ) : null
            )}
          </div>
        </div>
      )}

      {/* System transactions */}
      <h2 className="mt-12 font-serif text-2xl tracking-tight">
        System <em className="font-serif-i text-white/60">transactions</em>
      </h2>
      <div className="mt-4 liquid-glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] tracking-[0.2em] uppercase text-white/40 border-b border-white/10">
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">USD</th>
                <th className="px-4 py-3 font-medium">Chain</th>
                <th className="px-4 py-3 font-medium">Tx</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {tx === null ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-white/40">Loading…</td></tr>
              ) : tx.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-white/40">No on-chain transactions yet.</td></tr>
              ) : (
                tx.map((t) => (
                  <tr key={`${t.type}-${t.id}`} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] ${DIR_TONE[t.direction]}`}>
                        {t.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-white/60">{t.userId.slice(0, 10)}…</td>
                    <td className="px-4 py-3 text-white/90">{amt(t.amount)} {t.symbol}</td>
                    <td className="px-4 py-3 text-white/60">{usd(t.usd)}</td>
                    <td className="px-4 py-3 text-white/50 text-xs uppercase">{t.chain}</td>
                    <td className="px-4 py-3"><TxHash chain={t.chain} hash={t.txHash} /></td>
                    <td className="px-4 py-3 text-white/50 text-xs">{t.status}</td>
                    <td className="px-4 py-3 text-white/40 text-xs whitespace-nowrap">{ago(t.at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ledger */}
      <h2 className="mt-12 font-serif text-2xl tracking-tight">
        Ledger <em className="font-serif-i text-white/60">entries</em>
      </h2>
      <p className="text-white/40 text-xs mt-1">Every credit and debit against a member&apos;s balance.</p>
      <div className="mt-4 liquid-glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] tracking-[0.2em] uppercase text-white/40 border-b border-white/10">
                <th className="px-4 py-3 font-medium">Kind</th>
                <th className="px-4 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium">Delta</th>
                <th className="px-4 py-3 font-medium">USD</th>
                <th className="px-4 py-3 font-medium">Chain</th>
                <th className="px-4 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {ledger === null ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-white/40">Loading…</td></tr>
              ) : ledger.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-white/40">No ledger entries yet.</td></tr>
              ) : (
                ledger.map((e) => {
                  const neg = e.amount < 0;
                  return (
                    <tr key={e.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-white/70 text-xs">{e.kind}</td>
                      <td className="px-4 py-3 font-mono text-xs text-white/60">{e.userId.slice(0, 10)}…</td>
                      <td className={`px-4 py-3 ${neg ? "text-rose-300/90" : "text-emerald-300/90"}`}>
                        {neg ? "" : "+"}{amt(e.amount)} {e.symbol}
                      </td>
                      <td className="px-4 py-3 text-white/50">{usd(Math.abs(e.usd))}</td>
                      <td className="px-4 py-3 text-white/50 text-xs uppercase">{e.chain ?? "—"}</td>
                      <td className="px-4 py-3 text-white/40 text-xs whitespace-nowrap">{ago(e.createdAt)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

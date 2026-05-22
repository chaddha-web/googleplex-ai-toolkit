"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { authedFetch, type WalletStatus } from "@/lib/auth-client";

const WALLET_BASE =
  process.env.NEXT_PUBLIC_WALLET_BASE || "http://localhost:4201";

type AssetBreakdown = { asset: string; total: number; usd: number | null };
type LedgerEntry = {
  id: string;
  chain: string | null;
  symbol: string;
  delta_raw: string;
  kind: string;
  ref_tx_hash?: string | null;
  created_at: number | null;
};

const DECIMALS: Record<string, number> = {
  ETH: 18, BNB: 18, TRX: 6, BTC: 8, USDT: 6, USDC: 6, PARTY: 6
};

/**
 * Home — the dashboard the user lands on after sign-in.
 * Live total balance (sum of /wallet/balances USD) + live activity feed
 * (/wallet/history). Wallet-not-active banner deep-links to onboarding.
 */
export default function HomePage() {
  const { user } = useAuth();
  const [totalUsd, setTotalUsd] = useState<number | null>(null);
  const [history, setHistory] = useState<LedgerEntry[] | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [bRes, hRes] = await Promise.all([
          authedFetch(`${WALLET_BASE}/wallet/balances`),
          authedFetch(`${WALLET_BASE}/wallet/history`)
        ]);
        if (bRes.ok) {
          const bal = (await bRes.json()) as AssetBreakdown[];
          if (Array.isArray(bal)) {
            setTotalUsd(bal.reduce((acc, a) => acc + (a.usd ?? 0), 0));
          }
        }
        if (hRes.ok) {
          const h = await hRes.json();
          setHistory(Array.isArray(h) ? h : []);
        }
      } catch {
        setTotalUsd(0);
        setHistory([]);
      }
    })();
  }, [user]);

  if (!user) return null;

  return (
    <div className="max-w-5xl mx-auto">
      <WalletBanner status={user.walletStatus} />

      <p className="text-white/40 text-xs tracking-[0.3em] uppercase">
        Signed in as
      </p>
      <h1 className="font-serif text-5xl md:text-6xl tracking-tight mt-2">
        Welcome,{" "}
        <em className="font-serif-i text-white/60">
          {user.firstName || "friend"}
        </em>
        .
      </h1>

      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card label="Member ID" value={user.code11} mono />
        <Card label="Email" value={user.email} />
        <Card label="Role" value={user.role} />
      </div>

      <section className="mt-12">
        <p className="text-white/40 text-xs tracking-[0.3em] uppercase mb-4">
          Wallet snapshot
        </p>
        <Link
          href="/wallet"
          className="block liquid-glass rounded-3xl p-6 md:p-8 hover:bg-white/5 transition-colors group"
        >
          <p className="text-white/40 text-xs tracking-[0.3em] uppercase mb-3">
            Total balance
          </p>
          <p className="text-5xl font-medium tracking-tight">
            {totalUsd === null
              ? "…"
              : `$${totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </p>
          <p className="text-white/40 text-sm mt-2">
            Fixed-price valuation across your funded assets.{" "}
            <span className="text-white/70 group-hover:text-white">
              Open wallet →
            </span>
          </p>
        </Link>
      </section>

      <section className="mt-12">
        <p className="text-white/40 text-xs tracking-[0.3em] uppercase mb-4">
          Recent activity
        </p>
        {history === null ? (
          <div className="liquid-glass rounded-2xl p-6 text-white/40 text-sm">
            Loading activity…
          </div>
        ) : history.length === 0 ? (
          <div className="liquid-glass rounded-2xl p-6 text-white/40 text-sm">
            No activity yet. Your deposits, withdrawals, votes and project
            milestones will appear here.
          </div>
        ) : (
          <ul className="space-y-2">
            {history.map((e) => (
              <ActivityRow key={e.id} entry={e} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ActivityRow({ entry }: { entry: LedgerEntry }) {
  const negative = entry.delta_raw.trim().startsWith("-");
  const rawAbs = entry.delta_raw.replace("-", "");
  const dec = DECIMALS[entry.symbol] ?? 18;
  let human = rawAbs;
  try {
    const n = BigInt(rawAbs);
    const d = BigInt(10) ** BigInt(dec);
    const whole = n / d;
    const frac = (n % d).toString().padStart(dec, "0").slice(0, 4).replace(/0+$/, "");
    human = frac ? `${whole}.${frac}` : `${whole}`;
  } catch {
    /* keep raw */
  }
  const when = entry.created_at
    ? new Date(entry.created_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    : "";
  const label =
    { deposit: "Deposit", withdrawal: "Withdrawal", swap_in: "Swap in", swap_out: "Swap out", fee: "Fee", admin_adjust: "Adjustment" }[
      entry.kind
    ] ?? entry.kind;
  return (
    <li className="liquid-glass rounded-2xl p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`h-8 w-8 rounded-full flex items-center justify-center text-sm shrink-0 ${
            negative ? "bg-white/10 text-white/70" : "bg-emerald-400 text-black"
          }`}
        >
          {negative ? "↑" : "↓"}
        </span>
        <div className="min-w-0">
          <p className="text-white text-sm">{label}</p>
          <p className="text-white/40 text-xs">
            {entry.chain ? `${entry.chain.toUpperCase()} · ` : ""}
            {when}
          </p>
        </div>
      </div>
      <span className={`font-mono text-sm shrink-0 ${negative ? "text-white/70" : "text-emerald-300"}`}>
        {negative ? "−" : "+"}
        {human} {entry.symbol}
      </span>
    </li>
  );
}

function Card({
  label,
  value,
  mono
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="liquid-glass rounded-2xl p-5">
      <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase mb-2">
        {label}
      </p>
      <p
        className={`text-white text-base ${
          mono ? "font-mono tracking-widest" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function WalletBanner({ status }: { status?: WalletStatus }) {
  if (!status || status === "active" || status === "locked") return null;
  const isPasswordPending = status === "pending_password";
  // Wallet onboarding is same-origin (in this app) so the session carries over.
  const href = isPasswordPending ? "/setup/password" : "/setup/deposit";
  const label = isPasswordPending
    ? "Finish wallet setup"
    : "Complete your $1 activation deposit";
  const sub = isPasswordPending
    ? "Studio publishing and Community joining are locked until your wallet is active."
    : "We're waiting for your $1 USDT/USDC to land on-chain.";
  return (
    <a
      href={href}
      className="block liquid-glass rounded-2xl p-5 mb-10 ring-1 ring-amber-300/20 hover:ring-amber-300/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-amber-200 text-[10px] tracking-[0.3em] uppercase mb-1.5">
            Wallet inactive
          </p>
          <p className="text-white text-base font-medium">{label}</p>
          <p className="text-white/60 text-sm mt-1 leading-relaxed">{sub}</p>
        </div>
        <span className="text-white/60 text-xl shrink-0">→</span>
      </div>
    </a>
  );
}

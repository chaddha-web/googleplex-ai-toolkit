"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth-context";
import type { WalletStatus } from "@/lib/auth-client";

const LANDING_URL =
  process.env.NEXT_PUBLIC_LANDING_URL || "http://localhost:3010";

/**
 * Home — the dashboard the user lands on after sign-in.
 *
 * Surfaces: identity card, wallet snapshot (placeholder until /wallet/balances
 * is wired), recent activity (placeholder). Wallet-not-active banner that
 * deep-links back to the landing onboarding flow.
 */
export default function HomePage() {
  const { user } = useAuth();
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
          <p className="text-5xl font-medium tracking-tight">$0.00</p>
          <p className="text-white/40 text-sm mt-2">
            Wallet balances populate once your addresses are allocated and a
            deposit lands.{" "}
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
        <div className="liquid-glass rounded-2xl p-6 text-white/40 text-sm">
          No activity yet. Your sign-ins, deposits, votes and project
          milestones will appear here.
        </div>
      </section>
    </div>
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
  // Wallet onboarding lives on landing. Deep-link back there.
  const href = isPasswordPending
    ? `${LANDING_URL}/app/setup/wallet`
    : `${LANDING_URL}/app/setup/deposit`;
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

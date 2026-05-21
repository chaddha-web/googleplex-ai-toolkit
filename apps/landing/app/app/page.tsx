"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useAuth } from "@/components/auth-context";
import { webHandoffUrl, type WalletStatus } from "@/lib/auth-client";

export default function AppHome() {
  const { user, signOut } = useAuth();

  // Once the user is fully onboarded (profile + saw wallet choice), the
  // product dashboard lives at apps/web :3000. Redirect there with the
  // JWT in a URL hash so they don't have to re-authenticate.
  useEffect(() => {
    if (!user) return;
    if (user.role === "admin") return; // admin uses /app/admin here
    // We treat "profile complete" as enough to graduate to apps/web — the
    // wallet-not-active banner travels with them and shows there too.
    if (user.profileCompletedAt) {
      window.location.href = webHandoffUrl("/");
    }
  }, [user]);

  if (!user) return null; // gate handles redirect

  return (
    <main className="min-h-screen bg-black text-white font-sans">
      <Header />
      <section className="max-w-4xl mx-auto px-6 py-14">
        <WalletBanner status={user.walletStatus} />

        <p className="text-white/40 text-xs tracking-[0.3em] uppercase">
          Signed in as
        </p>
        <h1 className="font-serif text-5xl md:text-6xl tracking-tight mt-2">
          Welcome, <em className="font-serif-i text-white/60">{user.firstName || "friend"}</em>.
        </h1>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card label="Member ID" value={user.code11} mono />
          <Card label="Email" value={user.email} />
          <Card label="Role" value={user.role} />
        </div>

        {user.tokensMinted != null && user.tokensMinted > 0 && (
          <div className="liquid-glass rounded-3xl mt-4 p-6 md:p-8">
            <p className="text-white/40 text-xs tracking-[0.3em] uppercase mb-3">
              Your tokens
            </p>
            <p className="text-4xl md:text-5xl font-medium tracking-tight">
              {user.tokensMinted.toLocaleString()}
            </p>
            <p className="text-white/40 text-sm mt-2">
              Personalized tokens minted in your name at signup.
            </p>
          </div>
        )}

        {/* Wallet card — placeholder. Will pull from /wallet/balances next pass. */}
        <div className="liquid-glass rounded-3xl mt-10 p-6 md:p-8">
          <div className="flex items-center justify-between mb-4">
            <p className="text-white/40 text-xs tracking-[0.3em] uppercase">
              Total Balance
            </p>
            <button
              type="button"
              disabled
              className="text-white/30 text-xs hover:text-white/50 transition-colors"
              title="Wallet API coming next"
            >
              ↻ Refresh
            </button>
          </div>
          <p className="text-5xl font-medium tracking-tight">$0.00</p>
          <p className="text-white/40 text-sm mt-2">
            Wallet balances appear here once your deposit addresses are
            allocated.
          </p>
        </div>

        {user.role === "admin" && (
          <div className="mt-10">
            <Link
              href="/app/admin"
              className="liquid-glass rounded-full px-6 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors inline-flex"
            >
              Open admin panel →
            </Link>
          </div>
        )}

        <div className="mt-16">
          <button
            type="button"
            onClick={signOut}
            className="text-white/40 hover:text-white text-sm transition-colors"
          >
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}

function Header() {
  return (
    <nav className="relative z-20 w-full px-6 py-6 border-b border-white/5">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="GoogolPlex" className="h-7 w-auto object-contain" />
          <span className="font-semibold text-lg tracking-tight">GoogolPlex</span>
        </Link>
        <div className="text-white/40 text-xs tracking-[0.3em] uppercase">
          Dashboard
        </div>
      </div>
    </nav>
  );
}

function Card({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
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
  // Active or unset (server doesn't even know the field) — no banner.
  if (!status || status === "active" || status === "locked") return null;
  const isPasswordPending = status === "pending_password";
  const href = isPasswordPending ? "/app/setup/wallet" : "/app/setup/deposit";
  const label = isPasswordPending
    ? "Finish wallet setup"
    : "Complete your $1 activation deposit";
  const sub = isPasswordPending
    ? "Studio publishing and Community joining are locked until your wallet is active."
    : "We're waiting for your $1 USDT/USDC to land on-chain.";
  return (
    <Link
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
    </Link>
  );
}

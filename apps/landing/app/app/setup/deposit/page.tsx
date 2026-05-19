"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/auth-context";
import { authedFetch, fetchMe } from "@/lib/auth-client";
import { QrCode } from "@/components/qr-code";

const WALLET_BASE = (
  process.env.NEXT_PUBLIC_WALLET_BASE || "http://localhost:4201"
).replace(/\/$/, "");

const POLL_MS = 8_000;

type AddressInfo = {
  chain: "TRC20" | "ERC20" | "BEP20";
  symbol: "USDT" | "USDC";
  address: string;
};

/** Build the deposit-address list we render from the wallet's per-chain
 *  address response. USDT lives on all three chains; USDC on ERC20/BEP20. */
function expandAddresses(chainAddrs: {
  eth?: string;
  bsc?: string;
  tron?: string;
}): AddressInfo[] {
  const out: AddressInfo[] = [];
  if (chainAddrs.tron) out.push({ chain: "TRC20", symbol: "USDT", address: chainAddrs.tron });
  if (chainAddrs.eth) {
    out.push({ chain: "ERC20", symbol: "USDT", address: chainAddrs.eth });
    out.push({ chain: "ERC20", symbol: "USDC", address: chainAddrs.eth });
  }
  if (chainAddrs.bsc) {
    out.push({ chain: "BEP20", symbol: "USDT", address: chainAddrs.bsc });
    out.push({ chain: "BEP20", symbol: "USDC", address: chainAddrs.bsc });
  }
  return out;
}

type DepositStatus = {
  creditedUsd: number;
  thresholdUsd: number;
  active: boolean;
};

/**
 * Deposit page — collects the $1 USDT/USDC activation deposit.
 *
 * Calls services/wallet (:4201) for the user's deposit address. If wallet
 * service isn't running yet we render an offline state with clear copy
 * rather than a generic error — this is the most likely failure mode
 * during local dev right now.
 */
export default function DepositPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [addresses, setAddresses] = useState<AddressInfo[] | null>(null);
  const [status, setStatus] = useState<DepositStatus | null>(
    user
      ? {
          creditedUsd: user.initialDepositCreditedUsd ?? 0,
          thresholdUsd: 1,
          active: user.walletStatus === "active"
        }
      : null
  );
  const [walletOffline, setWalletOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Try to load deposit addresses on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch(`${WALLET_BASE}/wallet/addresses`);
        if (res.status === 404) {
          // Addresses not yet allocated for this user. Either init-seeds
          // hasn't been run, or auth never triggered POST /wallet/users.
          // Treat as offline so the user gets a useful explanation.
          if (!cancelled) setWalletOffline(true);
          return;
        }
        if (!res.ok) throw new Error(`${res.status}`);
        const data = (await res.json()) as {
          eth?: string;
          bsc?: string;
          tron?: string;
          btc?: string;
        };
        if (cancelled) return;
        setAddresses(expandAddresses(data));
      } catch {
        if (!cancelled) setWalletOffline(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll the auth service for the latest wallet status (the wallet-service
  // webhook updates it via /internal/users/:id/wallet-status whenever a
  // credited deposit lands).
  useEffect(() => {
    if (status?.active) return;
    const t = setInterval(async () => {
      const u = await fetchMe();
      if (!u) return;
      const updated: DepositStatus = {
        creditedUsd: u.initialDepositCreditedUsd ?? 0,
        thresholdUsd: 1,
        active: u.walletStatus === "active"
      };
      setStatus(updated);
      if (updated.active) {
        setTimeout(() => router.push("/app"), 1500);
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [status?.active, router]);

  return (
    <main className="relative w-full min-h-screen overflow-x-hidden flex flex-col items-center font-sans bg-black text-white selection:bg-white/20 selection:text-white">
      <div className="fixed inset-0 z-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_rgba(180,140,255,0.06)_0%,_transparent_60%)]" />

      <section className="relative z-10 w-full max-w-xl px-6 pt-16 md:pt-24 pb-24">
        <Link
          href="/app"
          className="inline-flex items-center gap-2 text-white/50 hover:text-white text-xs transition-colors mb-10"
        >
          ← Dashboard
        </Link>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-white/40 text-xs tracking-[0.3em] uppercase mb-6"
        >
          Wallet · 2 of 2
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.05 }}
          className="font-serif text-white tracking-tight text-5xl md:text-6xl leading-[1.05]"
        >
          Activate with <em className="font-serif-i text-white/60">$1</em>.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="text-white/70 text-base md:text-lg leading-relaxed mt-6"
        >
          Send <span className="text-white">$1 in USDT or USDC</span> to any of
          the addresses below. Your wallet activates the moment the deposit
          confirms on-chain.
        </motion.p>

        {/* Progress / status card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="liquid-glass rounded-3xl mt-10 p-6"
        >
          <div className="flex items-center justify-between">
            <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase">
              Activation progress
            </p>
            {status?.active ? (
              <span className="text-emerald-300 text-xs">Wallet active ✓</span>
            ) : (
              <span className="text-white/30 text-xs">Waiting for deposit…</span>
            )}
          </div>
          <p className="text-3xl font-medium tracking-tight mt-3">
            ${(status?.creditedUsd ?? 0).toFixed(2)}
            <span className="text-white/40 text-base ml-2">
              / ${(status?.thresholdUsd ?? 1).toFixed(2)}
            </span>
          </p>
          <div className="h-1.5 mt-4 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-700"
              style={{
                width: `${Math.min(100, ((status?.creditedUsd ?? 0) / (status?.thresholdUsd ?? 1)) * 100)}%`
              }}
            />
          </div>
        </motion.div>

        {/* Address list, offline state, or skeleton */}
        <div className="mt-8">
          {walletOffline ? (
            <OfflineCard />
          ) : addresses === null ? (
            <p className="text-white/40 text-sm">Loading your deposit addresses…</p>
          ) : addresses.length === 0 ? (
            <p className="text-white/40 text-sm">
              No deposit addresses allocated yet. Try refresh in a moment.
            </p>
          ) : (
            <div className="space-y-3">
              {addresses.map((a) => (
                <AddressRow key={`${a.chain}-${a.symbol}`} info={a} />
              ))}
            </div>
          )}

          {error ? <p className="mt-4 text-rose-300/90 text-sm">{error}</p> : null}
        </div>

        <p className="mt-8 text-white/40 text-xs leading-relaxed">
          The deposit stays in your wallet — we don&apos;t take a cut. Any amount
          over $1 just becomes your initial USDT/USDC balance. Network fees
          (gas) are paid by you.
        </p>
      </section>
    </main>
  );
}

function AddressRow({ info }: { info: AddressInfo }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(info.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — let user select manually */
    }
  }
  return (
    <div className="liquid-glass rounded-2xl p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase mb-1">
            {info.symbol} · {info.chain}
          </p>
          <p className="font-mono text-xs text-white/80 break-all">{info.address}</p>
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
      {showQr ? (
        <div className="mt-4 flex justify-center">
          <div className="p-3 bg-white rounded-2xl">
            <QrCode value={info.address} size={176} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OfflineCard() {
  return (
    <div className="liquid-glass rounded-3xl p-6 ring-1 ring-amber-300/20">
      <p className="text-amber-200 text-xs tracking-[0.2em] uppercase mb-2">
        Wallet service offline
      </p>
      <p className="text-white/70 text-sm leading-relaxed">
        Your wallet password is saved, but the address allocator
        (<code className="text-white/90">services/wallet</code> on :4201) isn&apos;t
        running yet. Start it locally and reload this page to see your
        deposit addresses.
      </p>
      <p className="text-white/40 text-xs mt-4">
        Need to skip for now?{" "}
        <Link href="/app" className="underline hover:text-white">
          Go to dashboard
        </Link>{" "}
        — you can come back here anytime to finish activation.
      </p>
    </div>
  );
}


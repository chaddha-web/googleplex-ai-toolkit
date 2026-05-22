"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

function expandAddresses(c: { eth?: string; bsc?: string; tron?: string }): AddressInfo[] {
  const out: AddressInfo[] = [];
  if (c.tron) out.push({ chain: "TRC20", symbol: "USDT", address: c.tron });
  if (c.eth) {
    out.push({ chain: "ERC20", symbol: "USDT", address: c.eth });
    out.push({ chain: "ERC20", symbol: "USDC", address: c.eth });
  }
  if (c.bsc) {
    out.push({ chain: "BEP20", symbol: "USDT", address: c.bsc });
    out.push({ chain: "BEP20", symbol: "USDC", address: c.bsc });
  }
  return out;
}

export default function DepositPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [addresses, setAddresses] = useState<AddressInfo[] | null>(null);
  const [credited, setCredited] = useState(user?.initialDepositCreditedUsd ?? 0);
  const [active, setActive] = useState(user?.walletStatus === "active");
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch(`${WALLET_BASE}/wallet/addresses`);
        if (!res.ok) {
          if (!cancelled) setOffline(true);
          return;
        }
        const data = (await res.json()) as { eth?: string; bsc?: string; tron?: string };
        if (!cancelled) setAddresses(expandAddresses(data));
      } catch {
        if (!cancelled) setOffline(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (active) return;
    const t = setInterval(async () => {
      const u = await fetchMe();
      if (!u) return;
      setCredited(u.initialDepositCreditedUsd ?? 0);
      if (u.walletStatus === "active") {
        setActive(true);
        setTimeout(() => router.push("/"), 1500);
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [active, router]);

  return (
    <main className="min-h-screen w-full flex flex-col items-center font-sans bg-black text-white">
      <section className="w-full max-w-xl px-6 pt-16 md:pt-24 pb-24">
        <Link href="/" className="inline-flex items-center gap-2 text-white/50 hover:text-white text-xs mb-10">
          ← Dashboard
        </Link>

        <p className="text-white/40 text-xs tracking-[0.3em] uppercase mb-6">Wallet · 3 of 3</p>
        <h1 className="font-serif text-5xl md:text-6xl tracking-tight leading-[1.05]">
          Activate with <em className="font-serif-i text-white/60">$1</em>.
        </h1>
        <p className="text-white/70 text-base md:text-lg leading-relaxed mt-6">
          Send <span className="text-white">$1 in USDT or USDC</span> to any address below.
          Your wallet activates the moment the deposit confirms on-chain.
        </p>

        <div className="liquid-glass rounded-3xl mt-10 p-6">
          <div className="flex items-center justify-between">
            <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase">Activation progress</p>
            {active ? (
              <span className="text-emerald-300 text-xs">Wallet active ✓</span>
            ) : (
              <span className="text-white/30 text-xs">Waiting for deposit…</span>
            )}
          </div>
          <p className="text-3xl font-medium tracking-tight mt-3">
            ${credited.toFixed(2)}
            <span className="text-white/40 text-base ml-2">/ $1.00</span>
          </p>
          <div className="h-1.5 mt-4 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-white transition-all duration-700" style={{ width: `${Math.min(100, (credited / 1) * 100)}%` }} />
          </div>
        </div>

        <div className="mt-8">
          {offline ? (
            <div className="liquid-glass rounded-3xl p-6 ring-1 ring-amber-300/20">
              <p className="text-amber-200 text-xs tracking-[0.2em] uppercase mb-2">Allocating addresses…</p>
              <p className="text-white/70 text-sm leading-relaxed">
                Your password is saved. Your deposit addresses are being provisioned —
                reload this page in a moment.
              </p>
            </div>
          ) : addresses === null ? (
            <p className="text-white/40 text-sm">Loading your deposit addresses…</p>
          ) : (
            <div className="space-y-3">
              {addresses.map((a) => (
                <AddressRow key={`${a.chain}-${a.symbol}`} info={a} />
              ))}
            </div>
          )}
        </div>

        <p className="mt-8 text-white/40 text-xs leading-relaxed">
          The deposit stays in your wallet — we don&apos;t take a cut. Anything over $1
          becomes your initial balance. Network fees (gas) are paid by you.
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
      /* ignore */
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
          <button type="button" onClick={() => setShowQr((v) => !v)} className="text-xs text-white/70 hover:text-white px-3 py-2 rounded-full ring-1 ring-white/10 hover:ring-white/30">
            {showQr ? "Hide QR" : "QR"}
          </button>
          <button type="button" onClick={copy} className="text-xs text-white/70 hover:text-white px-3 py-2 rounded-full ring-1 ring-white/10 hover:ring-white/30">
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
      </div>
      {showQr && (
        <div className="mt-4 flex justify-center">
          <div className="p-3 bg-white rounded-2xl">
            <QrCode value={info.address} size={176} />
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { authedFetch } from "@/lib/auth-client";
import { QrCode } from "@/components/qr-code";

const WALLET_BASE =
  process.env.NEXT_PUBLIC_WALLET_BASE || "http://localhost:4201";

type ChainAddrs = { eth?: string; bsc?: string; tron?: string; btc?: string };
type Balance = { symbol: string; chain: string; raw: string; decimals: number };

/**
 * Wallet page — live balances + deposit addresses + activity.
 *
 * Hits services/wallet (:4201) for /wallet/addresses and /wallet/balances.
 * Gracefully handles 404 (addresses not yet allocated) and the wallet
 * service being offline.
 */
export default function WalletPage() {
  const { user } = useAuth();
  const [addrs, setAddrs] = useState<ChainAddrs | null>(null);
  const [balances, setBalances] = useState<Balance[] | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [a, b] = await Promise.all([
          authedFetch(`${WALLET_BASE}/wallet/addresses`),
          authedFetch(`${WALLET_BASE}/wallet/balances`)
        ]);
        if (a.status === 404 || b.status === 404) {
          setAddrs({});
          setBalances([]);
          return;
        }
        if (!a.ok || !b.ok) throw new Error("non-2xx");
        setAddrs(await a.json());
        const bal = await b.json();
        // /wallet/balances returns an aggregated shape — flatten to list.
        setBalances(Array.isArray(bal) ? bal : flatten(bal));
      } catch {
        setOffline(true);
      }
    })();
  }, []);

  return (
    <div className="max-w-5xl mx-auto">
      <p className="text-white/40 text-xs tracking-[0.3em] uppercase">Wallet</p>
      <h1 className="font-serif text-5xl md:text-6xl tracking-tight mt-2">
        Your <em className="font-serif-i text-white/60">balances</em>.
      </h1>

      {offline ? (
        <div className="mt-10 liquid-glass rounded-3xl p-6 ring-1 ring-amber-300/20">
          <p className="text-amber-200 text-xs tracking-[0.2em] uppercase mb-2">
            Wallet service offline
          </p>
          <p className="text-white/70 text-sm leading-relaxed">
            <code>services/wallet</code> on :4201 isn&apos;t reachable. Once
            it&apos;s running and your master xpubs are initialised, balances
            appear here.
          </p>
        </div>
      ) : (
        <>
          <section className="mt-10">
            <p className="text-white/40 text-xs tracking-[0.3em] uppercase mb-3">
              Holdings
            </p>
            {balances === null ? (
              <p className="text-white/40 text-sm">Loading…</p>
            ) : balances.length === 0 ? (
              <p className="text-white/40 text-sm">
                No balances yet. Deposit USDT or USDC to your addresses below.
              </p>
            ) : (
              <ul className="space-y-2">
                {balances.map((b, i) => (
                  <li
                    key={`${b.symbol}-${b.chain}-${i}`}
                    className="liquid-glass rounded-2xl p-4 flex items-center justify-between"
                  >
                    <span className="text-white">
                      {b.symbol}{" "}
                      <span className="text-white/40 text-sm">{b.chain}</span>
                    </span>
                    <span className="font-mono text-sm text-white/80">
                      {formatRaw(b.raw, b.decimals)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-12">
            <p className="text-white/40 text-xs tracking-[0.3em] uppercase mb-3">
              Deposit addresses
            </p>
            {addrs === null ? (
              <p className="text-white/40 text-sm">Loading…</p>
            ) : !addrs.eth && !addrs.bsc && !addrs.tron && !addrs.btc ? (
              <p className="text-white/40 text-sm">
                Addresses not yet allocated. Set your wallet password from
                onboarding to provision.
              </p>
            ) : (
              <div className="space-y-2">
                {(["tron", "eth", "bsc", "btc"] as const).map((k) =>
                  addrs[k] ? (
                    <AddressRow key={k} chain={labelForChain(k)} address={addrs[k]!} />
                  ) : null
                )}
              </div>
            )}
          </section>
        </>
      )}

      <p className="mt-12 text-white/30 text-xs">
        Member ID{" "}
        <span className="font-mono text-white/60 tracking-widest">
          {user?.code11}
        </span>
      </p>
    </div>
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
          <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase mb-1">
            {chain}
          </p>
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
      {showQr ? (
        <div className="mt-4 flex justify-center">
          <div className="p-3 bg-white rounded-2xl">
            <QrCode value={address} size={176} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function labelForChain(k: "eth" | "bsc" | "tron" | "btc"): string {
  return { eth: "Ethereum (ERC20)", bsc: "BSC (BEP20)", tron: "Tron (TRC20)", btc: "Bitcoin" }[k];
}

function formatRaw(raw: string, decimals: number): string {
  try {
    const n = BigInt(raw);
    const divisor = BigInt(10) ** BigInt(decimals);
    const whole = n / divisor;
    const frac = (n % divisor).toString().padStart(decimals, "0").slice(0, 4);
    return `${whole.toString()}.${frac}`;
  } catch {
    return raw;
  }
}

function flatten(agg: unknown): Balance[] {
  if (!agg || typeof agg !== "object") return [];
  const out: Balance[] = [];
  for (const [k, v] of Object.entries(agg as Record<string, unknown>)) {
    if (v && typeof v === "object" && "raw" in v && "decimals" in v) {
      const obj = v as { raw: string; decimals: number; chain?: string };
      out.push({ symbol: k, chain: obj.chain ?? "", raw: obj.raw, decimals: obj.decimals });
    }
  }
  return out;
}

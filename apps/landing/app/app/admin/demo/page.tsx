"use client";

/**
 * Admin → Demo accounts. Founder-only.
 *
 * One place to see every account whose withdrawals are being faked, how much
 * fabricated balance each is carrying, and to switch any of them back to real.
 *
 * The point of this page is that demo accounts can never be forgotten about:
 * an account quietly stuck in demo mode is an account whose "sent" withdrawals
 * are lies, so the list is deliberately loud and always shows the total
 * fabricated exposure.
 */

import { useCallback, useEffect, useState } from "react";
import { StatCard } from "@/components/admin/ui";
import { adminDemoAccounts, adminSetDemoAccount, type DemoAccount } from "@/lib/auth-client";

const usd = (n: number) =>
  "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function when(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function DemoAccountsPage() {
  const [data, setData] = useState<{
    enabled: boolean;
    maxCreditUsd: number;
    accounts: DemoAccount[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    adminDemoAccounts()
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(load, [load]);

  async function turnOff(a: DemoAccount) {
    if (
      !confirm(
        `Turn OFF demo mode for this account?\n\n` +
          `Any fabricated balance still in the ledger (${usd(a.fabricatedUsd)}) will be clawed ` +
          `back first, so it can never be withdrawn for real. This cannot be undone.`
      )
    )
      return;
    setBusyId(a.userId);
    setError(null);
    setNote(null);
    try {
      const r = await adminSetDemoAccount(a.userId, false);
      const rev = r.reversed ?? [];
      setNote(
        rev.length
          ? `Demo mode off. Clawed back ${rev
              .map((x) => `${x.amount} ${x.symbol}${x.reason === "residual" ? " (converted)" : ""}`)
              .join(", ")}.`
          : "Demo mode off. No fabricated balance was left to claw back."
      );
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const totalFabricated = (data?.accounts ?? []).reduce((s, a) => s + a.fabricatedUsd, 0);

  return (
    <section className="max-w-6xl mx-auto">
      <p className="text-white/40 text-xs tracking-[0.3em] uppercase">Testing</p>
      <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-2">
        Demo <em className="font-serif-i text-white/60">accounts</em>.
      </h1>
      <p className="text-white/45 text-sm mt-3 max-w-2xl">
        These members&apos; withdrawals complete in the UI but never go on-chain, and their
        balances are fabricated. Nothing here touches the treasury, and none of it counts
        toward platform accounting.
      </p>

      {error && <p className="mt-6 text-rose-300/90 text-sm">{error}</p>}
      {note && <p className="mt-6 text-emerald-300/90 text-sm">{note}</p>}

      <div className="mt-8 grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard
          label="Demo accounts"
          value={data ? String(data.accounts.length) : "…"}
          tone={data && data.accounts.length > 0 ? "amber" : "default"}
        />
        <StatCard
          label="Fabricated balance"
          value={data ? usd(totalFabricated) : "…"}
          tone="amber"
          hint="not real money"
        />
        <StatCard
          label="Feature status"
          value={data ? (data.enabled ? "Enabled" : "Disabled") : "…"}
          tone={data && !data.enabled ? "emerald" : "amber"}
          hint={data && !data.enabled ? "DEMO_ACCOUNTS_ENABLED=0" : `cap ${data ? usd(data.maxCreditUsd) : "…"} / account`}
        />
      </div>

      {data && !data.enabled && (
        <p className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.05] p-4 text-emerald-200/85 text-sm">
          Demo mode is switched off server-wide, so every account below currently behaves
          normally — withdrawals broadcast for real.
        </p>
      )}

      {data && data.accounts.length === 0 ? (
        <p className="mt-10 text-white/40 text-sm">
          No demo accounts. Mark one from a member&apos;s drawer in Members.
        </p>
      ) : (
        <div className="mt-8 space-y-3">
          {(data?.accounts ?? []).map((a) => (
            <div
              key={a.userId}
              className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.04] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-white/70 break-all">{a.userId}</p>
                  <p className="text-white/40 text-xs mt-1">
                    {a.note || "no note"} · since {when(a.at)}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-amber-300 text-lg font-light">{usd(a.fabricatedUsd)}</p>
                    <p className="text-white/30 text-[11px]">fabricated</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => turnOff(a)}
                    disabled={busyId === a.userId}
                    className="text-xs font-medium px-4 py-2 rounded-full ring-1 ring-white/20 text-white/85 hover:bg-white/5 transition-colors disabled:opacity-40"
                  >
                    {busyId === a.userId ? "Working…" : "Turn off"}
                  </button>
                </div>
              </div>

              {a.credits.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {a.credits.map((c) => (
                    <span
                      key={`${c.chain}:${c.symbol}`}
                      className="rounded-full bg-black/25 px-3 py-1.5 text-xs text-white/65"
                    >
                      {c.amount.toLocaleString(undefined, { maximumFractionDigits: 8 })} {c.symbol}
                      <span className="text-white/30"> on {c.chain}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!data && !error && <p className="mt-8 text-white/40 text-sm">Loading…</p>}
    </section>
  );
}

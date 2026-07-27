"use client";

/**
 * Admin → Sales. What the platform actually EARNED.
 *
 * Deliberately narrow: revenue only. Deposits (a member funding their own
 * custodial balance) and withdrawals (paying it back out) are member money
 * moving, not income, and live on the Treasury page. Every row here is a
 * completed purchase recorded in the `sales` table at the price charged.
 */

import { useEffect, useMemo, useState } from "react";
import { StatCard, TokenLogo, ChainBadge } from "@/components/admin/ui";
import { adminSales, type SalesReport } from "@/lib/auth-client";

const usd = (n: number) =>
  "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 8 });

function when(ms: number | null): string {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** Minimal inline bar chart — daily revenue for the last 30 days. */
function Trend({ daily }: { daily: SalesReport["daily"] }) {
  const max = useMemo(() => Math.max(...daily.map((d) => d.usd), 0), [daily]);
  if (daily.length === 0 || max <= 0) return null;
  return (
    <div className="liquid-glass rounded-2xl p-5 mt-3">
      <p className="text-white/40 text-[11px] tracking-[0.2em] uppercase">Last 30 days</p>
      <div className="mt-4 flex items-end gap-1 h-24">
        {daily.map((d) => (
          <div
            key={d.date}
            className="flex-1 min-w-[3px] rounded-t bg-emerald-400/40 hover:bg-emerald-400/70 transition-colors"
            style={{ height: `${Math.max((d.usd / max) * 100, 2)}%` }}
            title={`${d.date} · ${usd(d.usd)} · ${d.count} sale${d.count === 1 ? "" : "s"}`}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-white/30 text-[11px]">
        <span>{daily[0]?.date}</span>
        <span>peak {usd(max)}</span>
        <span>{daily[daily.length - 1]?.date}</span>
      </div>
    </div>
  );
}

export default function SalesPage() {
  const [data, setData] = useState<SalesReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    adminSales({ limit: 200, item: item ?? undefined })
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [item]);

  const empty = data && data.sales.length === 0;

  return (
    <section className="max-w-6xl mx-auto">
      <p className="text-white/40 text-xs tracking-[0.3em] uppercase">Revenue</p>
      <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-2">
        Sales <em className="font-serif-i text-white/60">&amp; earnings</em>.
      </h1>

      {error && <p className="mt-6 text-rose-300/90 text-sm">{error}</p>}

      <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total earned"
          value={data ? usd(data.totals.usd) : "…"}
          tone="emerald"
          hint={data ? `${data.totals.count} sale${data.totals.count === 1 ? "" : "s"}` : ""}
        />
        <StatCard
          label="Today"
          value={data ? usd(data.periods.today.usd) : "…"}
          hint={data ? `${data.periods.today.n} sold` : ""}
        />
        <StatCard
          label="Last 7 days"
          value={data ? usd(data.periods.week.usd) : "…"}
          hint={data ? `${data.periods.week.n} sold` : ""}
        />
        <StatCard
          label="Last 30 days"
          value={data ? usd(data.periods.month.usd) : "…"}
          hint={data ? `${data.periods.month.n} sold` : ""}
        />
      </div>

      {data && <Trend daily={data.daily} />}

      {/* Per-product breakdown. New products appear here automatically. */}
      {data && data.byItem.length > 0 && (
        <>
          <h2 className="mt-10 text-white/40 text-[11px] tracking-[0.3em] uppercase">By product</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setItem(null)}
              className={`rounded-full px-4 py-2 text-xs transition-colors ${
                item === null ? "bg-white text-black" : "liquid-glass text-white/70 hover:bg-white/5"
              }`}
            >
              All · {usd(data.totals.usd)}
            </button>
            {data.byItem.map((b) => (
              <button
                key={b.item}
                type="button"
                onClick={() => setItem(b.item === item ? null : b.item)}
                className={`rounded-full px-4 py-2 text-xs transition-colors ${
                  item === b.item ? "bg-white text-black" : "liquid-glass text-white/70 hover:bg-white/5"
                }`}
              >
                {b.itemName || b.item} · {usd(b.usd)}{" "}
                <span className="opacity-50">({b.count})</span>
              </button>
            ))}
          </div>
        </>
      )}

      <h2 className="mt-10 text-white/40 text-[11px] tracking-[0.3em] uppercase">Recent sales</h2>

      {empty ? (
        <p className="mt-4 text-white/40 text-sm">
          No sales recorded yet. Studio unlocks appear here as soon as a member pays.
        </p>
      ) : (
        <div className="mt-3 liquid-glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-white/40 text-[11px] tracking-[0.15em] uppercase">
                  <th className="text-left font-normal px-5 py-3">Product</th>
                  <th className="text-left font-normal px-5 py-3">Member</th>
                  <th className="text-left font-normal px-5 py-3">Paid in</th>
                  <th className="text-right font-normal px-5 py-3">Amount</th>
                  <th className="text-right font-normal px-5 py-3">USD</th>
                  <th className="text-right font-normal px-5 py-3">When</th>
                </tr>
              </thead>
              <tbody>
                {(data?.sales ?? []).map((s) => (
                  <tr key={s.id} className="border-t border-white/[0.06]">
                    <td className="px-5 py-3 text-white/85">{s.itemName || s.item}</td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs text-white/45">{s.userId.slice(0, 10)}…</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-2">
                        <TokenLogo symbol={s.symbol} size={18} />
                        <span className="text-white/70">{s.symbol}</span>
                        {s.chain && <ChainBadge chain={s.chain} size={14} />}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-white/70">{amt(s.amount)}</td>
                    <td className="px-5 py-3 text-right text-emerald-300">{usd(s.usd)}</td>
                    <td className="px-5 py-3 text-right text-white/40 text-xs">{when(s.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!data && !error && <p className="mt-4 text-white/40 text-sm">Loading…</p>}
    </section>
  );
}

"use client";

/**
 * Admin → Token reclaims.
 *
 * Every time a member withdraws their protected $1 (exits the liquidity that
 * backs their 10B personalized tokens), those tokens are transferred to the
 * admin's holdings and recorded here — tagged with the member's reference
 * number (code11). This page is the audit trail: whose tokens, how many, the
 * $ released, and when. Header shows aggregate admin holdings.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import { tokenReclaims, type TokenReclaimRow } from "@/lib/auth-client";

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

export default function ReclaimsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<TokenReclaimRow[] | null>(null);
  const [totals, setTotals] = useState<{ tokens: number; usd: number; n: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/app");
  }, [user, router]);

  async function load() {
    setError(null);
    try {
      const r = await tokenReclaims.list();
      setRows(r.reclaims);
      setTotals(r.totals);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (user?.role === "admin") load();
  }, [user]);

  return (
    <section className="max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-8">
        <h1 className="font-serif text-3xl tracking-tight">Token reclaims</h1>
        <button
          type="button"
          onClick={load}
          className="rounded-full bg-white/10 text-white text-sm font-medium px-4 py-2 hover:bg-white/15"
        >
          Refresh
        </button>
      </div>
        <div className="flex gap-8 mb-8">
          <Stat label="Admin holdings (tokens)" value={(totals?.tokens ?? 0).toLocaleString()} />
          <Stat label="USD released to members" value={`$${(totals?.usd ?? 0).toFixed(2)}`} />
          <Stat label="Exits" value={(totals?.n ?? 0).toLocaleString()} />
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-400 bg-red-950/40 border border-red-900/40 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-white/60 text-xs uppercase tracking-wider">
              <tr>
                <Th>Reference No.</Th>
                <Th>Member</Th>
                <Th>Tokens → admin</Th>
                <Th>USD released</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {!rows ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-white/40">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-white/40">
                    No liquidity exits yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-white/[0.02]">
                    <Td>
                      <code className="text-white font-mono">{r.reference_no}</code>
                    </Td>
                    <Td className="text-white/60">{r.email || r.user_id}</Td>
                    <Td className="text-emerald-300">{r.tokens.toLocaleString()}</Td>
                    <Td className="text-white/80">${r.usd_released.toFixed(2)}</Td>
                    <Td className="text-white/50 text-xs whitespace-nowrap">{fmtTime(r.created_at)}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-white/30 text-xs mt-4">
          Each row is a member exiting the liquidity that backed their tokens. Their reference number
          is their member ID at the time of exit. Append-only — exits cannot be reversed here.
        </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-white/40 text-xs uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-light mt-1">{value}</div>
    </div>
  );
}
function Th({ children }: { children?: React.ReactNode }) {
  return <th className="text-left font-medium px-4 py-3">{children}</th>;
}
function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}

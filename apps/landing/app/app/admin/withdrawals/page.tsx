"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import {
  adminWithdrawalQueue,
  approveWithdrawal,
  rejectWithdrawal,
  type PendingWithdrawal
} from "@/lib/auth-client";

const usd = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function WithdrawalReviewPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<PendingWithdrawal[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/app");
  }, [user, router]);

  const load = useCallback(async () => {
    try {
      setRows(await adminWithdrawalQueue());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "admin") load();
  }, [user, load]);

  async function act(id: string, kind: "approve" | "reject") {
    if (kind === "reject" && !confirm("Reject this withdrawal and refund the member?")) return;
    if (kind === "approve" && !confirm("Approve and broadcast this withdrawal on-chain?")) return;
    setBusy(id);
    setError(null);
    try {
      if (kind === "approve") await approveWithdrawal(id);
      else await rejectWithdrawal(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!user || user.role !== "admin") return null;

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <Link href="/app/admin" className="text-white/60 hover:text-white text-sm">← Admin</Link>
        <h1 className="text-lg font-medium">Withdrawal review</h1>
        <button onClick={load} className="ml-auto text-white/50 hover:text-white text-xs">↻ Refresh</button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <p className="text-white/50 text-sm mb-6">
          Large withdrawals (above the review threshold) are held here. The member&apos;s
          balance is already debited — <span className="text-white/70">approve</span> to
          broadcast on-chain, or <span className="text-white/70">reject</span> to refund.
        </p>

        {error && <p className="text-rose-300 text-sm mb-4">{error}</p>}

        {rows === null ? (
          <p className="text-white/40 text-sm">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-white/40 text-sm">Nothing awaiting review. 🎉</p>
        ) : (
          <div className="space-y-3">
            {rows.map((w) => (
              <div key={w.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-white">
                      {w.amount.toLocaleString(undefined, { maximumFractionDigits: 8 })} {w.symbol}{" "}
                      <span className="text-white/40 text-sm">({usd(w.usd)}) on {w.chain}</span>
                    </p>
                    <p className="text-white/40 text-xs font-mono mt-1 break-all">→ {w.destAddress}</p>
                    <p className="text-white/30 text-[11px] mt-1">
                      user <span className="font-mono">{w.userId}</span> ·{" "}
                      {new Date(w.requestedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={busy === w.id}
                      onClick={() => act(w.id, "approve")}
                      className="text-xs px-4 py-2 rounded-full bg-emerald-400 text-black font-medium hover:bg-emerald-300 disabled:opacity-40"
                    >
                      {busy === w.id ? "…" : "Approve"}
                    </button>
                    <button
                      disabled={busy === w.id}
                      onClick={() => act(w.id, "reject")}
                      className="text-xs px-4 py-2 rounded-full ring-1 ring-rose-400/30 text-rose-200/90 hover:bg-rose-400/10 disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import {
  adminWithdrawalQueue,
  approveWithdrawal,
  rejectWithdrawal,
  getUserWithdrawLimits,
  setUserWithdrawLimits,
  type PendingWithdrawal,
  type WithdrawLimits
} from "@/lib/auth-client";

const usd = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function WithdrawalReviewPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<PendingWithdrawal[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    if (
      kind === "approve" &&
      !confirm("Record your approval? When enough distinct admins approve, it broadcasts on-chain.")
    )
      return;
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      if (kind === "approve") {
        const r = await approveWithdrawal(id);
        if (r.pending) setNotice(`Approval recorded — ${r.approvals}/${r.required} needed to broadcast.`);
      } else {
        await rejectWithdrawal(id);
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!user || user.role !== "admin") return null;

  return (
    <section className="max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <h1 className="font-serif text-3xl tracking-tight">Withdrawal review</h1>
        <button onClick={load} className="ml-auto text-white/50 hover:text-white text-xs">↻ Refresh</button>
      </div>
        <p className="text-white/50 text-sm mb-6">
          Large withdrawals (above the review threshold) are held here. The member&apos;s
          balance is already debited — <span className="text-white/70">approve</span> to
          broadcast on-chain, or <span className="text-white/70">reject</span> to refund.
        </p>

        {error && <p className="text-rose-300 text-sm mb-4">{error}</p>}
        {notice && <p className="text-emerald-300 text-sm mb-4">{notice}</p>}

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
                  <div className="flex items-center gap-2">
                    {w.required != null && w.required > 1 && (
                      <span className="text-white/40 text-xs whitespace-nowrap">
                        {w.approvals ?? 0}/{w.required} approved
                      </span>
                    )}
                    <button
                      disabled={busy === w.id || !!w.mineApproved}
                      onClick={() => act(w.id, "approve")}
                      className="text-xs px-4 py-2 rounded-full bg-emerald-400 text-black font-medium hover:bg-emerald-300 disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                    >
                      {w.mineApproved ? "You approved" : busy === w.id ? "…" : "Approve"}
                    </button>
                    <button
                      disabled={busy === w.id}
                      onClick={() => act(w.id, "reject")}
                      className="text-xs px-4 py-2 rounded-full ring-1 ring-rose-400/30 text-rose-200/90 hover:bg-rose-400/10 disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-14">
          <MemberLimits />
        </div>
    </section>
  );
}

function MemberLimits() {
  const [id, setId] = useState("");
  const [loaded, setLoaded] = useState<{ override: WithdrawLimits; effective: WithdrawLimits } | null>(null);
  const [form, setForm] = useState({ maxPerTxUsd: "", dailyUsd: "", reviewThresholdUsd: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    if (!id.trim()) return;
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const r = await getUserWithdrawLimits(id.trim());
      setLoaded(r);
      setForm({
        maxPerTxUsd: r.override.maxPerTxUsd?.toString() ?? "",
        dailyUsd: r.override.dailyUsd?.toString() ?? "",
        reviewThresholdUsd: r.override.reviewThresholdUsd?.toString() ?? ""
      });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setErr(null);
    setMsg(null);
    setBusy(true);
    const num = (s: string) => (s.trim() === "" ? null : Number(s));
    try {
      await setUserWithdrawLimits(id.trim(), {
        maxPerTxUsd: num(form.maxPerTxUsd),
        dailyUsd: num(form.dailyUsd),
        reviewThresholdUsd: num(form.reviewThresholdUsd)
      });
      setMsg("Saved. Blank fields fall back to the global limit.");
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const field = (k: keyof typeof form, label: string, eff?: number | null) => (
    <label className="block">
      <span className="text-white/50 text-xs">{label}</span>
      <input
        type="number"
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        placeholder={eff != null ? `global: $${eff}` : "global"}
        className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25"
      />
    </label>
  );

  return (
    <div className="liquid-glass rounded-2xl p-5">
      <h2 className="font-serif text-2xl tracking-tight">Per-member limits</h2>
      <p className="text-white/40 text-xs mt-1">
        Override a member&apos;s withdrawal caps. Blank = the global limit from Settings.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Member ID (e.g. CQGNRNJG0M6)"
          className="flex-1 min-w-[220px] rounded-full bg-white/5 border border-white/10 py-2 px-4 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 font-mono"
        />
        <button
          type="button"
          onClick={load}
          disabled={busy || !id.trim()}
          className="rounded-full bg-white/10 text-white text-sm font-medium px-4 py-2 hover:bg-white/15 disabled:opacity-40"
        >
          {busy ? "…" : "Load"}
        </button>
      </div>

      {loaded && (
        <>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {field("maxPerTxUsd", "Max per tx ($)", loaded.effective.maxPerTxUsd)}
            {field("dailyUsd", "24h daily ($)", loaded.effective.dailyUsd)}
            {field("reviewThresholdUsd", "Review over ($)", loaded.effective.reviewThresholdUsd)}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded-full bg-white text-black text-sm font-medium px-5 py-2 hover:bg-white/90 disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save override"}
            </button>
            {msg && <span className="text-emerald-300 text-xs">{msg}</span>}
          </div>
        </>
      )}
      {err && <p className="mt-3 text-rose-300/90 text-sm">{err}</p>}
    </div>
  );
}

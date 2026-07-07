"use client";

/**
 * User → Account → Security.
 *
 * Lists the user's own active sessions and lets them revoke any single one,
 * or "sign out everywhere else" in one click. The current device is marked
 * (via the X-Current-Session header injected by authedFetch); revoking it
 * is allowed but the UI confirms first since it'll bounce the user to login.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import {
  mySessions,
  type MySessionRow,
  currentSessionId,
  changeWalletPassword,
  confirmWalletPasswordChange,
  lockWallet,
  unlockWallet
} from "@/lib/auth-client";

function relTime(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function parseUA(ua: string | null): string {
  if (!ua) return "Unknown device";
  if (/iPhone|iPad/i.test(ua)) return "iPhone / iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Macintosh/i.test(ua)) return /Chrome/i.test(ua) ? "Mac · Chrome" : /Firefox/i.test(ua) ? "Mac · Firefox" : "Mac · Safari";
  if (/Windows/i.test(ua)) return /Edg/i.test(ua) ? "Windows · Edge" : /Firefox/i.test(ua) ? "Windows · Firefox" : "Windows · Chrome";
  if (/Linux/i.test(ua)) return /Chrome/i.test(ua) ? "Linux · Chrome" : "Linux";
  return ua.slice(0, 40);
}

export default function SecurityPage() {
  // The root layout already wraps every route in <DashboardShell>, so this
  // page must NOT add another one (that produced a duplicate sidebar).
  return <SecurityInner />;
}

function SecurityInner() {
  const { user } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<MySessionRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setRows(await mySessions.list());
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (user) load();
  }, [user]);

  async function revoke(id: string, isCurrent: boolean) {
    const msg = isCurrent
      ? "Sign out of THIS device? You'll be sent back to login."
      : "Sign out of that device?";
    if (!window.confirm(msg)) return;
    setBusy(id);
    try {
      await mySessions.revoke(id);
      if (isCurrent) {
        // Our own session is dead — bounce. The shell will reroute to login.
        router.refresh();
        window.location.reload();
        return;
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function revokeOthers() {
    if (!window.confirm("Sign out of every other device? This device stays signed in.")) return;
    setBusy("__others__");
    try {
      const r = await mySessions.revokeOthers();
      alert(`Signed out of ${r.killed} other device(s).`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const curId = currentSessionId();
  const sorted = (rows ?? []).sort((a, b) => {
    // Current device first, then newest.
    if (a.id === curId) return -1;
    if (b.id === curId) return 1;
    return b.created_at - a.created_at;
  });

  return (
    <div className="max-w-3xl mx-auto">
      <p className="text-white/40 text-xs tracking-[0.3em] uppercase">Security</p>
      <h1 className="font-serif text-5xl md:text-6xl tracking-tight mt-2">
        Your <em className="font-serif-i text-white/60">sessions</em>.
      </h1>
      <p className="text-white/60 text-sm mt-4 mb-8">
        Manage your wallet password and every device where you're signed in.
      </p>

      <WalletPasswordCard walletStatus={user?.walletStatus} />

      <div className="mt-6">
        <LockWalletCard />
      </div>

      <div className="mt-10" />

      {error && (
        <div className="mb-6 text-sm text-red-300 bg-red-950/40 border border-red-900/40 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="liquid-glass rounded-3xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <div className="text-sm text-white">Active sessions</div>
            <div className="text-xs text-white/50">{rows?.length ?? "…"} signed in</div>
          </div>
          <button
            type="button"
            onClick={revokeOthers}
            disabled={busy === "__others__" || !rows || rows.length <= 1}
            className="text-xs rounded-full bg-white/10 px-4 py-2 hover:bg-white/15 disabled:opacity-40"
          >
            {busy === "__others__" ? "…" : "Sign out everywhere else"}
          </button>
        </div>

        {!rows ? (
          <div className="px-5 py-6 text-white/40 text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-6 text-white/40 text-sm">No sessions found.</div>
        ) : (
          <ul className="divide-y divide-white/5">
            {sorted.map((s) => {
              const isCurrent = s.id === curId;
              return (
                <li key={s.id} className="px-5 py-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-white">{parseUA(s.user_agent)}</span>
                      {isCurrent && (
                        <span className="text-[10px] uppercase tracking-wider bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded">
                          this device
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-white/50 mt-1">
                      IP {s.ip || "—"} · started {relTime(s.created_at)} · expires{" "}
                      {new Date(s.expires_at).toLocaleDateString()}
                    </div>
                    <div className="text-[11px] text-white/30 font-mono mt-1 break-all">
                      session id: {s.id}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => revoke(s.id, isCurrent)}
                    disabled={busy === s.id}
                    className="text-xs text-red-300 hover:text-red-200 px-3 py-2 rounded hover:bg-red-500/10 disabled:opacity-40 shrink-0"
                  >
                    {busy === s.id ? "…" : isCurrent ? "Sign out" : "Revoke"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-white/30 text-xs mt-4">
        Revoking a session signs out every device that shares its token lineage — so if a session
        was rotated (auto-renewed), revoking either form kills the whole chain.
      </p>
    </div>
  );
}

/**
 * Change the wallet spending password (the key that guards in-platform spend +
 * withdrawals). Verify current → set new → confirm with a branded OTP.
 */
function WalletPasswordCard({ walletStatus }: { walletStatus?: string }) {
  const [stage, setStage] = useState<"idle" | "form" | "otp" | "done">("idle");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Only meaningful once a wallet password exists (i.e. past pending_password).
  if (!walletStatus || walletStatus === "pending_password") return null;

  const reset = () => {
    setCur("");
    setNext("");
    setConfirm("");
    setCode("");
    setErr(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (next !== confirm) {
      setErr("New passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await changeWalletPassword(cur, next);
      setStage("otp");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmChange(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await confirmWalletPasswordChange(code.trim());
      reset();
      setStage("done");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#8A68FF]/60";

  return (
    <section className="liquid-glass rounded-3xl p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase mb-1.5">
            Wallet password
          </p>
          <p className="text-white text-base font-medium">
            The password that authorizes spending &amp; withdrawals
          </p>
          <p className="text-white/50 text-sm mt-1 leading-relaxed">
            Required for in-platform payments; withdrawals also need an emailed code.
          </p>
        </div>
        {stage === "idle" && (
          <button
            type="button"
            onClick={() => {
              reset();
              setStage("form");
            }}
            className="shrink-0 rounded-full bg-white text-black text-sm font-medium px-5 py-2.5 hover:bg-white/90 transition-colors"
          >
            Change
          </button>
        )}
      </div>

      {stage === "done" && (
        <p className="text-emerald-300 text-sm mt-4">
          ✓ Wallet password updated.
        </p>
      )}

      {err && <p className="text-rose-300 text-sm mt-4">{err}</p>}

      {stage === "form" && (
        <form onSubmit={submit} className="mt-5 space-y-3 max-w-sm">
          <input
            type="password"
            autoComplete="current-password"
            value={cur}
            onChange={(e) => setCur(e.target.value)}
            placeholder="Current password"
            className={inputCls}
          />
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="New password (min 12, a letter + a number)"
            className={inputCls}
          />
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            className={inputCls}
          />
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={busy || !cur || next.length < 12 || !confirm}
              className="rounded-full bg-white text-black text-sm font-medium px-5 py-2.5 hover:bg-white/90 disabled:opacity-40 transition-colors"
            >
              {busy ? "Sending code…" : "Continue"}
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                setStage("idle");
              }}
              className="text-white/50 hover:text-white text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {stage === "otp" && (
        <form onSubmit={confirmChange} className="mt-5 space-y-3 max-w-sm">
          <p className="text-white/60 text-sm">
            We emailed a 6-digit code to confirm the change.
          </p>
          <input
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit code"
            className={`${inputCls} tracking-[0.3em] font-mono`}
          />
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="rounded-full bg-white text-black text-sm font-medium px-5 py-2.5 hover:bg-white/90 disabled:opacity-40 transition-colors"
            >
              {busy ? "Confirming…" : "Confirm change"}
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                setStage("idle");
              }}
              className="text-white/50 hover:text-white text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/**
 * Freeze / unlock the wallet. Locking is instant (panic switch); unlocking
 * requires the wallet password. A locked wallet blocks all spend + withdrawals
 * (enforced server-side in /auth/wallet-password/verify).
 */
function LockWalletCard() {
  const { user, refreshUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const status = user?.walletStatus;
  if (!user || (status !== "active" && status !== "locked")) return null;
  const locked = status === "locked";

  async function lock() {
    if (
      !window.confirm(
        "Freeze your wallet? All spending and withdrawals stop until you unlock it."
      )
    )
      return;
    setBusy(true);
    setErr(null);
    try {
      await lockWallet();
      await refreshUser();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await unlockWallet(pwd);
      setPwd("");
      await refreshUser();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#8A68FF]/60";

  return (
    <section
      className={`liquid-glass rounded-3xl p-6 md:p-8 ${
        locked ? "ring-1 ring-amber-300/30" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase mb-1.5">
            Wallet lock
          </p>
          <p className="text-white text-base font-medium">
            {locked ? "Your wallet is frozen" : "Freeze your wallet"}
          </p>
          <p className="text-white/50 text-sm mt-1 leading-relaxed">
            {locked
              ? "Spending and withdrawals are blocked. Unlock with your wallet password to resume."
              : "A panic switch — instantly blocks all spending and withdrawals if you suspect your account is at risk."}
          </p>
        </div>
        {!locked && (
          <button
            type="button"
            onClick={lock}
            disabled={busy}
            className="shrink-0 rounded-full bg-rose-500/90 text-white text-sm font-medium px-5 py-2.5 hover:bg-rose-500 disabled:opacity-40 transition-colors"
          >
            {busy ? "Locking…" : "Freeze wallet"}
          </button>
        )}
      </div>

      {err && <p className="text-rose-300 text-sm mt-4">{err}</p>}

      {locked && (
        <form onSubmit={unlock} className="mt-5 flex flex-col sm:flex-row gap-3 max-w-md">
          <input
            type="password"
            autoComplete="current-password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="Wallet password"
            className={inputCls}
          />
          <button
            type="submit"
            disabled={busy || !pwd}
            className="shrink-0 rounded-full bg-white text-black text-sm font-medium px-6 py-3 hover:bg-white/90 disabled:opacity-40 transition-colors"
          >
            {busy ? "Unlocking…" : "Unlock"}
          </button>
        </form>
      )}
    </section>
  );
}

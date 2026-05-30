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
import { DashboardShell } from "@/components/dashboard-shell";
import { useAuth } from "@/components/auth-context";
import { mySessions, type MySessionRow, currentSessionId } from "@/lib/auth-client";

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
  return (
    <DashboardShell>
      <SecurityInner />
    </DashboardShell>
  );
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
    <div className="max-w-3xl">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-light italic tracking-tight mb-2">Security</h1>
        <p className="text-white/60 text-sm">
          Every device where you're signed in. Revoke any session if you don't recognize it.
        </p>
      </header>

      {error && (
        <div className="mb-6 text-sm text-red-300 bg-red-950/40 border border-red-900/40 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
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

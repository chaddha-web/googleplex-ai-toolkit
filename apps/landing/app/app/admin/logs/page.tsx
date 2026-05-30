"use client";

/**
 * Admin → Logs.
 *
 * Read-only view of every session in the system, with the ability to kill
 * any of them. "Active" mode hides revoked + expired rows; "Recent" shows
 * the last 500 rows regardless of state for an audit trail of who has been
 * logging in.
 *
 * Search filter is server-side (matches email / code11 / IP, case-insensitive).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import { sessions, type AdminSessionRow } from "@/lib/auth-client";

type Scope = "active" | "recent";

function relTime(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function parseUA(ua: string | null): string {
  if (!ua) return "unknown";
  if (/iPhone|iPad/i.test(ua)) return "iOS · " + (/Safari/i.test(ua) ? "Safari" : "browser");
  if (/Android/i.test(ua)) return "Android · " + (/Chrome/i.test(ua) ? "Chrome" : "browser");
  if (/Macintosh/i.test(ua)) {
    if (/Chrome/i.test(ua)) return "macOS · Chrome";
    if (/Firefox/i.test(ua)) return "macOS · Firefox";
    return "macOS · Safari";
  }
  if (/Windows/i.test(ua)) {
    if (/Edg/i.test(ua)) return "Windows · Edge";
    if (/Chrome/i.test(ua)) return "Windows · Chrome";
    if (/Firefox/i.test(ua)) return "Windows · Firefox";
    return "Windows";
  }
  if (/Linux/i.test(ua)) return "Linux · " + (/Chrome/i.test(ua) ? "Chrome" : "browser");
  return ua.slice(0, 40);
}

function statusOf(s: AdminSessionRow): { label: string; cls: string } {
  if (s.revoked_at) return { label: "revoked", cls: "bg-red-500/15 text-red-300" };
  if (s.expires_at < Date.now()) return { label: "expired", cls: "bg-white/10 text-white/60" };
  return { label: "active", cls: "bg-emerald-500/15 text-emerald-300" };
}

export default function LogsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [scope, setScope] = useState<Scope>("active");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AdminSessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/app");
  }, [user, router]);

  async function load() {
    setError(null);
    try {
      setRows(await sessions.listAll(scope, q.trim()));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (user?.role === "admin") load();
  }, [user, scope]);

  // Debounce the search box so a typing burst doesn't hammer the API.
  useEffect(() => {
    if (!user || user.role !== "admin") return;
    const t = setTimeout(() => load(), 300);
    return () => clearTimeout(t);
  }, [q]);

  async function revoke(id: string) {
    if (!window.confirm("Revoke this session? The user will be signed out on that device.")) return;
    setBusy(id);
    try {
      await sessions.adminRevoke(id);
      // Optimistically mark revoked locally.
      setRows((cur) =>
        (cur ?? []).map((r) => (r.id === id ? { ...r, revoked_at: Date.now() } : r))
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const stats = useMemo(() => {
    const a = (rows ?? []).filter((r) => !r.revoked_at && r.expires_at > Date.now()).length;
    const r = (rows ?? []).filter((r) => r.revoked_at).length;
    const byUser = new Map<string, number>();
    for (const s of rows ?? []) byUser.set(s.user_id, (byUser.get(s.user_id) ?? 0) + 1);
    return { active: a, revoked: r, users: byUser.size };
  }, [rows]);

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Link href="/app/admin" className="text-white/60 hover:text-white text-sm">
            ← Admin
          </Link>
          <h1 className="text-lg font-medium">Logs · sessions</h1>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <ScopeTab scope={scope} setScope={setScope} value="active" />
          <ScopeTab scope={scope} setScope={setScope} value="recent" />
          <input
            type="search"
            placeholder="Search email · ID · IP"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="ml-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm w-64 focus:outline-none focus:border-white/30"
          />
          <button
            type="button"
            onClick={load}
            className="rounded-full bg-white/10 text-white text-sm font-medium px-4 py-2 hover:bg-white/15"
          >
            Refresh
          </button>
        </div>
      </header>

      <main className="px-6 py-6 max-w-[1400px] mx-auto">
        <div className="flex gap-6 text-sm mb-6">
          <Stat label="Active" value={stats.active} />
          <Stat label="Revoked (in view)" value={stats.revoked} />
          <Stat label="Distinct users" value={stats.users} />
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
                <Th>Status</Th>
                <Th>User</Th>
                <Th>Session ID</Th>
                <Th>Device</Th>
                <Th>IP</Th>
                <Th>Created</Th>
                <Th>Expires</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {!rows ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-white/40">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-white/40">
                    No sessions match.
                  </td>
                </tr>
              ) : (
                rows.map((s) => {
                  const st = statusOf(s);
                  return (
                    <tr key={s.id} className="hover:bg-white/[0.02]">
                      <Td>
                        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${st.cls}`}>
                          {st.label}
                        </span>
                      </Td>
                      <Td>
                        <div className="text-white">
                          {s.first_name} {s.last_name}{" "}
                          {s.role === "admin" && (
                            <span className="ml-1 text-[10px] uppercase tracking-wider text-amber-300">admin</span>
                          )}
                        </div>
                        <div className="text-white/50 text-xs">{s.email}</div>
                        <div className="text-white/30 text-[11px] font-mono">{s.code11}</div>
                      </Td>
                      <Td>
                        <code className="text-white/70 text-xs font-mono break-all">{s.id}</code>
                        <div className="text-white/30 text-[11px] font-mono mt-0.5" title="family id">
                          fam {s.family_id.slice(0, 8)}…
                        </div>
                      </Td>
                      <Td className="text-white/80">{parseUA(s.user_agent)}</Td>
                      <Td className="text-white/60 font-mono text-xs">{s.ip || "—"}</Td>
                      <Td className="text-white/60 text-xs whitespace-nowrap">
                        {relTime(s.created_at)}
                      </Td>
                      <Td className="text-white/60 text-xs whitespace-nowrap">
                        {new Date(s.expires_at).toLocaleDateString()}
                      </Td>
                      <Td className="text-right">
                        {!s.revoked_at && s.expires_at > Date.now() && (
                          <button
                            type="button"
                            onClick={() => revoke(s.id)}
                            disabled={busy === s.id}
                            className="text-red-300 hover:text-red-200 text-xs font-medium px-2 py-1 rounded hover:bg-red-500/10 disabled:opacity-50"
                          >
                            {busy === s.id ? "…" : "Revoke"}
                          </button>
                        )}
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="text-white/30 text-xs mt-4">
          Showing up to 500 most-recent sessions. Revoking kills the whole token family
          (including any rotated descendants), so a single click signs the user out fully.
        </p>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-white/40 text-xs uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-light">{value.toLocaleString()}</div>
    </div>
  );
}

function ScopeTab({ scope, setScope, value }: { scope: Scope; setScope: (s: Scope) => void; value: Scope }) {
  const active = scope === value;
  return (
    <button
      type="button"
      onClick={() => setScope(value)}
      className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
        active
          ? "bg-white text-black"
          : "border border-white/15 text-white/70 hover:border-white/30"
      }`}
    >
      {value === "active" ? "Active only" : "Recent (all)"}
    </button>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="text-left font-medium px-4 py-3">{children}</th>;
}
function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}

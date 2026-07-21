"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import { useAdminAccess } from "@/components/admin/access";
import { sessions, type AdminSessionRow, type OnlineMember } from "@/lib/auth-client";
// (breadcrumb + chrome now come from the admin shell layout)

function ago(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmt(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/** Coarse device label from a user-agent string. */
function device(ua: string | null): string {
  if (!ua) return "Unknown device";
  const os =
    /Windows/.test(ua) ? "Windows" :
    /iPhone|iOS/.test(ua) ? "iPhone" :
    /iPad/.test(ua) ? "iPad" :
    /Android/.test(ua) ? "Android" :
    /Mac OS X|Macintosh/.test(ua) ? "Mac" :
    /Linux/.test(ua) ? "Linux" : "Device";
  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${browser} · ${os}`;
}

export default function AdminSessionsPage() {
  const { user } = useAuth();
  const access = useAdminAccess();
  const router = useRouter();
  const [online, setOnline] = useState<OnlineMember[] | null>(null);
  const [rows, setRows] = useState<AdminSessionRow[] | null>(null);
  const [scope, setScope] = useState<"active" | "recent">("active");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const qRef = useRef(q);
  qRef.current = q;

  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/app");
  }, [user, router]);

  const loadSessions = useCallback(async () => {
    setError(null);
    try {
      setRows(await sessions.listAll(scope, qRef.current));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [scope]);

  const loadOnline = useCallback(async () => {
    try {
      const r = await sessions.online();
      setOnline(r.members);
    } catch {
      /* keep last */
    }
  }, []);

  // Sessions reload on scope/search.
  useEffect(() => {
    if (user?.role === "admin") loadSessions();
  }, [user, scope, loadSessions]);

  // Live online board — poll every 10s.
  useEffect(() => {
    if (user?.role !== "admin") return;
    loadOnline();
    const id = window.setInterval(loadOnline, 10_000);
    return () => window.clearInterval(id);
  }, [user, loadOnline]);

  async function revoke(id: string) {
    if (!confirm("Revoke this session? The member is signed out on that device.")) return;
    setRevoking(id);
    try {
      await sessions.adminRevoke(id);
      setRows((rs) => (rs ? rs.map((r) => (r.id === id ? { ...r, revoked_at: Date.now() } : r)) : rs));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRevoking(null);
    }
  }

  if (!user || user.role !== "admin") return null;

  return (
    <section className="max-w-6xl mx-auto">
        <p className="text-white/40 text-xs tracking-[0.3em] uppercase">Live sessions</p>
        <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-2">
          Who&apos;s <em className="font-serif-i text-white/60">on</em> right now.
        </h1>

        {/* Online now board */}
        <div className="mt-8 flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
          </span>
          <p className="text-white/80 text-sm">
            {online === null ? "…" : online.length} member{online && online.length === 1 ? "" : "s"} using the platform now
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {online === null ? (
            <p className="text-white/40 text-sm">Loading…</p>
          ) : online.length === 0 ? (
            <p className="text-white/40 text-sm">No members active in the last minute.</p>
          ) : (
            online.map((m) => (
              <div key={m.userId} className="liquid-glass rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-white/90 text-sm font-medium truncate">
                    {m.firstName} {m.lastName}
                  </p>
                  <span className="text-emerald-300 text-[10px] tracking-widest uppercase">{ago(m.lastSeen)}</span>
                </div>
                <p className="text-white/40 text-xs truncate">{m.email}</p>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-white/60 font-mono">{m.section || "—"}</span>
                  <span className="text-white/40">
                    {[m.region, m.country].filter(Boolean).join(", ") || "—"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* All sessions */}
        <div className="mt-14 flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-serif text-3xl tracking-tight">
            All <em className="font-serif-i text-white/60">sessions</em>
          </h2>
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-full bg-white/5 border border-white/10 p-0.5">
              {(["active", "recent"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                    scope === s ? "bg-white text-black" : "text-white/60 hover:text-white"
                  }`}
                >
                  {s === "active" ? "Active" : "Recent"}
                </button>
              ))}
            </div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadSessions()}
              placeholder="Search email, ID, IP…"
              className="w-56 max-w-[60vw] rounded-full bg-white/5 border border-white/10 py-2 px-4 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25"
            />
          </div>
        </div>

        {error && <p className="mt-4 text-rose-300/90 text-sm">{error}</p>}

        <div className="mt-6 liquid-glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] tracking-[0.2em] uppercase text-white/40 border-b border-white/10">
                  <th className="px-4 py-3 font-medium">Member</th>
                  <th className="px-4 py-3 font-medium">Device</th>
                  <th className="px-4 py-3 font-medium">IP</th>
                  <th className="px-4 py-3 font-medium">Now</th>
                  <th className="px-4 py-3 font-medium">Last active</th>
                  <th className="px-4 py-3 font-medium">Signed in</th>
                  <th className="px-4 py-3 font-medium">Expires</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows === null ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-white/40">Loading sessions…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-white/40">No sessions.</td></tr>
                ) : (
                  rows.map((r) => {
                    const revoked = r.revoked_at != null;
                    return (
                      <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="px-4 py-3">
                          <p className="text-white/90">{r.first_name} {r.last_name}</p>
                          <p className="text-white/40 text-xs">{r.email}</p>
                        </td>
                        <td className="px-4 py-3 text-white/70">{device(r.user_agent)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-white/60">{r.ip ?? "—"}</td>
                        <td className="px-4 py-3">
                          {r.online ? (
                            <span className="inline-flex items-center gap-1.5 text-emerald-300 text-xs">
                              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Online
                            </span>
                          ) : (
                            <span className="text-white/30 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-white/60 text-xs">
                          {r.last_used_at ? ago(r.last_used_at) : "—"}
                        </td>
                        <td className="px-4 py-3 text-white/50 text-xs">{fmt(r.created_at)}</td>
                        <td className="px-4 py-3 text-white/50 text-xs">{fmt(r.expires_at)}</td>
                        <td className="px-4 py-3 text-right">
                          {revoked ? (
                            <span className="text-white/30 text-xs">Revoked</span>
                          ) : r.isFounder && !access.isFounder ? (
                            // Hierarchy: a sub-admin can't revoke the founder's session.
                            <span className="text-white/25 text-xs" title="The founder is above your role.">Protected</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => revoke(r.id)}
                              disabled={revoking === r.id}
                              className="text-[11px] text-rose-300/80 hover:text-rose-200 underline decoration-dotted disabled:opacity-40"
                            >
                              {revoking === r.id ? "…" : "Revoke"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-3 text-white/30 text-xs">
          &ldquo;Active&rdquo; = a live (unexpired, unrevoked) session. &ldquo;Online&rdquo; = a heartbeat in the last minute.
          Last-active updates each time the member&apos;s app refreshes its token (~15 min) or sends a heartbeat.
        </p>
    </section>
  );
}

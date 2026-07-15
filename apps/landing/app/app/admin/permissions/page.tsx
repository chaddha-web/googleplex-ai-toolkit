"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import {
  listAdmins,
  setAdminPermissions,
  demoteAdmin,
  promoteAdmin,
  getAdminSettings,
  ADMIN_CAPABILITIES,
  type AdminAccount,
  type Capability
} from "@/lib/auth-client";

export default function AdminPermissionsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [allowed, setAllowed] = useState<"checking" | "yes" | "no">("checking");
  const [admins, setAdmins] = useState<AdminAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null); // "userId:cap"
  const [promoteId, setPromoteId] = useState("");
  const [promoteBusy, setPromoteBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/app");
  }, [user, router]);

  async function load() {
    setError(null);
    try {
      const list = await listAdmins();
      setAdmins(list);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    if (user?.role !== "admin") return;
    getAdminSettings()
      .then((s) => {
        setAllowed(s.isFounder ? "yes" : "no");
        if (s.isFounder) load();
      })
      .catch(() => setAllowed("no"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function toggle(a: AdminAccount, cap: Capability) {
    if (a.isFounder) return;
    const has = a.permissions.includes(cap);
    const next = has ? a.permissions.filter((c) => c !== cap) : [...a.permissions, cap];
    setSaving(`${a.id}:${cap}`);
    setError(null);
    // Optimistic.
    setAdmins((list) => (list ? list.map((x) => (x.id === a.id ? { ...x, permissions: next } : x)) : list));
    try {
      await setAdminPermissions(a.id, next);
    } catch (e) {
      setError((e as Error).message);
      // Revert.
      setAdmins((list) => (list ? list.map((x) => (x.id === a.id ? { ...x, permissions: a.permissions } : x)) : list));
    } finally {
      setSaving(null);
    }
  }

  async function demote(a: AdminAccount) {
    if (!confirm(`Remove admin access from ${a.email}? They become a regular member.`)) return;
    setError(null);
    try {
      await demoteAdmin(a.id);
      setAdmins((list) => (list ? list.filter((x) => x.id !== a.id) : list));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function promote() {
    const code = promoteId.trim();
    if (!code) return;
    setPromoteBusy(true);
    setError(null);
    setNotice(null);
    try {
      const msg = await promoteAdmin(code);
      setNotice(msg || "Promoted.");
      setPromoteId("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPromoteBusy(false);
    }
  }

  if (!user || user.role !== "admin") return null;

  return (
    <main className="min-h-screen bg-black text-white font-sans">
      <nav className="relative z-20 w-full px-6 py-6 border-b border-white/5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/app/admin" className="flex items-center gap-2 text-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="GoogolPlex" className="h-7 w-auto object-contain" />
            <span className="font-semibold text-lg tracking-tight">GoogolPlex</span>
          </Link>
          <div className="text-white/40 text-xs tracking-[0.3em] uppercase">Admin access</div>
        </div>
      </nav>

      <section className="max-w-5xl mx-auto px-6 py-14">
        <Link href="/app/admin" className="text-white/40 hover:text-white text-xs">← Back to admin</Link>
        <p className="mt-6 text-white/40 text-xs tracking-[0.3em] uppercase">Permission manager</p>
        <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-2">
          Admin <em className="font-serif-i text-white/60">access</em>.
        </h1>
        <p className="text-white/50 text-sm mt-3 max-w-2xl leading-relaxed">
          Grant each sub-admin only the powers they need. The main admin always holds every
          permission. Changes take effect on the sub-admin&apos;s next token refresh (within ~15 min).
        </p>

        {allowed === "checking" ? (
          <p className="mt-10 text-white/40 text-sm">Checking access…</p>
        ) : allowed === "no" ? (
          <div className="mt-10 liquid-glass rounded-2xl p-6">
            <p className="text-rose-300/90 text-sm">
              Only the main admin can manage admin permissions.
            </p>
          </div>
        ) : (
          <>
            {/* Promote */}
            <div className="mt-8 liquid-glass rounded-2xl p-5">
              <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase mb-3">Add a sub-admin</p>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  value={promoteId}
                  onChange={(e) => setPromoteId(e.target.value)}
                  placeholder="Member ID (e.g. CQGNRNJG0M6)"
                  className="flex-1 min-w-[220px] rounded-full bg-white/5 border border-white/10 py-2 px-4 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 font-mono"
                />
                <button
                  type="button"
                  onClick={promote}
                  disabled={promoteBusy || !promoteId.trim()}
                  className="rounded-full bg-white text-black text-sm font-medium px-5 py-2 hover:bg-white/90 disabled:opacity-40"
                >
                  {promoteBusy ? "Promoting…" : "Promote to admin"}
                </button>
              </div>
              <p className="text-white/35 text-xs mt-2">
                New admins start with <span className="text-white/60">no</span> capabilities — grant them below.
              </p>
              {notice && <p className="text-emerald-300 text-sm mt-2">{notice}</p>}
            </div>

            {error && <p className="mt-4 text-rose-300/90 text-sm">{error}</p>}

            {/* Matrix */}
            <div className="mt-6 liquid-glass rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] tracking-[0.2em] uppercase text-white/40 border-b border-white/10">
                      <th className="px-4 py-3 font-medium">Admin</th>
                      {ADMIN_CAPABILITIES.map((c) => (
                        <th key={c.key} className="px-3 py-3 font-medium text-center" title={c.desc}>
                          {c.label}
                        </th>
                      ))}
                      <th className="px-4 py-3 font-medium text-right">Access</th>
                    </tr>
                  </thead>
                  <tbody>
                    {admins === null ? (
                      <tr>
                        <td colSpan={ADMIN_CAPABILITIES.length + 2} className="px-4 py-12 text-center text-white/40">
                          Loading admins…
                        </td>
                      </tr>
                    ) : (
                      admins.map((a) => (
                        <tr key={a.id} className="border-b border-white/5">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div>
                                <p className="text-white/90">
                                  {a.firstName} {a.lastName}
                                  {a.isFounder && (
                                    <span className="ml-2 text-[9px] tracking-[0.15em] uppercase px-2 py-0.5 rounded-full bg-amber-300/20 text-amber-200 ring-1 ring-amber-300/30">
                                      Main
                                    </span>
                                  )}
                                </p>
                                <p className="text-white/40 text-xs">{a.email}</p>
                              </div>
                            </div>
                          </td>
                          {ADMIN_CAPABILITIES.map((c) => {
                            const on = a.permissions.includes(c.key);
                            const busy = saving === `${a.id}:${c.key}`;
                            return (
                              <td key={c.key} className="px-3 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => toggle(a, c.key)}
                                  disabled={a.isFounder || busy}
                                  aria-pressed={on}
                                  title={a.isFounder ? "Main admin always has every permission" : c.desc}
                                  className={`h-6 w-11 rounded-full relative transition-colors disabled:cursor-not-allowed ${
                                    on ? "bg-emerald-400" : "bg-white/15"
                                  } ${a.isFounder ? "opacity-60" : ""}`}
                                >
                                  <span
                                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                                      on ? "left-[22px]" : "left-0.5"
                                    }`}
                                  />
                                </button>
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-right">
                            {a.isFounder ? (
                              <span className="text-white/25 text-xs">—</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => demote(a)}
                                className="text-[11px] text-rose-300/80 hover:text-rose-200 underline decoration-dotted"
                              >
                                Remove admin
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Legend */}
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ADMIN_CAPABILITIES.map((c) => (
                <p key={c.key} className="text-white/40 text-xs">
                  <span className="text-white/70">{c.label}</span> — {c.desc}
                </p>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

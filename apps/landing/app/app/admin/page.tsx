"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import {
  listAllUsers,
  adminWalletBalances,
  adminUserOnchain,
  type AdminUserRow
} from "@/lib/auth-client";

function tierOf(u: AdminUserRow & { tokensMinted?: number }): {
  label: string;
  cls: string;
} {
  if ((u.tokensMinted ?? 0) > 0) return { label: "Built", cls: "bg-emerald-400 text-black" };
  if (u.walletStatus === "active") return { label: "Activated", cls: "bg-white text-black" };
  return { label: "New", cls: "bg-white/10 text-white/70" };
}

const usd = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AdminHome() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // userId → usable (ledger) USD; userId → actual (on-chain) USD on demand.
  const [usable, setUsable] = useState<Record<string, number>>({});
  const [actual, setActual] = useState<Record<string, number | "loading">>({});

  // Role guard — non-admins get bounced to the user dashboard.
  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/app");
  }, [user, router]);

  const lastLoadRef = useRef(0);
  async function load() {
    // Throttle manual refreshes to once per 3s.
    const now = Date.now();
    if (refreshing || now - lastLoadRef.current < 3000) return;
    lastLoadRef.current = now;
    setRefreshing(true);
    setError(null);
    try {
      const r = await listAllUsers();
      setUsers(r.users);
      setTotal(r.total);
      // Usable (ledger) balances are cheap — fetch in bulk.
      adminWalletBalances().then(setUsable).catch(() => {});
    } catch (e) {
      setError((e as Error).message || "Could not load users.");
    } finally {
      setRefreshing(false);
    }
  }

  async function loadActual(id: string) {
    setActual((m) => ({ ...m, [id]: "loading" }));
    try {
      const v = await adminUserOnchain(id);
      setActual((m) => ({ ...m, [id]: v }));
    } catch {
      setActual((m) => {
        const n = { ...m };
        delete n[id];
        return n;
      });
    }
  }

  useEffect(() => {
    if (user?.role === "admin") load();
  }, [user]);

  if (!user || user.role !== "admin") return null;

  return (
    <main className="min-h-screen bg-black text-white font-sans">
      <nav className="relative z-20 w-full px-6 py-6 border-b border-white/5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="GoogolPlex" className="h-7 w-auto object-contain" />
            <span className="font-semibold text-lg tracking-tight">GoogolPlex</span>
          </Link>
          <div className="text-white/40 text-xs tracking-[0.3em] uppercase">
            Admin
          </div>
        </div>
      </nav>

      <section className="max-w-6xl mx-auto px-6 py-14">
        <p className="text-white/40 text-xs tracking-[0.3em] uppercase">
          Admin panel
        </p>
        <h1 className="font-serif text-5xl md:text-6xl tracking-tight mt-2">
          Control <em className="font-serif-i text-white/60">center</em>.
        </h1>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Stat label="Total users" value={total === null ? "—" : String(total)} />
          <Stat
            label="Profile complete"
            value={
              users === null
                ? "—"
                : String(users.filter((u) => u.profileCompleted).length)
            }
          />
          <Stat
            label="Wallet active"
            value={
              users === null
                ? "—"
                : String(users.filter((u) => u.walletStatus === "active").length)
            }
          />
        </div>

        <div className="mt-12 flex items-center justify-between gap-4">
          <h2 className="font-serif text-3xl tracking-tight">
            Registered <em className="font-serif-i text-white/60">users</em>
          </h2>
          <button
            type="button"
            onClick={load}
            disabled={refreshing}
            className="text-white/50 hover:text-white text-xs transition-colors disabled:opacity-30"
          >
            {refreshing ? "Loading…" : "↻ Refresh"}
          </button>
        </div>

        {error ? (
          <p className="mt-4 text-rose-300/90 text-sm">{error}</p>
        ) : null}

        <div className="mt-6 liquid-glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] tracking-[0.2em] uppercase text-white/40 border-b border-white/10">
                  <Th>Member ID</Th>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Tier</Th>
                  <Th>Usable</Th>
                  <Th>Actual</Th>
                  <Th>Country</Th>
                  <Th>Age</Th>
                  <Th>Tokens</Th>
                  <Th>Profile</Th>
                  <Th>Wallet</Th>
                  <Th>Joined</Th>
                </tr>
              </thead>
              <tbody>
                {users === null ? (
                  <tr>
                    <td colSpan={13} className="px-4 py-12 text-center text-white/40">
                      Loading users…
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-4 py-12 text-center text-white/40">
                      No users registered yet.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                    >
                      <Td mono>{u.code11}</Td>
                      <Td>
                        {u.firstName} {u.lastName}
                      </Td>
                      <Td>{u.email}</Td>
                      <Td>
                        <span
                          className={`text-[10px] tracking-[0.15em] uppercase px-2 py-1 rounded-full ${
                            u.role === "admin"
                              ? "bg-white text-black"
                              : "bg-white/10 text-white/70"
                          }`}
                        >
                          {u.role}
                        </span>
                      </Td>
                      <Td>
                        {(() => {
                          const t = tierOf(u);
                          return (
                            <span className={`text-[10px] tracking-[0.15em] uppercase px-2 py-1 rounded-full ${t.cls}`}>
                              {t.label}
                            </span>
                          );
                        })()}
                      </Td>
                      <Td>
                        <span className="font-mono text-xs text-white/80">
                          {usable[u.id] != null ? usd(usable[u.id]!) : "—"}
                        </span>
                      </Td>
                      <Td>
                        {actual[u.id] === "loading" ? (
                          <span className="text-white/40 text-xs">…</span>
                        ) : typeof actual[u.id] === "number" ? (
                          <span className="font-mono text-xs text-white/80">
                            {usd(actual[u.id] as number)}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => loadActual(u.id)}
                            className="text-[10px] text-white/50 hover:text-white underline decoration-dotted"
                          >
                            check
                          </button>
                        )}
                      </Td>
                      <Td>{u.country ?? "—"}</Td>
                      <Td>{u.age ?? "—"}</Td>
                      <Td>
                        <span className="font-mono text-xs text-white/70">
                          {u.tokensMinted != null ? u.tokensMinted.toLocaleString() : "—"}
                        </span>
                      </Td>
                      <Td>
                        <Dot ok={u.profileCompleted} />
                      </Td>
                      <Td>
                        <span className="text-white/60 text-xs">
                          {labelForWalletStatus(u.walletStatus)}
                        </span>
                      </Td>
                      <Td>{formatDate(u.createdAt)}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-10 flex gap-3 flex-wrap">
          <Link
            href="/app/admin/campaigns"
            className="liquid-glass rounded-full px-6 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors"
          >
            Email campaigns
          </Link>
          <Link
            href="/app/admin/inbox"
            className="liquid-glass rounded-full px-6 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors"
          >
            Inbox
          </Link>
          <Link
            href="/app/admin/settings"
            className="liquid-glass rounded-full px-6 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors"
          >
            Settings
          </Link>
          <Link
            href="/app"
            className="liquid-glass rounded-full px-6 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors"
          >
            ← User dashboard
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="text-white/40 hover:text-white text-sm transition-colors px-2 py-3"
          >
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="liquid-glass rounded-2xl p-6">
      <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase mb-2">
        {label}
      </p>
      <p className="text-white text-3xl font-medium tracking-tight">{value}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium">{children}</th>;
}

function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td className={`px-4 py-3 ${mono ? "font-mono text-xs text-white/80" : "text-white/80"}`}>
      {children}
    </td>
  );
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      title={ok ? "Complete" : "Pending"}
      className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-emerald-400" : "bg-white/20"}`}
      aria-label={ok ? "Complete" : "Pending"}
    />
  );
}

function labelForWalletStatus(s: string): string {
  switch (s) {
    case "active":
      return "Active";
    case "pending_password":
      return "No password";
    case "pending_initial_deposit":
      return "Awaiting $1";
    case "locked":
      return "Locked";
    default:
      return s;
  }
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

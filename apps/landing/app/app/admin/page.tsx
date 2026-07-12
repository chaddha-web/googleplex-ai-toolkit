"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import {
  listAllUsers,
  unsuspendUser,
  adminWalletBalances,
  adminUserOnchain,
  adminUserConsents,
  sweepPreview,
  sweepExecute,
  type AdminUserRow,
  type ConsentRecord,
  type SweepPlan,
  type SweepLeg
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
  // Consent audit modal.
  const [consentFor, setConsentFor] = useState<AdminUserRow | null>(null);
  const [consents, setConsents] = useState<ConsentRecord[] | "loading" | null>(null);

  function openConsents(u: AdminUserRow) {
    setConsentFor(u);
    setConsents("loading");
    adminUserConsents(u.id)
      .then(setConsents)
      .catch(() => setConsents([]));
  }

  // Flush-to-treasury modal.
  const [flushFor, setFlushFor] = useState<AdminUserRow | null>(null);

  function openFlush(u: AdminUserRow) {
    setFlushFor(u);
  }

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
                  <Th>Avatar</Th>
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
                  <Th>Consent</Th>
                  <Th>Flush</Th>
                </tr>
              </thead>
              <tbody>
                {users === null ? (
                  <tr>
                    <td colSpan={16} className="px-4 py-12 text-center text-white/40">
                      Loading users…
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={16} className="px-4 py-12 text-center text-white/40">
                      No users registered yet.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                    >
                      <Td>
                        <Avatar url={u.avatarUrl} name={u.firstName} id={u.id} />
                      </Td>
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
                        {u.suspendedAt ? (
                          <button
                            type="button"
                            title="Suspended — click to lift"
                            onClick={async () => {
                              if (!confirm(`Unsuspend ${u.email}? They will be able to sign in again.`)) return;
                              try {
                                await unsuspendUser(u.id);
                                setUsers((us) =>
                                  us ? us.map((x) => (x.id === u.id ? { ...x, suspendedAt: null } : x)) : us
                                );
                              } catch (e) {
                                alert((e as Error).message);
                              }
                            }}
                            className="text-[10px] tracking-[0.15em] uppercase px-2 py-1 rounded-full bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/40 hover:bg-rose-500/30 outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70"
                          >
                            Suspended
                          </button>
                        ) : (
                          (() => {
                            const t = tierOf(u);
                            return (
                              <span className={`text-[10px] tracking-[0.15em] uppercase px-2 py-1 rounded-full ${t.cls}`}>
                                {t.label}
                              </span>
                            );
                          })()
                        )}
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
                      <Td>
                        <button
                          type="button"
                          onClick={() => openConsents(u)}
                          className="text-[10px] text-white/50 hover:text-white underline decoration-dotted"
                        >
                          view
                        </button>
                      </Td>
                      <Td>
                        <button
                          type="button"
                          onClick={() => openFlush(u)}
                          className="text-[10px] text-amber-300/80 hover:text-amber-200 underline decoration-dotted"
                        >
                          flush
                        </button>
                      </Td>
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
            href="/app/admin/circle"
            className="liquid-glass rounded-full px-6 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors"
          >
            Circle
          </Link>
          <Link
            href="/app/admin/globe"
            className="liquid-glass rounded-full px-6 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors"
          >
            Live globe
          </Link>
          <Link
            href="/app/admin/withdrawals"
            className="liquid-glass rounded-full px-6 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors"
          >
            Withdrawal review
          </Link>
          <Link
            href="/app/admin/logs"
            className="liquid-glass rounded-full px-6 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors"
          >
            Logs
          </Link>
          <Link
            href="/app/admin/reclaims"
            className="liquid-glass rounded-full px-6 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors"
          >
            Token reclaims
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

      {consentFor && (
        <ConsentModal
          user={consentFor}
          records={consents}
          onClose={() => {
            setConsentFor(null);
            setConsents(null);
          }}
        />
      )}

      {flushFor && (
        <FlushModal user={flushFor} onClose={() => setFlushFor(null)} />
      )}
    </main>
  );
}

function FlushModal({ user, onClose }: { user: AdminUserRow; onClose: () => void }) {
  const [plan, setPlan] = useState<SweepPlan | "loading" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SweepLeg[] | null>(null);

  useEffect(() => {
    setPlan("loading");
    sweepPreview(user.id)
      .then(setPlan)
      .catch((e) => {
        setErr((e as Error).message);
        setPlan(null);
      });
  }, [user.id]);

  async function broadcast() {
    if (!confirm("Broadcast this flush? This moves real on-chain funds to the treasury.")) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await sweepExecute(user.id);
      setResult(r.legs);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const legLabel: Record<string, string> = {
    gas_fund: "Fund gas",
    token_sweep: "Sweep token",
    native_sweep: "Sweep native"
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div className="w-full max-w-lg liquid-glass rounded-2xl max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase">Flush to treasury</p>
            <h3 className="text-lg font-medium mt-1">{user.firstName} {user.lastName}</h3>
            <p className="text-white/50 text-xs">{user.email}</p>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white text-sm">Close</button>
        </div>

        <p className="text-white/45 text-xs mt-3 leading-relaxed">
          Consolidates the user&apos;s on-chain deposits into the treasury, auto-funding the gas.
          The member&apos;s ledger balance and history are <span className="text-white/70">not</span> changed.
        </p>

        {err && <p className="text-rose-300 text-sm mt-4">{err}</p>}

        {result ? (
          <div className="mt-5 space-y-2">
            <p className="text-emerald-300 text-sm">Broadcast complete.</p>
            {result.map((l, i) => (
              <div key={i} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-white/80">{legLabel[l.kind]} · {l.amount} {l.symbol} ({l.chain})</span>
                  <span className={l.status === "failed" ? "text-rose-300" : "text-emerald-300"}>{l.status}</span>
                </div>
                {l.txHash && <p className="text-white/40 font-mono mt-1 break-all">{l.txHash}</p>}
                {l.error && <p className="text-rose-300/80 mt-1">{l.error}</p>}
              </div>
            ))}
          </div>
        ) : plan === "loading" || plan === null ? (
          !err && <p className="text-white/40 text-sm mt-6">Computing plan…</p>
        ) : (
          <div className="mt-5">
            {plan.legs.length === 0 ? (
              <p className="text-white/50 text-sm">Nothing to flush — no sweepable EVM balances.</p>
            ) : (
              <div className="space-y-2">
                {plan.legs.map((l, i) => (
                  <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 flex justify-between text-xs">
                    <span className="text-white/80">{legLabel[l.kind]}</span>
                    <span className="text-white/60 font-mono">{l.amount} {l.symbol} · {l.chain}</span>
                  </div>
                ))}
              </div>
            )}
            {plan.skipped.length > 0 && (
              <div className="mt-3 text-[11px] text-white/40 space-y-0.5">
                {plan.skipped.map((s, i) => (
                  <p key={i}>skipped {s.symbol} ({s.chain}) — {s.reason}</p>
                ))}
              </div>
            )}
            <p className="text-white/30 text-[11px] mt-3">
              Executable now: {plan.supported.join(", ")} · pending: {plan.pending.join(", ")}
            </p>
            {plan.legs.length > 0 && (
              <button
                type="button"
                onClick={broadcast}
                disabled={busy}
                className="mt-5 w-full rounded-full bg-amber-400 text-black text-sm font-medium py-2.5 hover:bg-amber-300 disabled:opacity-40"
              >
                {busy ? "Broadcasting…" : "Broadcast flush"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ConsentModal({
  user,
  records,
  onClose
}: {
  user: AdminUserRow;
  records: ConsentRecord[] | "loading" | null;
  onClose: () => void;
}) {
  const KIND_LABEL: Record<string, string> = {
    consultation: "Consultation fee (US$200,000)",
    terms: "Terms & Conditions",
    privacy: "Privacy Policy"
  };
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="liquid-glass rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase">
              Consent audit
            </p>
            <h3 className="text-lg font-medium mt-1">
              {user.firstName} {user.lastName}
            </h3>
            <p className="text-white/50 text-xs">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/50 hover:text-white text-sm"
          >
            Close
          </button>
        </div>

        {records === "loading" || records === null ? (
          <p className="text-white/40 text-sm mt-6">Loading…</p>
        ) : records.length === 0 ? (
          <p className="text-white/40 text-sm mt-6">
            No consent records — this member signed up before the audit trail was added.
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {records.map((r) => (
              <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white text-sm font-medium">
                    {KIND_LABEL[r.kind] ?? r.kind}
                  </span>
                  <span className="text-white/50 text-xs font-mono">
                    {new Date(r.consentedAt).toLocaleString()}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-[64px_1fr] gap-x-3 gap-y-1 text-xs">
                  <span className="text-white/40">IP</span>
                  <span className="text-white/70 font-mono">{r.ip ?? "—"}</span>
                  <span className="text-white/40">Device</span>
                  <span className="text-white/70 break-words">{r.userAgent ?? "—"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Avatar({ url, name, id }: { url: string | null; name: string; id: string }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  // The internal user id rides along as a tooltip / copyable title.
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name}
      title={id}
      className="h-8 w-8 rounded-full object-cover ring-1 ring-white/15"
    />
  ) : (
    <div
      title={id}
      className="h-8 w-8 rounded-full grid place-items-center text-xs font-semibold ring-1 ring-white/10"
      style={{ background: "linear-gradient(160deg,#8A68FF,#5A3CC8)", color: "#fff" }}
    >
      {initial}
    </div>
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

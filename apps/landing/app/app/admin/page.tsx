"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import {
  listAllUsers,
  suspendUser,
  unsuspendUser,
  getAdminSettings,
  sessions,
  adminWalletBalances,
  adminUserOnchain,
  adminUserConsents,
  adminUserDetail,
  sweepPreview,
  sweepExecute,
  type AdminUserRow,
  type ConsentRecord,
  type MemberWalletDetail,
  type Capability,
  type AdminSessionRow,
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
  const [query, setQuery] = useState("");
  // Founder flag + my granular capabilities (gates suspend + the access page).
  const [isFounder, setIsFounder] = useState(false);
  const [myPerms, setMyPerms] = useState<Capability[]>([]);
  const [onlineNow, setOnlineNow] = useState<number | null>(null);
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

  // Member detail modal (opened from the Member ID).
  const [memberFor, setMemberFor] = useState<AdminUserRow | null>(null);

  function openMember(u: AdminUserRow) {
    setMemberFor(u);
  }

  // Role guard — non-admins get bounced to the user dashboard.
  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/app");
  }, [user, router]);

  // Prefill the search from ?q= — powers the ⌘K "jump to member".
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setQuery(q);
  }, []);

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
    if (user?.role === "admin") {
      load();
      getAdminSettings()
        .then((s) => {
          setIsFounder(s.isFounder);
          setMyPerms(s.perms);
        })
        .catch(() => {
          setIsFounder(false);
          setMyPerms([]);
        });
    }
  }, [user]);

  function markSuspended(id: string, suspendedAt: number | null) {
    setUsers((us) => (us ? us.map((x) => (x.id === id ? { ...x, suspendedAt } : x)) : us));
  }

  // Live "online now" count — polled while the panel is open.
  useEffect(() => {
    if (user?.role !== "admin") return;
    let stop = false;
    const tick = () =>
      sessions.online().then((r) => !stop && setOnlineNow(r.count)).catch(() => {});
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [user]);

  if (!user || user.role !== "admin") return null;

  const q = query.trim().toLowerCase();
  const shown = !q
    ? users ?? []
    : (users ?? []).filter((u) =>
        [u.code11, u.email, u.firstName, u.lastName, `${u.firstName} ${u.lastName}`, u.country, u.id]
          .some((f) => (f ?? "").toLowerCase().includes(q))
      );

  return (
    <>
      <section className="max-w-6xl mx-auto">
        <p className="text-white/40 text-xs tracking-[0.3em] uppercase">
          Admin panel
        </p>
        <h1 className="font-serif text-5xl md:text-6xl tracking-tight mt-2">
          Control <em className="font-serif-i text-white/60">center</em>.
        </h1>

        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
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
          <Link href="/sessions" className="block">
            <Stat label="Online now" value={onlineNow === null ? "—" : String(onlineNow)} live />
          </Link>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-serif text-3xl tracking-tight">
            Registered <em className="font-serif-i text-white/60">users</em>
          </h2>
          <div className="flex items-center gap-3">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email, ID, country…"
                className="w-64 max-w-[70vw] rounded-full bg-white/5 border border-white/10 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 focus-visible:ring-2 focus-visible:ring-[#8A68FF]/60"
              />
            </div>
            <button
              type="button"
              onClick={load}
              disabled={refreshing}
              className="text-white/50 hover:text-white text-xs transition-colors disabled:opacity-30"
            >
              {refreshing ? "Loading…" : "↻ Refresh"}
            </button>
          </div>
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
                ) : shown.length === 0 ? (
                  <tr>
                    <td colSpan={16} className="px-4 py-12 text-center text-white/40">
                      No members match “{query}”.
                    </td>
                  </tr>
                ) : (
                  shown.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                    >
                      <Td>
                        <Avatar url={u.avatarUrl} name={u.firstName} id={u.id} />
                      </Td>
                      <Td mono>
                        <button
                          type="button"
                          onClick={() => openMember(u)}
                          title="View full member details"
                          className="text-white/80 hover:text-white underline decoration-dotted decoration-white/30 underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-[#8A68FF]/70 rounded"
                        >
                          {u.code11}
                        </button>
                      </Td>
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
                          u.suspendedByFounder && !isFounder ? (
                            // Hierarchy: the founder applied this — a sub-admin can't lift it.
                            <span
                              title="Suspended by the founder — only the founder can lift it."
                              className="text-[10px] tracking-[0.15em] uppercase px-2 py-1 rounded-full bg-rose-500/10 text-rose-300/70 ring-1 ring-rose-400/25 cursor-not-allowed"
                            >
                              Suspended
                            </span>
                          ) : (
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
                          )
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

      {memberFor && (
        <MemberModal
          user={memberFor}
          canSuspend={myPerms.includes("suspend")}
          viewerIsFounder={isFounder}
          onChanged={markSuspended}
          onClose={() => setMemberFor(null)}
        />
      )}
    </>
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

function MemberModal({
  user,
  canSuspend,
  viewerIsFounder,
  onChanged,
  onClose
}: {
  user: AdminUserRow;
  canSuspend: boolean;
  viewerIsFounder: boolean;
  onChanged: (id: string, suspendedAt: number | null) => void;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<MemberWalletDetail | "loading" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [onchain, setOnchain] = useState<number | "loading" | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [suspendedAt, setSuspendedAt] = useState<number | null>(user.suspendedAt);
  const [suspendBusy, setSuspendBusy] = useState(false);
  const [suspendErr, setSuspendErr] = useState<string | null>(null);
  const [sess, setSess] = useState<AdminSessionRow[] | "loading" | null>(null);

  useEffect(() => {
    setSess("loading");
    sessions
      .listAll("active", "", user.id)
      .then(setSess)
      .catch(() => setSess([]));
  }, [user.id]);

  async function toggleSuspend() {
    const suspending = !suspendedAt;
    if (
      !confirm(
        suspending
          ? `Suspend ${user.email}? They'll be signed out everywhere and blocked from signing in.`
          : `Unsuspend ${user.email}? They'll be able to sign in again.`
      )
    )
      return;
    setSuspendBusy(true);
    setSuspendErr(null);
    try {
      if (suspending) await suspendUser(user.id);
      else await unsuspendUser(user.id);
      const next = suspending ? Date.now() : null;
      setSuspendedAt(next);
      onChanged(user.id, next);
    } catch (e) {
      setSuspendErr((e as Error).message);
    } finally {
      setSuspendBusy(false);
    }
  }

  useEffect(() => {
    setDetail("loading");
    adminUserDetail(user.id)
      .then(setDetail)
      .catch((e) => {
        setErr((e as Error).message);
        setDetail(null);
      });
  }, [user.id]);

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1200);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  async function checkOnchain() {
    setOnchain("loading");
    try {
      setOnchain(await adminUserOnchain(user.id));
    } catch {
      setOnchain(null);
    }
  }

  const t = tierOf(user);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="liquid-glass rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar url={user.avatarUrl} name={user.firstName} id={user.id} />
            <div>
              <h3 className="text-lg font-medium leading-tight">
                {user.firstName} {user.lastName}
              </h3>
              <p className="text-white/50 text-xs">{user.email}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white text-sm">
            Close
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className={`text-[10px] tracking-[0.15em] uppercase px-2 py-1 rounded-full ${t.cls}`}>
            {t.label}
          </span>
          {suspendedAt && (
            <span className="text-[10px] tracking-[0.15em] uppercase px-2 py-1 rounded-full bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/40">
              Suspended
            </span>
          )}
        </div>

        {/* Profile grid */}
        <p className="mt-6 text-white/40 text-[10px] tracking-[0.3em] uppercase">Profile</p>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
          <Field label="Member ID" value={user.code11} mono copy={() => copy("mid", user.code11)} copied={copied === "mid"} />
          <Field label="Internal ID" value={user.id} mono copy={() => copy("iid", user.id)} copied={copied === "iid"} />
          <Field label="Role" value={user.role} />
          <Field label="Country" value={user.country ?? "—"} />
          <Field label="Age" value={user.age != null ? String(user.age) : "—"} />
          <Field label="Gender" value={user.gender ?? "—"} />
          <Field label="Wallet status" value={labelForWalletStatus(user.walletStatus)} />
          <Field label="Seva Credits" value={(user.tokensMinted ?? 0).toLocaleString()} />
          <Field label="Deposit credited" value={usd(user.initialDepositCreditedUsd ?? 0)} />
          <Field label="Notifications" value={user.notificationsOptIn ? "Opted in" : "Off"} />
          <Field label="Profile" value={user.profileCompleted ? "Complete" : "Pending"} />
          <Field label="Joined" value={formatDate(user.createdAt)} />
        </div>

        {err && <p className="text-rose-300 text-sm mt-5">{err}</p>}

        {/* Wallet addresses */}
        <p className="mt-6 text-white/40 text-[10px] tracking-[0.3em] uppercase">Wallet addresses</p>
        {detail === "loading" || detail === null ? (
          !err && <p className="text-white/40 text-sm mt-2">Loading wallet…</p>
        ) : detail.addresses === null ? (
          <p className="text-white/40 text-sm mt-2">No wallet provisioned for this member.</p>
        ) : (
          <div className="mt-2 space-y-2">
            <AddrRow label="ETH / BSC / Polygon" value={detail.addresses.eth} onCopy={() => copy("eth", detail.addresses!.eth)} copied={copied === "eth"} />
            {detail.addresses.tron && (
              <AddrRow label="Tron" value={detail.addresses.tron} onCopy={() => copy("tron", detail.addresses!.tron!)} copied={copied === "tron"} />
            )}
            {detail.addresses.btc && (
              <AddrRow label="BTC" value={detail.addresses.btc} onCopy={() => copy("btc", detail.addresses!.btc!)} copied={copied === "btc"} />
            )}
            <p className="text-white/25 text-[11px]">Derivation index #{detail.addresses.userIndex}</p>
          </div>
        )}

        {/* Balances */}
        {detail !== "loading" && detail !== null && (
          <>
            <div className="mt-6 flex items-center justify-between">
              <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase">Balances (ledger)</p>
              <span className="text-white/70 text-xs font-mono">Usable {usd(detail.usableUsd)}</span>
            </div>
            <div className="mt-2 rounded-xl border border-white/10 overflow-hidden">
              {detail.balances.filter((b) => b.total > 0).length === 0 ? (
                <p className="px-3 py-3 text-white/40 text-sm">No balances.</p>
              ) : (
                detail.balances
                  .filter((b) => b.total > 0)
                  .map((b) => (
                    <div key={b.asset} className="flex items-center justify-between px-3 py-2 border-b border-white/5 last:border-0 text-sm">
                      <span className="text-white/80">{b.asset}</span>
                      <span className="text-white/60 font-mono">
                        {b.total.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                        {b.usd != null && <span className="text-white/35"> · {usd(b.usd)}</span>}
                      </span>
                    </div>
                  ))
              )}
            </div>

            {/* On-chain (actual) — on demand */}
            <div className="mt-3 flex items-center gap-3 text-xs">
              <span className="text-white/40">On-chain (actual):</span>
              {onchain === "loading" ? (
                <span className="text-white/50">checking…</span>
              ) : typeof onchain === "number" ? (
                <span className="font-mono text-white/80">{usd(onchain)}</span>
              ) : (
                <button type="button" onClick={checkOnchain} className="text-white/50 hover:text-white underline decoration-dotted">
                  check live
                </button>
              )}
            </div>
          </>
        )}

        {/* Active sessions */}
        <div className="mt-6 flex items-center justify-between">
          <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase">Active sessions</p>
          <Link href="/sessions" className="text-white/40 hover:text-white text-xs underline decoration-dotted">
            All sessions →
          </Link>
        </div>
        {sess === "loading" || sess === null ? (
          <p className="text-white/40 text-sm mt-2">Loading sessions…</p>
        ) : sess.length === 0 ? (
          <p className="text-white/40 text-sm mt-2">No active sessions.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {sess.map((s) => (
              <div key={s.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <p className="text-white/80">{deviceLabel(s.user_agent)}</p>
                  <p className="text-white/40 font-mono">{s.ip ?? "—"}</p>
                </div>
                <div className="text-right shrink-0">
                  {s.online ? (
                    <span className="inline-flex items-center gap-1 text-emerald-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> online
                    </span>
                  ) : (
                    <span className="text-white/50">{s.last_used_at ? agoShort(s.last_used_at) : "—"}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Danger zone — needs the suspend capability; never for other admins. */}
        {canSuspend && user.role !== "admin" && (
          <div className="mt-6 pt-5 border-t border-white/10">
            {suspendErr && <p className="text-rose-300 text-sm mb-3">{suspendErr}</p>}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-white/80 text-sm font-medium">
                  {suspendedAt ? "Account suspended" : "Suspend this member"}
                </p>
                <p className="text-white/40 text-xs mt-0.5">
                  {suspendedAt
                    ? "They are blocked from signing in."
                    : "Signs them out everywhere and blocks sign-in."}
                </p>
              </div>
              {suspendedAt && user.suspendedByFounder && !viewerIsFounder ? (
                // Hierarchy: the founder applied this — a sub-admin can't lift it.
                <span
                  title="Suspended by the founder — only the founder can lift it."
                  className="shrink-0 rounded-full text-xs px-4 py-2 bg-white/5 text-white/40 ring-1 ring-white/10 cursor-not-allowed"
                >
                  Founder-locked
                </span>
              ) : (
                <button
                  type="button"
                  onClick={toggleSuspend}
                  disabled={suspendBusy}
                  className={`shrink-0 rounded-full text-sm font-medium px-5 py-2 disabled:opacity-40 transition-colors ${
                    suspendedAt
                      ? "bg-emerald-400 text-black hover:bg-emerald-300"
                      : "bg-rose-500/90 text-white hover:bg-rose-500"
                  }`}
                >
                  {suspendBusy ? "Working…" : suspendedAt ? "Unsuspend" : "Suspend"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  copy,
  copied
}: {
  label: string;
  value: string;
  mono?: boolean;
  copy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-white/35 text-[10px] tracking-[0.15em] uppercase">{label}</p>
      <div className="flex items-center gap-1.5">
        <p className={`text-white/85 text-sm truncate ${mono ? "font-mono text-xs" : ""}`} title={value}>
          {value}
        </p>
        {copy && (
          <button type="button" onClick={copy} className="text-white/30 hover:text-white text-[10px] shrink-0" title="Copy">
            {copied ? "✓" : "⧉"}
          </button>
        )}
      </div>
    </div>
  );
}

function AddrRow({
  label,
  value,
  onCopy,
  copied
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-white/35 text-[10px] tracking-[0.15em] uppercase">{label}</p>
        <p className="text-white/80 font-mono text-xs break-all">{value}</p>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 text-[10px] text-white/50 hover:text-white underline decoration-dotted"
      >
        {copied ? "copied" : "copy"}
      </button>
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

function Stat({ label, value, live }: { label: string; value: string; live?: boolean }) {
  return (
    <div className={`liquid-glass rounded-2xl p-6 ${live ? "ring-1 ring-emerald-400/25 hover:ring-emerald-400/50 transition-colors" : ""}`}>
      <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase mb-2 flex items-center gap-1.5">
        {live && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
          </span>
        )}
        {label}
      </p>
      <p className={`text-3xl font-medium tracking-tight ${live ? "text-emerald-200" : "text-white"}`}>{value}</p>
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

function deviceLabel(ua: string | null): string {
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

function agoShort(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

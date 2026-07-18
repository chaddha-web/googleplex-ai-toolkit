"use client";

/**
 * Admin → Overview. The first page built on the new AdminShell. Phase 0 proves
 * the shell end-to-end with real KPIs (online now, members, withdrawal queue);
 * the recent-actions feed lands with the audit log in Phase 2.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Can } from "@/components/admin/access";
import { StatCard } from "@/components/admin/ui";
import {
  sessions,
  listAllUsers,
  adminAccounting,
  adminAudit,
  type Accounting,
  type AdminAuditEvent
} from "@/lib/auth-client";
import { actionLabel, auditAgo } from "@/components/admin/audit";

function QuickLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="liquid-glass rounded-2xl px-5 py-4 block hover:bg-white/[0.03] transition-colors"
    >
      <p className="text-sm text-white">{title}</p>
      <p className="text-white/40 text-xs mt-1">{desc}</p>
    </Link>
  );
}

function RecentActions() {
  const [rows, setRows] = useState<AdminAuditEvent[] | null>(null);
  useEffect(() => {
    adminAudit(6).then(setRows).catch(() => setRows([]));
  }, []);
  if (rows === null) {
    return (
      <div className="mt-4 liquid-glass rounded-2xl px-6 py-8 text-center text-white/40 text-sm">Loading…</div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="mt-4 liquid-glass rounded-2xl px-6 py-8 text-center text-white/40 text-sm">
        No admin actions recorded yet.
      </div>
    );
  }
  return (
    <div className="mt-4 liquid-glass rounded-2xl divide-y divide-white/5">
      {rows.map((e) => (
        <div key={e.id} className="px-5 py-3 flex items-center gap-3 text-sm">
          <span className="text-white/40 text-xs w-16 shrink-0">{auditAgo(e.created_at)}</span>
          <span className="text-white/80 truncate">
            <span className="text-white/50">{e.actor_email ?? "admin"}</span> {actionLabel(e.action)}
            {e.target_label && <span className="font-mono text-white/50 text-xs"> {e.target_label}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

export function OverviewBody({
  demo
}: {
  /** Preview seed — when set, skips live fetches and shows these figures. */
  demo?: { online: number; members: number };
} = {}) {
  const [online, setOnline] = useState<number | null>(demo ? demo.online : null);
  const [members, setMembers] = useState<number | null>(demo ? demo.members : null);
  const [acct, setAcct] = useState<Accounting | null>(null);

  useEffect(() => {
    if (demo) return;
    let alive = true;
    sessions.online().then((r) => alive && setOnline(r.count)).catch(() => {});
    listAllUsers().then((r) => alive && setMembers(r.total)).catch(() => {});
    adminAccounting().then((a) => alive && setAcct(a)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [demo]);

  const fmt = (n: number | null) => (n === null ? "…" : n.toLocaleString());
  const usd = (n: number | undefined) =>
    n == null ? "…" : "$" + n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <>
      <p className="text-white/40 text-xs tracking-[0.3em] uppercase">Overview</p>
      <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-2">
        The <em className="font-serif-i text-white/60">control</em> room.
      </h1>

      <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Online now"
          value={
            <span className="inline-flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              {fmt(online)}
            </span>
          }
          hint="using the platform"
          href="/app/admin/sessions"
        />
        <StatCard label="Members" value={fmt(members)} hint="total registered" href="/app/admin" />
        <StatCard
          label="Deposits in"
          value={usd(acct?.depositsUsd)}
          hint={acct ? `${acct.counts.deposits} deposits` : ""}
          tone="emerald"
          href="/app/admin/treasury"
        />
        <StatCard
          label="Member holdings"
          value={usd(acct?.holdingsUsd)}
          hint="ledger balances"
          href="/app/admin/treasury"
        />
        <StatCard
          label="Withdrawn out"
          value={usd(acct?.withdrawnUsd)}
          hint={acct ? `${acct.counts.withdrawals} total` : ""}
          tone="rose"
          href="/app/admin/treasury"
        />
        <StatCard
          label="Pending withdrawals"
          value={usd(acct?.pendingUsd)}
          hint={acct ? `${acct.counts.pendingWithdrawals} awaiting` : ""}
          tone={acct && acct.counts.pendingWithdrawals > 0 ? "amber" : "default"}
          href="/app/admin/withdrawals"
        />
        <StatCard
          label="Ledger entries"
          value={acct ? acct.counts.ledgerEntries.toLocaleString() : "…"}
          hint="credits + debits"
          href="/app/admin/treasury"
        />
        <StatCard
          label="Treasury sweeps"
          value={acct ? acct.counts.sweeps.toLocaleString() : "…"}
          hint="flushes to treasury"
          href="/app/admin/treasury"
        />
      </div>

      {acct && Object.keys(acct.byChain).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(acct.byChain).map(([c, v]) => (
            <span key={c} className="liquid-glass rounded-full px-3 py-1.5 text-xs text-white/70">
              {c.toUpperCase()} · {usd(v)}
            </span>
          ))}
        </div>
      )}

      <div className="mt-10">
        <h2 className="font-serif text-2xl tracking-tight">Jump to</h2>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <QuickLink href="/app/admin" title="Members" desc="Search, inspect, suspend." />
          <QuickLink href="/app/admin/sessions" title="Live sessions" desc="Who's on right now." />
          <Can capability="withdrawals">
            <QuickLink href="/app/admin/withdrawals" title="Withdrawals" desc="Review the payout queue." />
          </Can>
          <QuickLink href="/app/admin/campaigns" title="Email campaigns" desc="Compose and send." />
          <QuickLink href="/app/admin/circle" title="Circle" desc="Moderate the community." />
          <QuickLink href="/app/admin/globe" title="Live globe" desc="Where members are." />
          <Can capability="settings">
            <QuickLink href="/app/admin/settings" title="Settings" desc="Keys, limits, secrets." />
          </Can>
          <Can founder>
            <QuickLink href="/app/admin/permissions" title="Admin access" desc="Manage sub-admins." />
          </Can>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="font-serif text-2xl tracking-tight">Recent admin actions</h2>
        <Can
          capability="settings"
          fallback={
            <div className="mt-4 liquid-glass rounded-2xl px-6 py-6 text-center text-white/40 text-sm">
              The audit log is visible to the founder and settings-capable admins.
            </div>
          }
        >
          <RecentActions />
        </Can>
      </div>
    </>
  );
}

export default function OverviewPage() {
  return <OverviewBody />;
}

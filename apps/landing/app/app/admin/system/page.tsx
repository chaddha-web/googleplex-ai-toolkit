"use client";

/**
 * Admin → System health. Liveness of the auth + wallet services, a live member
 * count, a platform data snapshot, and a KMS/seed reminder. The governance
 * operator console lives at admin.ggakingclub.com (linked from the sidebar).
 */

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/admin/ui";
import { systemHealth, adminAccounting, sessions, type Accounting } from "@/lib/auth-client";

function Service({ name, up }: { name: string; up: boolean | null }) {
  return (
    <div className="liquid-glass rounded-2xl px-5 py-4 flex items-center justify-between">
      <div>
        <p className="text-white/90 text-sm">{name}</p>
        <p className="text-white/40 text-xs mt-0.5">{name === "Auth" ? "auth.ggakingclub.com" : "wallet.ggakingclub.com"}</p>
      </div>
      {up === null ? (
        <StatusBadge tone="neutral">checking…</StatusBadge>
      ) : up ? (
        <StatusBadge tone="emerald">operational</StatusBadge>
      ) : (
        <StatusBadge tone="rose">unreachable</StatusBadge>
      )}
    </div>
  );
}

export default function SystemPage() {
  const [health, setHealth] = useState<{ auth: boolean; wallet: boolean } | null>(null);
  const [acct, setAcct] = useState<Accounting | null>(null);
  const [online, setOnline] = useState<number | null>(null);

  useEffect(() => {
    systemHealth().then(setHealth).catch(() => setHealth({ auth: false, wallet: false }));
    adminAccounting().then(setAcct).catch(() => {});
    sessions.online().then((r) => setOnline(r.count)).catch(() => {});
  }, []);

  const stat = (label: string, value: string | number) => (
    <div className="liquid-glass rounded-2xl px-5 py-4">
      <p className="text-white/40 text-[11px] tracking-[0.2em] uppercase">{label}</p>
      <p className="mt-2 text-2xl font-light text-white">{value}</p>
    </div>
  );

  return (
    <section className="max-w-5xl mx-auto">
      <p className="text-white/40 text-xs tracking-[0.3em] uppercase">Operations</p>
      <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-2">
        System <em className="font-serif-i text-white/60">health</em>.
      </h1>

      <h2 className="mt-8 text-white/40 text-[11px] tracking-[0.2em] uppercase">Services</h2>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Service name="Auth" up={health ? health.auth : null} />
        <Service name="Wallet" up={health ? health.wallet : null} />
      </div>

      <h2 className="mt-10 text-white/40 text-[11px] tracking-[0.2em] uppercase">Snapshot</h2>
      <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stat("Online now", online === null ? "…" : online)}
        {stat("Members", acct ? acct.counts.members.toLocaleString() : "…")}
        {stat("Withdrawals", acct ? acct.counts.withdrawals.toLocaleString() : "…")}
        {stat("Ledger entries", acct ? acct.counts.ledgerEntries.toLocaleString() : "…")}
      </div>

      <h2 className="mt-10 text-white/40 text-[11px] tracking-[0.2em] uppercase">Custody</h2>
      <div className="mt-3 liquid-glass rounded-2xl px-6 py-5">
        <p className="text-white/70 text-sm">
          Member deposit addresses are HD-derived; the KMS-encrypted seeds live on the VPS data volume
          (<span className="font-mono text-white/50">/data/seeds/*.bin</span>).
        </p>
        <p className="text-amber-200/80 text-xs mt-2">
          ⚠ Back these up offline — losing them means funds are unrecoverable. (See the backlog.)
        </p>
      </div>

      <h2 className="mt-10 text-white/40 text-[11px] tracking-[0.2em] uppercase">Governance</h2>
      <div className="mt-3 liquid-glass rounded-2xl px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
        <p className="text-white/70 text-sm">
          Proposals, protocol params, sybil console and treasury live in the operator app.
        </p>
        <a
          href="https://admin.ggakingclub.com"
          target="_blank"
          rel="noreferrer"
          className="rounded-full bg-white/10 text-white text-sm font-medium px-4 py-2 hover:bg-white/15 shrink-0"
        >
          Open governance ↗
        </a>
      </div>
    </section>
  );
}

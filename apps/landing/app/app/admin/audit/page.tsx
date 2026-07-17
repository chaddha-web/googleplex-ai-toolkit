"use client";

/**
 * Admin → Audit log. The who-did-what-when trail behind every privileged
 * action (suspend, permissions, promote/demote, settings, withdrawals, flush).
 * Backed by /auth/admin/audit; gated on the "settings" capability server-side.
 */

import { useEffect, useState } from "react";
import { adminAudit, type AdminAuditEvent } from "@/lib/auth-client";
import { actionLabel, auditAgo, detailText } from "@/components/admin/audit";

export default function AuditPage() {
  const [rows, setRows] = useState<AdminAuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminAudit(300)
      .then(setRows)
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <section className="max-w-5xl mx-auto">
      <p className="text-white/40 text-xs tracking-[0.3em] uppercase">Accountability</p>
      <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-2">
        Audit <em className="font-serif-i text-white/60">log</em>.
      </h1>
      <p className="text-white/50 text-sm mt-3 max-w-2xl leading-relaxed">
        Every privileged admin action — suspends, permission changes, withdrawals, treasury
        flushes — recorded with who, what, and when. Append-only.
      </p>

      {error && <p className="mt-6 text-rose-300/90 text-sm">{error}</p>}

      <div className="mt-6 liquid-glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] tracking-[0.2em] uppercase text-white/40 border-b border-white/10">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Admin</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows === null && !error ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-white/40">Loading…</td></tr>
              ) : rows && rows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-white/40">No admin actions recorded yet.</td></tr>
              ) : (
                (rows ?? []).map((e) => (
                  <tr key={e.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-white/50 text-xs whitespace-nowrap">{auditAgo(e.created_at)}</td>
                    <td className="px-4 py-3 text-white/80 text-xs">{e.actor_email ?? e.actor_id ?? "—"}</td>
                    <td className="px-4 py-3 text-white/90">{actionLabel(e.action)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-white/60">{e.target_label ?? "—"}</td>
                    <td className="px-4 py-3 text-white/40 text-xs">{detailText(e)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

"use client";

/**
 * DEV-ONLY preview of the admin shell + overview. Lives OUTSIDE /app so it skips
 * the auth gate, letting the real AdminShell render locally without a session or
 * backend. Returns 404 in production so it can never leak the chrome publicly.
 */

import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { OverviewBody } from "@/app/app/admin/overview/page";

export default function AdminPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <AdminShell
      title="Overview"
      previewAs={{ name: "Founder", founder: true, perms: ["withdrawals", "suspend", "flush", "settings"] }}
    >
      <OverviewBody demo={{ online: 12, members: 1284, pending: 3 }} />
    </AdminShell>
  );
}

import type { AdminAuditEvent } from "@/lib/auth-client";

/** Human phrasing for each audit action slug. */
const ACTION_LABEL: Record<string, string> = {
  "member.suspend": "suspended a member",
  "member.unsuspend": "lifted a suspension",
  "member.self_secure": "self-secured their account",
  "admin.permissions": "changed admin permissions",
  "admin.promote": "promoted a member to admin",
  "admin.demote": "removed an admin",
  "settings.set": "updated a setting",
  "settings.clear": "cleared a setting",
  "withdrawal.approve": "approved a withdrawal",
  "withdrawal.reject": "rejected a withdrawal",
  "treasury.flush": "flushed a wallet to treasury",
  "treasury.flush_all": "ran a batch treasury flush"
};

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

export function auditAgo(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Flatten the JSON detail blob into a compact "k: v · k: v" string. */
export function detailText(e: AdminAuditEvent): string {
  if (!e.detail) return "";
  try {
    const d = JSON.parse(e.detail);
    if (d == null || typeof d !== "object") return String(d);
    return Object.entries(d as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join(" · ");
  } catch {
    return e.detail;
  }
}

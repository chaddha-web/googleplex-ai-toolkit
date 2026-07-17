const AUTH_BASE = (process.env.AUTH_BASE_URL || "http://auth:4200").replace(/\/$/, "");
const INTERNAL = process.env.INTERNAL_SERVICE_TOKEN;

/**
 * Record a money action (withdrawal approve/reject, treasury flush) into the
 * shared admin audit log that lives in the auth service. Fire-and-forget — a
 * failed audit write must never break the money action it describes.
 */
export function auditToAuth(entry: {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  targetId?: string | null;
  targetLabel?: string | null;
  detail?: unknown;
}): void {
  if (!INTERNAL) return;
  fetch(AUTH_BASE + "/internal/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + INTERNAL },
    body: JSON.stringify(entry)
  }).catch(() => {});
}

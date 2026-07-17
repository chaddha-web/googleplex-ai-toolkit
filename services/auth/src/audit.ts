import { randomUUID } from "node:crypto";
import { db } from "./db.js";

/**
 * Admin action audit log — an append-only record of every privileged action
 * (suspend, permission change, promote/demote, settings write, withdrawal
 * approval, treasury flush …). The accountability layer behind the sub-admin
 * delegation model: who did what, to whom, and when.
 *
 * Writes are best-effort — recording an audit row must NEVER break the action
 * it describes. Lives in auth.db; the wallet service records its money actions
 * here too via the internal endpoint.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_audit (
    id           TEXT PRIMARY KEY,
    actor_id     TEXT,
    actor_email  TEXT,
    action       TEXT NOT NULL,
    target_id    TEXT,
    target_label TEXT,
    detail       TEXT,
    created_at   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit (created_at DESC);
`);

const insertStmt = db.prepare(`
  INSERT INTO admin_audit (id, actor_id, actor_email, action, target_id, target_label, detail, created_at)
  VALUES (@id, @actor_id, @actor_email, @action, @target_id, @target_label, @detail, @created_at)
`);

const listStmt = db.prepare(`
  SELECT id, actor_id, actor_email, action, target_id, target_label, detail, created_at
  FROM admin_audit
  ORDER BY created_at DESC
  LIMIT ?
`);

export type AuditEntry = {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  targetId?: string | null;
  targetLabel?: string | null;
  detail?: unknown;
};

export function recordAudit(e: AuditEntry): void {
  try {
    insertStmt.run({
      id: randomUUID(),
      actor_id: e.actorId ?? null,
      actor_email: e.actorEmail ?? null,
      action: e.action,
      target_id: e.targetId ?? null,
      target_label: e.targetLabel ?? null,
      detail: e.detail == null ? null : JSON.stringify(e.detail),
      created_at: Date.now()
    });
  } catch {
    /* audit is best-effort; never let it break the mutating action */
  }
}

export type AuditRow = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_id: string | null;
  target_label: string | null;
  detail: string | null;
  created_at: number;
};

export function listAudit(limit = 200): AuditRow[] {
  return listStmt.all(Math.min(Math.max(limit, 1), 500)) as AuditRow[];
}

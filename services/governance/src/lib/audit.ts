import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { db, type Db } from "./db.js";

export const audit_log = pgTable("audit_log", {
  id: text("id").primaryKey(),
  proposal_id: text("proposal_id").notNull(),
  event: text("event").notNull(),
  payload_json: jsonb("payload_json"),
  timestamp: timestamp("timestamp").defaultNow()
});

export interface AuditEvent {
  proposalId: string;
  event:
    | "proposal.created"
    | "vote.cast"
    | "proposal.tallied"
    | "proposal.delayed"
    | "proposal.cancelled"
    | "proposal.executed"
    | "proposal.execution_failed";
  payload: unknown;
}

export async function appendAudit(db: Db, ev: AuditEvent): Promise<void> {
  await db.insert(audit_log).values({
    id: crypto.randomUUID(), // Assuming Node 20+
    proposal_id: ev.proposalId,
    event: ev.event,
    payload_json: ev.payload as any,
  });
}

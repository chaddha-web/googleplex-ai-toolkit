import { pgTable, text, timestamp, integer, jsonb, primaryKey, uuid } from "drizzle-orm/pg-core";

export const proposals = pgTable("proposals", {
  id: text("id").primaryKey(),
  proposer_id: uuid("proposer_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  action_kind: text("action_kind"),
  action_payload: jsonb("action_payload"),
  status: text("status").notNull().default("draft"),
  voting_starts_at: timestamp("voting_starts_at", { withTimezone: true }),
  voting_ends_at: timestamp("voting_ends_at", { withTimezone: true }),
  quorum: integer("quorum").default(1),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow()
});

export const votes = pgTable("votes", {
  proposal_id: text("proposal_id").notNull(),
  voter_id: uuid("voter_id").notNull(),
  direction: text("direction").notNull(),
  weight: integer("weight").notNull().default(1),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  pk: primaryKey({ columns: [t.proposal_id, t.voter_id] })
}));

export const proposal_executions = pgTable("proposal_executions", {
  id: text("id").primaryKey(),
  proposal_id: text("proposal_id").notNull(),
  handler: text("handler").notNull(),
  status: text("status").notNull(),
  result_json: jsonb("result_json"),
  error: text("error"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  completed_at: timestamp("completed_at", { withTimezone: true })
});

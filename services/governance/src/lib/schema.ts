import { pgTable, text, timestamp, integer, jsonb, primaryKey, uuid } from "drizzle-orm/pg-core";

export const proposals = pgTable("proposals", {
  id: text("id").primaryKey(),
  proposer_id: uuid("proposer_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  action_kind: text("action_kind"),
  action_payload: jsonb("action_payload"),
  status: text("status").notNull().default("draft"),
  // Voting model: 'one_member' (1 person = 1 vote) or 'token_weighted' (GGX balance).
  voting_mode: text("voting_mode").notNull().default("one_member"),
  // Tron snapshot block captured at submit-time for token_weighted proposals.
  snapshot_block: integer("snapshot_block"),
  voting_starts_at: timestamp("voting_starts_at", { withTimezone: true }),
  voting_ends_at: timestamp("voting_ends_at", { withTimezone: true }),
  // Minimum total participating weight for the vote to count. BigInt string so it
  // holds both a member count (one_member) and a raw token amount (token_weighted).
  quorum: text("quorum").notNull().default("1"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow()
});

export const votes = pgTable("votes", {
  proposal_id: text("proposal_id").notNull(),
  voter_id: uuid("voter_id").notNull(),
  direction: text("direction").notNull(),
  // BigInt string: "1" for one_member, or the snapshot GGX balance for token_weighted.
  weight: text("weight").notNull().default("1"),
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

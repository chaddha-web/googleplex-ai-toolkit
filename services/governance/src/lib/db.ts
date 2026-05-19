import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/googolplex"
});

export const db = drizzle(pool, { schema });

export type ProposalRow = typeof schema.proposals.$inferSelect;
export type VoteRow = typeof schema.votes.$inferSelect;
export type ExecutionRow = typeof schema.proposal_executions.$inferSelect;

export type Db = typeof db;

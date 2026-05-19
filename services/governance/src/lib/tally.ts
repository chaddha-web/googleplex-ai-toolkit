import { db, type Db, type VoteRow } from "./db.js";
import { eq } from "drizzle-orm";
import { votes } from "./schema.js";
import type { ProposalLane } from "@googolplex/dao-actions";

export interface TallyResult {
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;
  totalVotes: bigint;
  quorumRequired: bigint;
  passed: boolean;
}

export interface TallyConfig {
  defaultQuorumBps: number;
  laneQuorumBps: Partial<Record<ProposalLane, number>>;
  totalSupply: bigint;
}

export async function tally(db: Db, proposalId: string, lane: ProposalLane, cfg: TallyConfig): Promise<TallyResult> {
  const rows = await db.select().from(votes).where(eq(votes.proposal_id, proposalId));

  let f = 0n,
    a = 0n,
    abs = 0n;
  for (const r of rows) {
    const w = BigInt(r.weight);
    if (r.direction === "yes") f += w;
    else if (r.direction === "no") a += w;
    else abs += w;
  }

  const bps = cfg.laneQuorumBps[lane] ?? cfg.defaultQuorumBps;
  const quorumRequired = (cfg.totalSupply * BigInt(bps)) / 10000n;

  return {
    forVotes: f,
    againstVotes: a,
    abstainVotes: abs,
    totalVotes: f + a + abs,
    quorumRequired,
    passed: f >= quorumRequired && f > a
  };
}

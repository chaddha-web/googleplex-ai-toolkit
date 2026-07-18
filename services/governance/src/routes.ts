import type { FastifyInstance } from "fastify";
import { db } from "./lib/db.js";
import { proposals, votes } from "./lib/schema.js";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { snapshotClient, tokenWeightedLive } from "./lib/snapshot-client.js";
import type { Snapshot } from "./lib/tron-snapshot.js";

type VotingMode = "one_member" | "token_weighted";

function normMode(v: unknown): VotingMode {
  return v === "token_weighted" ? "token_weighted" : "one_member";
}

export async function governanceRoutes(app: FastifyInstance) {
  // POST /governance/proposals — draft. `votingMode` picks the model.
  app.post("/governance/proposals", async (req: any, reply) => {
    const { proposerId, title, description, actionKind, actionPayload, votingMode, quorum } = req.body ?? {};
    if (!proposerId || !title) return reply.code(400).send({ error: "proposerId and title are required." });
    const mode = normMode(votingMode);
    const id = ulid();
    await db.insert(proposals).values({
      id,
      proposer_id: proposerId,
      title,
      description: description ?? "",
      action_kind: actionKind ?? null,
      action_payload: actionPayload ?? null,
      status: "draft",
      voting_mode: mode,
      quorum: quorum != null && String(quorum).trim() !== "" ? String(quorum) : "1"
    });
    return reply.send({ id, votingMode: mode });
  });

  // GET /governance/proposals — with live tallies (weight-aware).
  app.get("/governance/proposals", async (_req, reply) => {
    const all = await db.select().from(proposals);
    const out = [];
    for (const p of all) {
      const vs = await db.select().from(votes).where(eq(votes.proposal_id, p.id));
      let yes = 0n,
        no = 0n,
        abstain = 0n;
      for (const v of vs) {
        const w = BigInt(v.weight);
        if (v.direction === "yes") yes += w;
        else if (v.direction === "no") no += w;
        else abstain += w;
      }
      out.push({
        ...p,
        tally: { yes: yes.toString(), no: no.toString(), abstain: abstain.toString(), voters: vs.length }
      });
    }
    return reply.send(out);
  });

  // POST /governance/proposals/:id/submit — open a 7-day vote. Token-weighted
  // proposals capture a Tron snapshot block now, so balances are fixed at submit.
  app.post("/governance/proposals/:id/submit", async (req: any, reply) => {
    const { id } = req.params;
    const rows = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1);
    const p = rows[0];
    if (!p) return reply.code(404).send({ error: "No such proposal." });
    if (p.status !== "draft") return reply.code(400).send({ error: `Cannot submit a proposal in status "${p.status}".` });

    const now = new Date();
    const votingEnds = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    let snapshotBlock: number | null = null;
    if (p.voting_mode === "token_weighted") {
      try {
        snapshotBlock = (await snapshotClient().openSnapshot()).block;
      } catch (e) {
        return reply.code(502).send({ error: "Could not open a token snapshot: " + (e as Error).message });
      }
    }
    await db
      .update(proposals)
      .set({ status: "voting", voting_starts_at: now, voting_ends_at: votingEnds, snapshot_block: snapshotBlock })
      .where(eq(proposals.id, id));
    return reply.send({ ok: true, votingMode: p.voting_mode, snapshotBlock, tokenWeightedLive: tokenWeightedLive() });
  });

  // POST /governance/proposals/:id/vote — weight resolved by the proposal's mode.
  app.post("/governance/proposals/:id/vote", async (req: any, reply) => {
    const { id } = req.params;
    const { voterId, direction, voterAddress } = req.body ?? {};
    if (!voterId) return reply.code(400).send({ error: "voterId is required." });
    if (!["yes", "no", "abstain"].includes(direction)) {
      return reply.code(400).send({ error: "direction must be yes | no | abstain." });
    }
    const rows = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1);
    const p = rows[0];
    if (!p) return reply.code(404).send({ error: "No such proposal." });
    if (p.status !== "voting") return reply.code(400).send({ error: "Proposal is not open for voting." });

    let weight = "1";
    if (p.voting_mode === "token_weighted") {
      if (!voterAddress) {
        return reply.code(400).send({ error: "voterAddress (Tron) is required for token-weighted voting." });
      }
      if (p.snapshot_block == null) {
        return reply.code(400).send({ error: "This proposal has no snapshot block." });
      }
      try {
        // Path-B balance fold only needs the block; hash/timestamp are unused here.
        const snap: Snapshot = { block: p.snapshot_block, blockHash: "0x0", timestamp: 0 };
        weight = (await snapshotClient().balanceOf(voterAddress, snap)).toString();
      } catch (e) {
        return reply.code(502).send({ error: "Snapshot balance lookup failed: " + (e as Error).message });
      }
      if (BigInt(weight) <= 0n) {
        return reply.code(403).send({ error: "No GGX balance at the snapshot — voting weight is zero." });
      }
    }

    // One vote per (proposal, voter). Re-votes are ignored in v1.
    await db.insert(votes).values({ proposal_id: id, voter_id: voterId, direction, weight }).onConflictDoNothing();
    return reply.send({ ok: true, weight, votingMode: p.voting_mode });
  });
}

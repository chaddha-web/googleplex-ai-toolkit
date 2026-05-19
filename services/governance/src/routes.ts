import type { FastifyInstance } from "fastify";
import { db } from "./lib/db.js";
import { proposals, votes } from "./lib/schema.js";
import { eq, and } from "drizzle-orm";
import { ulid } from "ulid";

export async function governanceRoutes(app: FastifyInstance) {
  // POST /governance/proposals
  app.post("/governance/proposals", async (req: any, reply) => {
    const { proposerId, title, description, actionKind, actionPayload } = req.body;
    const id = ulid();
    await db.insert(proposals).values({
      id,
      proposer_id: proposerId,
      title,
      description,
      action_kind: actionKind,
      action_payload: actionPayload,
      status: "draft"
    });
    return reply.send({ id });
  });

  // GET /governance/proposals
  app.get("/governance/proposals", async (req, reply) => {
    const all = await db.select().from(proposals);
    return reply.send(all);
  });

  // POST /governance/proposals/:id/submit
  app.post("/governance/proposals/:id/submit", async (req: any, reply) => {
    const { id } = req.params;
    const now = new Date();
    const votingEnds = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.update(proposals).set({
      status: "voting",
      voting_starts_at: now,
      voting_ends_at: votingEnds
    }).where(eq(proposals.id, id));
    
    return reply.send({ ok: true });
  });

  // POST /governance/proposals/:id/vote
  app.post("/governance/proposals/:id/vote", async (req: any, reply) => {
    const { id } = req.params;
    const { voterId, direction } = req.body;

    await db.insert(votes).values({
      proposal_id: id,
      voter_id: voterId,
      direction
    });
    
    return reply.send({ ok: true });
  });
}

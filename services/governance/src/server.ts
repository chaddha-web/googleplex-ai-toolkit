import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { governanceRoutes } from "./routes.js";
import { db } from "./lib/db.js";
import { proposals, votes } from "./lib/schema.js";
import { and, lt, eq } from "drizzle-orm";

const PORT = Number(process.env.PORT ?? 4202);
const app = Fastify({ logger: true, trustProxy: true });

await app.register(helmet);
await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
await app.register(cors, {
  origin: (origin, cb) => {
    cb(null, true);
  }
});

app.get("/health", async () => ({ ok: true, name: "@googolplex/governance-service", ts: Date.now() }));
await app.register(governanceRoutes);

// Worker: tally votes every 60s
setInterval(async () => {
  try {
    const now = new Date();
    const ending = await db.select().from(proposals).where(and(lt(proposals.voting_ends_at, now), eq(proposals.status, "voting")));
    
    for (const p of ending) {
      const tally = await db.select().from(votes).where(eq(votes.proposal_id, p.id));
      // Weight-aware: "1" per voter in one_member mode, snapshot GGX balance in
      // token_weighted mode. Same code path serves both.
      let yes = 0n,
        no = 0n;
      for (const v of tally) {
        const w = BigInt(v.weight);
        if (v.direction === "yes") yes += w;
        else if (v.direction === "no") no += w;
      }
      const quorum = BigInt(p.quorum ?? "1");
      const passed = yes > no && yes + no >= quorum;
      await db.update(proposals).set({ status: passed ? "passed" : "failed" }).where(eq(proposals.id, p.id));
      // NOTE: on-chain execution of a passed proposal is deliberately NOT wired
      // here — see "Governance Stack — Deployment Scope" (phase G3).
    }
  } catch (e) {
    app.log.error(e);
  }
}, 60000);

await app.listen({ port: PORT, host: "0.0.0.0" });
app.log.info(`[governance] listening on http://localhost:${PORT}`);

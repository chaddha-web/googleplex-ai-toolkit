// Shared Fastify factory for every DaoAction backend handler.
// Each handler service is a thin file that calls `runHandler({ name, dispatchers })`
// where `dispatchers` is a per-action-kind map of side-effect functions.
// The factory wires: receipt verification, idempotency by receipt.nonce, audit-log
// echo line per dispatch, /healthz endpoint, graceful shutdown.

import Fastify from "fastify";
import type { DaoAction, DaoActionKind, ExecutionReceipt, HandlerKey } from "@googolplex/dao-actions";
import { ACTION_REGISTRY } from "@googolplex/dao-actions";
import { createReceiptSigner, verifyReceiptOrThrow } from "@googolplex/governance-shared";

export type ActionDispatcher<K extends DaoActionKind> = (
  action: Extract<DaoAction, { kind: K }>,
  receipt: ExecutionReceipt
) => Promise<{ ok: true; result?: unknown } | { ok: false; error: string }>;

export type DispatcherMap = {
  // Each handler implements only its own kinds; unmatched kinds return 400.
  [K in DaoActionKind]?: ActionDispatcher<K>;
};

export interface RunHandlerOpts {
  name: HandlerKey;
  dispatchers: DispatcherMap;
}

export async function runHandler({ name, dispatchers }: RunHandlerOpts): Promise<void> {
  const port = Number(process.env.PORT ?? 4100);
  const secret = process.env.RECEIPT_SIGNING_SECRET ?? "dev-secret-do-not-use-in-prod-at-least-32-chars";
  const verifier = createReceiptSigner(secret); // sign/verify share the same key in v1

  // Idempotency: refuse to apply the same receipt twice. In v1 this is an in-memory set;
  // production: PG table keyed by receipt.nonce.
  const seenNonces = new Set<string>();

  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

  app.get("/healthz", async () => ({ ok: true, handler: name }));

  app.post<{ Body: { action: DaoAction; receipt: ExecutionReceipt } }>("/dispatch", async (req, reply) => {
    const { action, receipt } = req.body ?? {};
    if (!action || !receipt) return reply.code(400).send({ error: "missing action or receipt" });

    // Verify this action even belongs to this handler.
    const meta = ACTION_REGISTRY[action.kind];
    if (!meta) return reply.code(400).send({ error: `unknown action kind: ${action.kind}` });
    if (meta.handler !== name) {
      return reply.code(400).send({ error: `action.kind ${action.kind} routes to handler "${meta.handler}", not "${name}"` });
    }

    // Verify receipt signature.
    if (!verifier.verify(receipt, action)) {
      app.log.warn({ proposalId: receipt.proposalId, kind: action.kind }, "invalid receipt signature");
      return reply.code(401).send({ error: "invalid ExecutionReceipt signature" });
    }

    // Replay protection.
    if (seenNonces.has(receipt.nonce)) {
      app.log.info({ nonce: receipt.nonce }, "duplicate dispatch — idempotent ack");
      return reply.code(200).send({ ok: true, idempotent: true });
    }
    seenNonces.add(receipt.nonce);

    // Find the registered dispatcher for this kind.
    const fn = (dispatchers as Record<string, ActionDispatcher<DaoActionKind> | undefined>)[action.kind];
    if (!fn) {
      return reply.code(501).send({ error: `handler "${name}" does not implement ${action.kind}` });
    }

    try {
      const result = await fn(action as never, receipt);
      app.log.info(
        { proposalId: receipt.proposalId, kind: action.kind, ok: result.ok },
        "action dispatched"
      );
      if (!result.ok) return reply.code(500).send(result);
      return reply.send(result);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      app.log.error({ err, proposalId: receipt.proposalId, kind: action.kind }, "dispatch threw");
      return reply.code(500).send({ ok: false, error: err });
    }
  });

  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`handler "${name}" listening on :${port}`);

  const shutdown = async (sig: string) => {
    app.log.info(`received ${sig}, shutting down`);
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

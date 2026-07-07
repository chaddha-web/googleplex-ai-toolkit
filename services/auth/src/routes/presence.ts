import type { FastifyInstance } from "fastify";
import { recordPresence, isValidVid } from "../presence.js";

/**
 * POST /auth/presence/ping — public, unauthenticated heartbeat from public
 * pages (landing / signup / login). Intentionally open, but rate-limited per IP
 * (a 25s beacon is ~2.4/min; 40/min leaves headroom for prefetch/retries), and
 * the `vid` must be a UUID. The IP is used only for the offline geoip lookup —
 * never stored (see presence.ts).
 */
export async function presenceRoutes(app: FastifyInstance) {
  app.post(
    "/auth/presence/ping",
    { config: { rateLimit: { max: 40, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = req.body as { vid?: unknown } | undefined;
      if (!body || !isValidVid(body.vid)) return reply.code(400).send({ error: "bad vid" });
      recordPresence(body.vid, req.ip);
      return reply.code(204).send();
    }
  );
}

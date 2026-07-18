import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { walletRoutes } from "./routes.js";
import { startPriceRefresh } from "./prices.js";
import { startDepositScanner } from "./scanner.js";
import { startAutoFlush } from "./auto-flush.js";
import { notify } from "./notify.js";

const PORT = Number(process.env.PORT ?? 4201);
const ORIGINS = (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3001,http://localhost:3010")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = Fastify({
  logger: true,
  trustProxy: true,
  bodyLimit: 64 * 1024
});

// Clean JSON errors — never leak stack traces / internals to clients.
app.setErrorHandler((err, req, reply) => {
  const status = err.statusCode ?? 500;
  if (status >= 500) {
    req.log.error({ err }, "unhandled error");
    notify(`❌ <b>Wallet 5xx</b>\n${req.method} ${req.url}\n${err.message}`);
    return reply.code(500).send({ error: "Internal server error." });
  }
  return reply.code(status).send({ error: err.message || "Request failed." });
});

await app.register(helmet);

await app.register(rateLimit, {
  max: 50,
  timeWindow: "1 minute"
});

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin || ORIGINS.includes(origin) || /^https?:\/\/(.+\.)?ggakingclub\.com$/i.test(origin)) {
      return cb(null, true);
    }
    cb(new Error("Not allowed by CORS"), false);
  },
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Idempotency-Key",
    "X-Idempotency-Key",
    // apps/web injects this on every authedFetch (incl. wallet calls) so the
    // auth service can identify the caller's session. The wallet service
    // ignores it, but the browser still sends it on wallet requests — so it
    // MUST be allow-listed here or the CORS preflight fails and every wallet
    // call dies with "WALLET SERVICE OFFLINE".
    "X-Current-Session"
  ]
});

app.get("/health", async () => ({ ok: true, name: "@googolplex/wallet-service", ts: Date.now() }));

await app.register(walletRoutes);

// Start the live price refresh loop (CoinGecko, 60s, best-effort).
startPriceRefresh();

// Start the background deposit scanner — auto-credits members who deposited
// but never clicked Refresh, so activation isn't stuck on a manual step.
startDepositScanner(app.log);

// Auto-flush: sweep member deposits to treasury once they cross the per-chain
// USD threshold (Admin → Settings). No-op while thresholds are unset.
startAutoFlush();

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`[wallet] listening on http://localhost:${PORT}`);
  notify(`🚀 <b>Wallet service started</b>\nport ${PORT} · pid ${process.pid}`);
} catch (err) {
  app.log.error(err);
  notify(`💥 <b>Wallet service FAILED to start</b>\n${(err as Error).message}`);
  process.exit(1);
}

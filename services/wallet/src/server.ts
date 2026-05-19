import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { walletRoutes } from "./routes.js";

const PORT = Number(process.env.PORT ?? 4201);
const ORIGINS = (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3001,http://localhost:3010")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = Fastify({
  logger: true,
  trustProxy: true
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
    "X-Idempotency-Key"
  ]
});

app.get("/health", async () => ({ ok: true, name: "@googolplex/wallet-service", ts: Date.now() }));

await app.register(walletRoutes);

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`[wallet] listening on http://localhost:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

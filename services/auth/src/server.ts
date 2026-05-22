import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { otpRoutes } from "./routes/otp.js";
import { authRoutes } from "./routes/auth.js";
import { walletRoutes } from "./routes/wallet.js";
import { settingsRoutes } from "./routes/settings.js";
import { communityRoutes } from "./routes/community.js";
import { notify } from "./notify.js";
import { startTelegramBot } from "./telegram-bot.js";

const PORT = Number(process.env.PORT ?? 4200);
const ORIGINS = (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3001,http://localhost:3010")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = Fastify({
  logger: true,
  trustProxy: true,
  // Reject oversized bodies early (OTP/profile payloads are tiny).
  bodyLimit: 64 * 1024
});

await app.register(helmet, { contentSecurityPolicy: false });

// Global IP rate limit. Per-route overrides (stricter on OTP) live on the
// individual routes via their `config.rateLimit`.
await app.register(rateLimit, {
  global: true,
  max: 120,
  timeWindow: "1 minute",
  // Behind Traefik we trust X-Forwarded-For (trustProxy is on).
  keyGenerator: (req) => req.ip
});

// Clean JSON errors — never leak stack traces / internals to clients.
app.setErrorHandler((err, req, reply) => {
  const status = err.statusCode ?? 500;
  if (status >= 500) {
    req.log.error({ err }, "unhandled error");
    notify(`❌ <b>Auth 5xx</b>\n${req.method} ${req.url}\n${err.message}`);
    return reply.code(500).send({ error: "Internal server error." });
  }
  return reply.code(status).send({ error: err.message || "Request failed." });
});

await app.register(cors, {
  origin: (origin, cb) => {
    // Allow same-origin / curl (no Origin header) and any whitelisted origin.
    if (!origin || ORIGINS.includes(origin)) return cb(null, true);
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

app.get("/health", async () => ({ ok: true, name: "@googolplex/auth", ts: Date.now() }));

await app.register(otpRoutes);
await app.register(authRoutes);
await app.register(walletRoutes);
await app.register(settingsRoutes);
await app.register(communityRoutes);

// Interactive Telegram command bot (/usage, /count, /paid, /stats).
startTelegramBot();

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`[auth] listening on http://localhost:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

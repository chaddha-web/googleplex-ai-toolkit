import Fastify from "fastify";
import cors from "@fastify/cors";
import { otpRoutes } from "./routes/otp.js";
import { authRoutes } from "./routes/auth.js";
import { walletRoutes } from "./routes/wallet.js";

const PORT = Number(process.env.PORT ?? 4200);
const ORIGINS = (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3001,http://localhost:3010")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = Fastify({
  logger: true,
  trustProxy: true
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

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`[auth] listening on http://localhost:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

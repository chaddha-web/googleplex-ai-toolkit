import type { FastifyInstance } from "fastify";
import { stmts } from "../db.js";
import { verifyAccessToken } from "../jwt.js";
import { encryptSecret, decryptSecret, maskSecret } from "../crypto.js";
import { notify } from "../notify.js";

const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;

// Founder = the only account allowed to promote new admins. Defaults to the
// first entry in ADMIN_EMAILS if FOUNDER_EMAIL isn't set.
const FOUNDER_EMAIL = (
  process.env.FOUNDER_EMAIL ||
  (process.env.ADMIN_EMAILS ?? "").split(",")[0] ||
  ""
)
  .trim()
  .toLowerCase();

// Allowlist of configurable keys. Secrets are encrypted at rest + masked.
const NONSECRET_KEYS = new Set([
  "ai.active_provider",
  "ai.fallback_order",
  "ai.model.anthropic",
  "ai.model.openai",
  "ai.model.gemini",
  "wallet.eth.address",
  "wallet.bsc.address",
  "wallet.tron.address",
  "wallet.btc.address",
  // Min PARTY tokens a member must hold to cast community votes.
  "community.vote_min_party"
]);
const SECRET_KEYS = new Set([
  "ai.key.anthropic",
  "ai.key.openai",
  "ai.key.gemini",
  "wallet.eth.privkey",
  "wallet.bsc.privkey",
  "wallet.tron.privkey",
  "wallet.btc.privkey"
]);

function isSecret(key: string): boolean {
  return SECRET_KEYS.has(key);
}
function isAllowed(key: string): boolean {
  return NONSECRET_KEYS.has(key) || SECRET_KEYS.has(key);
}

/** Read a setting's plaintext value (decrypts secrets). null if unset. */
function readValue(key: string): string | null {
  const row = stmts.settings.get.get(key);
  if (!row || row.value == null) return null;
  if (row.is_secret) {
    try {
      return decryptSecret(row.value);
    } catch {
      return null;
    }
  }
  return row.value;
}

function setValue(key: string, value: string): void {
  const secret = isSecret(key);
  stmts.settings.upsert.run({
    key,
    value: secret ? encryptSecret(value) : value,
    is_secret: secret ? 1 : 0,
    updated_at: Date.now()
  });
}

export async function settingsRoutes(app: FastifyInstance) {
  const requireInternal = (req: any, reply: any) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!INTERNAL_TOKEN || token !== INTERNAL_TOKEN) {
      reply.code(401).send({ error: "Invalid internal token." });
      return false;
    }
    return true;
  };

  const requireAdmin = async (req: any, reply: any) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      reply.code(401).send({ error: "Missing bearer token." });
      return null;
    }
    const claims = await verifyAccessToken(header.slice(7).trim());
    if (!claims) {
      reply.code(401).send({ error: "Invalid or expired token." });
      return null;
    }
    const user = stmts.user.byId.get(claims.sub);
    if (!user || user.role !== "admin") {
      reply.code(403).send({ error: "Admin access required." });
      return null;
    }
    return user;
  };

  // ── Admin: read all settings (secrets masked) ──────────────────────────
  app.get("/auth/admin/settings", async (req, reply) => {
    const me = await requireAdmin(req, reply);
    if (!me) return;

    const out: Record<string, unknown> = {};
    for (const key of NONSECRET_KEYS) {
      out[key] = readValue(key) ?? "";
    }
    for (const key of SECRET_KEYS) {
      const v = readValue(key);
      out[key] = { set: !!v, masked: v ? maskSecret(v) : "" };
    }
    return reply.send({
      ok: true,
      settings: out,
      isFounder: me.email.toLowerCase() === FOUNDER_EMAIL
    });
  });

  // ── Admin: set a setting ───────────────────────────────────────────────
  app.post("/auth/admin/settings", async (req, reply) => {
    const me = await requireAdmin(req, reply);
    if (!me) return;

    const body = (req.body ?? {}) as { key?: unknown; value?: unknown };
    const key = typeof body.key === "string" ? body.key : "";
    const value = typeof body.value === "string" ? body.value : "";
    if (!isAllowed(key)) return reply.code(400).send({ error: "Unknown setting key." });

    // Empty value clears the setting (lets you wipe a key).
    if (value === "") {
      stmts.settings.delete.run(key);
      return reply.send({ ok: true, cleared: true });
    }
    setValue(key, value);
    return reply.send({ ok: true });
  });

  // ── Founder only: promote a user to admin by member ID (code11) ────────
  app.post("/auth/admin/promote", async (req, reply) => {
    const me = await requireAdmin(req, reply);
    if (!me) return;
    if (me.email.toLowerCase() !== FOUNDER_EMAIL) {
      return reply.code(403).send({ error: "Only the founder admin can promote." });
    }
    const body = (req.body ?? {}) as { code11?: unknown };
    const code11 = typeof body.code11 === "string" ? body.code11.trim() : "";
    if (!code11) return reply.code(400).send({ error: "Member ID required." });

    const target = stmts.user.byCode.get(code11);
    if (!target) return reply.code(404).send({ error: "No member with that ID." });
    if (target.role === "admin") {
      return reply.send({ ok: true, alreadyAdmin: true, email: target.email });
    }
    stmts.user.promoteByCode.run({ code11, updated_at: Date.now() });
    notify(`👑 <b>New admin</b>\n${target.email}\nID: <code>${code11}</code> (by ${me.email})`);
    return reply.send({ ok: true, email: target.email });
  });

  // ── Public: non-sensitive client config (no auth) ──────────────────────
  app.get("/auth/public-config", async (_req, reply) => {
    return reply.send({
      communityVoteMinParty: Number(readValue("community.vote_min_party") ?? 0) || 0
    });
  });

  // ── Internal: AI config (decrypted) for the landing assistant ──────────
  app.get("/internal/settings/ai", async (req, reply) => {
    if (!requireInternal(req, reply)) return;
    const order = (readValue("ai.fallback_order") || "anthropic,openai,gemini")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const providers: Record<string, { model: string | null; key: string | null }> = {};
    for (const p of ["anthropic", "openai", "gemini"]) {
      providers[p] = {
        model: readValue(`ai.model.${p}`),
        key: readValue(`ai.key.${p}`)
      };
    }
    return reply.send({
      activeProvider: readValue("ai.active_provider") || "anthropic",
      fallbackOrder: order,
      providers
    });
  });

  // ── Internal: per-chain imported wallet keys (decrypted) for wallet svc ─
  app.get("/internal/settings/wallet", async (req, reply) => {
    if (!requireInternal(req, reply)) return;
    const chains = ["eth", "bsc", "tron", "btc"] as const;
    const out: Record<string, { address: string | null; privkey: string | null }> = {};
    for (const c of chains) {
      out[c] = {
        address: readValue(`wallet.${c}.address`),
        privkey: readValue(`wallet.${c}.privkey`)
      };
    }
    return reply.send(out);
  });
}

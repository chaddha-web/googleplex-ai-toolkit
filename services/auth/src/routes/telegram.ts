/**
 * Per-admin Telegram alerts.
 *
 * Linking flow, which is shaped by a hard Telegram constraint: a bot cannot
 * message someone who has never opened a chat with it. So we don't try to
 * "register" an id — we prove it:
 *
 *   1. The admin sends /start to the bot, which replies with their numeric id.
 *   2. They paste that id here.
 *   3. We send a test message. If Telegram accepts it, the link is real and we
 *      mark it verified. If it refuses, we say exactly what to do about it.
 *
 * That means a saved link is always a working link — there is no state where an
 * admin believes they're subscribed but nothing can reach them.
 */

import type { FastifyInstance } from "fastify";
import { stmts } from "../db.js";
import { requireAdmin, requireInternal } from "../guard.js";
import { isFounder } from "../permissions.js";
import { recordAudit } from "../audit.js";
import { notify, opsChatConfigured, sendTelegram } from "../notify.js";
import {
  TOPIC_LABELS,
  allowedTopics,
  clampTopics,
  isTopic,
  parseTopics,
  serializeTopics
} from "../notify-topics.js";

/** Telegram numeric ids; negative for groups. Nothing else is plausible. */
const CHAT_ID_RE = /^-?\d{5,20}$/;

function statusFor(user: any) {
  const founder = isFounder(user.email);
  const allowed = allowedTopics(founder);
  // The founder IS the ops channel, which already receives every topic. Saying
  // "you're not receiving alerts" to the one person who receives all of them
  // would be a lie, so surface that as coverage in its own right — they only
  // need a personal link if they want per-topic control.
  const coveredByOps = founder && opsChatConfigured();
  return {
    chatId: user.telegram_chat_id ?? null,
    verifiedAt: user.telegram_verified_at ?? null,
    topics: clampTopics(parseTopics(user.telegram_topics), founder),
    allowedTopics: allowed,
    labels: Object.fromEntries(allowed.map((t) => [t, TOPIC_LABELS[t]])),
    isFounder: founder,
    /** Already receiving everything via TELEGRAM_CHAT_ID, link or no link. */
    coveredByOps,
    botUsername: process.env.TELEGRAM_BOT_USERNAME || null
  };
}

export async function telegramRoutes(app: FastifyInstance) {
  // ── My link status ───────────────────────────────────────────────────────
  app.get("/auth/admin/telegram", async (req: any, reply) => {
    const me = await requireAdmin(req, reply);
    if (!me) return;
    return reply.send({ ok: true, ...statusFor(me) });
  });

  // ── Link (and verify by actually delivering a message) ───────────────────
  app.post("/auth/admin/telegram", async (req: any, reply) => {
    const me = await requireAdmin(req, reply);
    if (!me) return;

    const chatId = String((req.body as any)?.chatId ?? "").trim();
    if (!CHAT_ID_RE.test(chatId)) {
      return reply.code(400).send({
        error: "That doesn't look like a Telegram ID. Send /start to the bot and paste the number it replies with."
      });
    }

    const founder = isFounder(me.email);
    // Default a fresh link to everything they're allowed — the point of linking
    // is to receive something, and an empty subscription is a silent no-op.
    const requested = (req.body as any)?.topics;
    const topics = Array.isArray(requested)
      ? clampTopics(requested, founder)
      : allowedTopics(founder);

    const probe = await sendTelegram(
      chatId,
      "✅ <b>Alerts linked</b>\nThis chat will now receive GoogolPlex notifications."
    );
    if (!probe.ok) {
      const hint = /chat not found|bot can'?t initiate|blocked|forbidden/i.test(probe.error ?? "")
        ? "Open Telegram, send /start to the bot, then try again — a bot can't message you until you've started the chat."
        : probe.error;
      return reply.code(400).send({ error: `Couldn't reach that Telegram ID. ${hint}` });
    }

    const now = Date.now();
    stmts.user.setTelegram.run({
      id: me.id,
      telegram_chat_id: chatId,
      telegram_verified_at: now,
      telegram_topics: serializeTopics(topics),
      updated_at: now
    });
    recordAudit({
      actorId: me.id,
      actorEmail: me.email,
      action: "telegram.link",
      targetLabel: chatId,
      detail: { topics }
    });

    const fresh = stmts.user.byId.get(me.id)!;
    return reply.send({ ok: true, ...statusFor(fresh) });
  });

  // ── Change which topics I receive ────────────────────────────────────────
  app.post("/auth/admin/telegram/topics", async (req: any, reply) => {
    const me = await requireAdmin(req, reply);
    if (!me) return;
    if (!me.telegram_chat_id || !me.telegram_verified_at) {
      return reply.code(400).send({ error: "Link your Telegram first." });
    }
    const raw = (req.body as any)?.topics;
    if (!Array.isArray(raw) || raw.some((t: unknown) => !isTopic(t))) {
      return reply.code(400).send({ error: "Send a list of valid topics." });
    }
    const founder = isFounder(me.email);
    // clampTopics silently drops anything a sub-admin may not have. Tell them
    // rather than quietly saving less than they asked for.
    const topics = clampTopics(raw, founder);
    if (topics.length !== new Set(raw).size) {
      return reply.code(403).send({
        error: "Some of those alerts are reserved for the main admin.",
        topics
      });
    }

    stmts.user.setTelegramTopics.run({
      id: me.id,
      telegram_topics: serializeTopics(topics),
      updated_at: Date.now()
    });
    const fresh = stmts.user.byId.get(me.id)!;
    return reply.send({ ok: true, ...statusFor(fresh) });
  });

  // ── Send myself a test ───────────────────────────────────────────────────
  app.post("/auth/admin/telegram/test", async (req: any, reply) => {
    const me = await requireAdmin(req, reply);
    if (!me) return;
    if (!me.telegram_chat_id) return reply.code(400).send({ error: "Link your Telegram first." });
    const r = await sendTelegram(
      me.telegram_chat_id,
      "🔔 <b>Test alert</b>\nIf you can read this, your GoogolPlex alerts are working."
    );
    if (!r.ok) return reply.code(400).send({ error: r.error });
    return reply.send({ ok: true });
  });

  // ── Unlink ───────────────────────────────────────────────────────────────
  app.delete("/auth/admin/telegram", async (req: any, reply) => {
    const me = await requireAdmin(req, reply);
    if (!me) return;
    stmts.user.clearTelegram.run({ id: me.id, updated_at: Date.now() });
    recordAudit({ actorId: me.id, actorEmail: me.email, action: "telegram.unlink" });
    const fresh = stmts.user.byId.get(me.id)!;
    return reply.send({ ok: true, ...statusFor(fresh) });
  });

  // ── Internal: let the wallet service broadcast through the same fan-out ──
  app.post("/internal/notify", async (req: any, reply) => {
    if (!requireInternal(req, reply)) return;
    const text = String((req.body as any)?.text ?? "");
    const topicRaw = (req.body as any)?.topic;
    if (!text) return reply.code(400).send({ error: "text is required." });
    notify(text, isTopic(topicRaw) ? topicRaw : "system");
    return reply.send({ ok: true });
  });
}

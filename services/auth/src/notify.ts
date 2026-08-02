/**
 * Telegram ops notifications.
 *
 * Two delivery paths, both fire-and-forget:
 *
 *  1. The ops channel (TELEGRAM_CHAT_ID). Unchanged — it still receives
 *     everything, so nothing that worked before goes quiet.
 *  2. Individual admins who have linked and verified their own Telegram and
 *     subscribed to the topic. The founder may subscribe to anything; a
 *     sub-admin is capped to signup / login / withdrawal (see notify-topics.ts).
 *
 * Never throws and never blocks a request — call without awaiting. A failed
 * send is swallowed: an alert going missing must never break the action that
 * triggered it.
 */

import { db } from "./db.js";
import { isFounder } from "./permissions.js";
import { clampTopics, parseTopics, type Topic } from "./notify-topics.js";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPS_CHAT = process.env.TELEGRAM_CHAT_ID;

/** Is the shared ops channel configured? It receives every topic, always. */
export function opsChatConfigured(): boolean {
  return !!TOKEN && !!OPS_CHAT;
}

/** Low-level send. Resolves to true only if Telegram accepted the message. */
export async function sendTelegram(chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!TOKEN) return { ok: false, error: "The Telegram bot token is not configured on the server." };
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true
      })
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (res.ok && body.ok) return { ok: true };
    return { ok: false, error: body.description || `Telegram rejected the message (${res.status}).` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Admins who should receive `topic` on their own Telegram. Reads the cap from
 * clampTopics rather than trusting the stored row, so a subscription made while
 * someone was founder — or written directly — can't outlive their permissions.
 */
function recipientsFor(topic: Topic): string[] {
  try {
    const rows = db
      .prepare(
        `SELECT email, telegram_chat_id, telegram_topics
           FROM users
          WHERE role = 'admin'
            AND telegram_chat_id IS NOT NULL
            AND telegram_verified_at IS NOT NULL`
      )
      .all() as Array<{ email: string; telegram_chat_id: string; telegram_topics: string | null }>;

    const out: string[] = [];
    for (const r of rows) {
      const subscribed = clampTopics(parseTopics(r.telegram_topics), isFounder(r.email));
      if (subscribed.includes(topic)) out.push(r.telegram_chat_id);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Send an ops notification. `topic` decides which admins also get it
 * personally; the ops channel gets everything regardless.
 */
export function notify(text: string, topic: Topic = "system"): void {
  const seen = new Set<string>();

  if (OPS_CHAT) {
    seen.add(OPS_CHAT);
    void sendTelegram(OPS_CHAT, text);
  }

  for (const chat of recipientsFor(topic)) {
    // The founder is usually the ops channel too — don't send twice.
    if (seen.has(chat)) continue;
    seen.add(chat);
    void sendTelegram(chat, text);
  }
}

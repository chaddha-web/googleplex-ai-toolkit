/**
 * Telegram ops notifications.
 *
 * Routed through the auth service (`POST /internal/notify`) so there is ONE
 * fan-out implementation: auth owns the users table and therefore knows which
 * admins have linked their Telegram and which topics they may receive.
 * Duplicating that here would mean the wallet's alerts — the withdrawal ones
 * admins most need — silently ignored those subscriptions.
 *
 * If auth can't be reached we fall back to the ops channel directly, so a
 * withdrawal alert never disappears just because auth is restarting.
 *
 * Fire-and-forget: never throws, never blocks the request path.
 */

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPS_CHAT = process.env.TELEGRAM_CHAT_ID;
const AUTH_BASE = (process.env.AUTH_BASE_URL || "http://auth:4200").replace(/\/$/, "");
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;

/** Keep in step with services/auth/src/notify-topics.ts. */
export type Topic =
  | "signup"
  | "login"
  | "withdrawal"
  | "money"
  | "members"
  | "admin"
  | "content"
  | "settings"
  | "system";

function sendDirect(text: string): void {
  if (!TOKEN || !OPS_CHAT) return;
  fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: OPS_CHAT,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  }).catch(() => {});
}

export function notify(text: string, topic: Topic = "system"): void {
  if (!INTERNAL_TOKEN) {
    sendDirect(text);
    return;
  }
  fetch(`${AUTH_BASE}/internal/notify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${INTERNAL_TOKEN}`
    },
    body: JSON.stringify({ text, topic })
  })
    .then((res) => {
      if (!res.ok) sendDirect(text);
    })
    .catch(() => sendDirect(text));
}

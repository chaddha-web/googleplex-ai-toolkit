/**
 * Telegram ops notifications. No-ops unless TELEGRAM_BOT_TOKEN +
 * TELEGRAM_CHAT_ID are set. Fire-and-forget — never throws, never blocks the
 * request path (call without awaiting).
 */

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;

export function notify(text: string): void {
  if (!TOKEN || !CHAT) return;
  fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  }).catch(() => {});
}

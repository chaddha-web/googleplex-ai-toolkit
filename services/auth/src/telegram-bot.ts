/**
 * Interactive Telegram command bot (long-poll). Only responds to the
 * configured TELEGRAM_CHAT_ID (owner). No-op unless token + chat are set.
 *
 * Commands:
 *   /stats  — server uptime/usage + user counts (total, signups today,
 *             paid-$1/active, awaiting $1, studio unlocked, tokens minted)
 *   /help   — list commands
 */

import os from "node:os";
import { db } from "./db.js";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;
const API = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : "";

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function count(sql: string, ...params: unknown[]): number {
  return (db.prepare(sql).get(...params) as { c: number }).c;
}

function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return [d ? `${d}d` : "", h ? `${h}h` : "", `${m}m`].filter(Boolean).join(" ");
}

function gb(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1);
}

/** 🖥 Server uptime + resource usage (real host values via /proc). */
function usageText(): string {
  const load = os.loadavg().map((n) => n.toFixed(2)).join(" ");
  const memUsed = gb(os.totalmem() - os.freemem());
  const memTotal = gb(os.totalmem());
  const memPct = ((1 - os.freemem() / os.totalmem()) * 100).toFixed(0);
  return (
    `🖥 <b>Server usage</b>\n` +
    `⏱ Uptime: ${fmtUptime(os.uptime())}\n` +
    `📈 Load (1/5/15m): ${load}\n` +
    `🧠 Mem: ${memUsed} / ${memTotal} GB (${memPct}%)\n` +
    `🧩 CPUs: ${os.cpus().length}`
  );
}

/** 👥 Total user count + signup activity. */
function countText(): string {
  const total = count("SELECT COUNT(*) c FROM users");
  const today = count("SELECT COUNT(*) c FROM users WHERE created_at >= ?", startOfTodayMs());
  const week = count("SELECT COUNT(*) c FROM users WHERE created_at >= ?", Date.now() - 7 * 86400000);
  const admins = count("SELECT COUNT(*) c FROM users WHERE role = 'admin'");
  const profile = count("SELECT COUNT(*) c FROM users WHERE profile_completed_at IS NOT NULL");
  return (
    `👥 <b>Users</b>\n` +
    `Total: <b>${total}</b>  (admins: ${admins})\n` +
    `🆕 Signups today: <b>${today}</b>\n` +
    `📅 Signups (7d): ${week}\n` +
    `📝 Profile complete: ${profile}`
  );
}

/** 💵 Paid $1 (activated) users + downstream paid actions. */
function paidText(): string {
  const active = count("SELECT COUNT(*) c FROM users WHERE wallet_status = 'active'");
  const awaiting = count("SELECT COUNT(*) c FROM users WHERE wallet_status = 'pending_initial_deposit'");
  const noPwd = count("SELECT COUNT(*) c FROM users WHERE wallet_status = 'pending_password'");
  const studio = count("SELECT COUNT(*) c FROM users WHERE studio_unlocked_at IS NOT NULL");
  const credited = (
    db.prepare("SELECT COALESCE(SUM(initial_deposit_credited_usd),0) s FROM users").get() as { s: number }
  ).s;
  const tokens = (db.prepare("SELECT COALESCE(SUM(tokens_minted),0) s FROM users").get() as { s: number }).s;
  return (
    `💵 <b>Paid users</b>\n` +
    `Paid $1 (active): <b>${active}</b>\n` +
    `⏳ Awaiting $1: ${awaiting}\n` +
    `🔐 No wallet password yet: ${noPwd}\n` +
    `🎬 Studio unlocked ($18): ${studio}\n` +
    `💰 Total $ credited: $${Number(credited).toFixed(2)}\n` +
    `🪙 Tokens minted: ${Number(tokens).toLocaleString()}`
  );
}

function statsText(): string {
  return `${usageText()}\n\n${countText()}\n\n${paidText()}`;
}

const HELP =
  "🤖 <b>GoogolPlex ops bot</b>\n\n" +
  "/usage — server uptime + memory/load\n" +
  "/count — total users + signups\n" +
  "/paid — paid $1 / active / studio users\n" +
  "/stats — everything at once\n" +
  "/help — this message\n\n" +
  "You also get automatic alerts: deploys, new signups, wallet activations, withdrawals, Studio unlocks, and errors.";

async function send(text: string): Promise<void> {
  try {
    await fetch(`${API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true
      })
    });
  } catch {
    /* best-effort */
  }
}

let offset = 0;

async function poll(): Promise<void> {
  try {
    const res = await fetch(`${API}/getUpdates?timeout=30&offset=${offset}`);
    const data = (await res.json()) as {
      result?: Array<{ update_id: number; message?: { chat?: { id: number }; text?: string } }>;
    };
    for (const u of data.result ?? []) {
      offset = u.update_id + 1;
      const msg = u.message;
      // Only the configured owner chat may issue commands.
      if (!msg || String(msg.chat?.id) !== String(CHAT)) continue;
      const cmd = (msg.text ?? "").trim().toLowerCase().split("@")[0];
      try {
        if (cmd === "/usage") await send(usageText());
        else if (cmd === "/count" || cmd === "/users") await send(countText());
        else if (cmd === "/paid") await send(paidText());
        else if (cmd === "/stats") await send(statsText());
        else if (cmd === "/help" || cmd === "/start") await send(HELP);
      } catch {
        await send("Couldn't read that right now — try again.");
      }
    }
  } catch {
    // Network hiccup — back off briefly before the next poll.
    await new Promise((r) => setTimeout(r, 3000));
  }
  setTimeout(poll, 500);
}

/** Start the long-poll command loop (idempotent; no-op without creds). */
let started = false;
export function startTelegramBot(): void {
  if (started || !TOKEN || !CHAT) return;
  started = true;
  void poll();
}

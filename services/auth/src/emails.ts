/**
 * Branded transactional emails. One shared shell (logo header + footer),
 * distinct templates per lifecycle event, and per-type sender addresses:
 *
 *   signup@ggakingclub.com    — signup verification ("Welcome onboard")
 *   login@ggakingclub.com     — login verification
 *   no-reply@ggakingclub.com  — everything else (welcome, wallet active,
 *                               deposit, withdrawal, Seva Credit)
 *
 * Every email carries the GoogolPlex logo. All sends are best-effort: in dev
 * (no RESEND_API_KEY) they log instead of throwing, and callers wrap sends in
 * try/catch so email never blocks the core flow.
 */

import { Resend } from "resend";
import { recordOutbound } from "./db.js";

const DOMAIN = "ggakingclub.com";
const BRAND = "GoogolPlex";
const APP_URL = process.env.WEB_APP_URL || "https://app.ggakingclub.com";
const LOGO_URL = process.env.EMAIL_LOGO_URL || "https://ggakingclub.com/media/logo.png";

export const FROM = {
  signup: `${BRAND} <signup@${DOMAIN}>`,
  login: `${BRAND} <login@${DOMAIN}>`,
  noreply: `${BRAND} <no-reply@${DOMAIN}>`
} as const;

// ── Shared shell ────────────────────────────────────────────────────────────
function shell(opts: {
  preheader?: string;
  heading: string;
  body: string; // inner HTML (already escaped where needed)
  cta?: { label: string; url: string };
  footerNote?: string;
}): string {
  const { preheader = "", heading, body, cta, footerNote } = opts;
  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#0a0a0a;font-family:Inter,system-ui,-apple-system,sans-serif;color:#fff;">
    <span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#111;border-radius:24px;padding:40px 32px;">
          <tr><td align="center" style="padding-bottom:24px;">
            <img src="${LOGO_URL}" alt="${BRAND}" width="48" height="48" style="display:block;border-radius:12px;object-fit:contain;" />
            <div style="font-size:12px;letter-spacing:0.3em;text-transform:uppercase;color:rgba(255,255,255,0.45);margin-top:12px;">${BRAND}</div>
          </td></tr>
          <tr><td>
            <h1 style="margin:0 0 16px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:30px;line-height:1.18;color:#fff;text-align:center;">${heading}</h1>
            ${body}
            ${
              cta
                ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 8px;"><tr><td style="border-radius:999px;background:#fff;">
                     <a href="${cta.url}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;color:#000;text-decoration:none;border-radius:999px;">${cta.label}</a>
                   </td></tr></table>`
                : ""
            }
            ${footerNote ? `<p style="margin:24px 0 0 0;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.4);text-align:center;">${footerNote}</p>` : ""}
          </td></tr>
        </table>
        <p style="margin:24px 0 0 0;font-size:11px;line-height:1.6;color:rgba(255,255,255,0.3);text-align:center;max-width:520px;">© 2026 ${BRAND} · ggakingclub.com</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

const P = (html: string) =>
  `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:rgba(255,255,255,0.8);">${html}</p>`;

function codeBlock(code: string): string {
  return `<div style="font-size:42px;letter-spacing:12px;font-weight:600;color:#fff;background:#1a1a1a;border-radius:16px;padding:22px;margin:24px 0;text-align:center;">${code}</div>`;
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:10px 0;font-size:13px;color:rgba(255,255,255,0.5);border-bottom:1px solid rgba(255,255,255,0.06);">${label}</td>
    <td style="padding:10px 0;font-size:13px;color:#fff;text-align:right;border-bottom:1px solid rgba(255,255,255,0.06);word-break:break-all;">${value}</td>
  </tr>`;
}
function detailTable(rows: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">${rows}</table>`;
}

// ── Low-level deliver ───────────────────────────────────────────────────────
async function deliver(opts: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.log(`[dev email] ${opts.from} → ${opts.to} · ${opts.subject}`);
    recordOutbound({ ...opts, status: "dev" });
    return;
  }
  const resend = new Resend(apiKey);
  try {
    const res = await resend.emails.send({
      from: opts.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text
    });
    if ((res as any)?.error) throw new Error((res as any).error.message || "Resend error");
    recordOutbound({ ...opts, resendId: (res as any)?.data?.id, status: "sent" });
  } catch (e) {
    recordOutbound({ ...opts, status: "failed", error: (e as Error).message });
    throw e;
  }
}

// ── Templates ───────────────────────────────────────────────────────────────

/** Signup verification — from signup@, welcoming tone. */
export async function sendSignupOtp(opts: { to: string; code: string; firstName?: string | null }): Promise<void> {
  const hi = opts.firstName ? `Welcome, ${opts.firstName}` : "Welcome";
  const html = shell({
    preheader: "Your GoogolPlex sign-up code",
    heading: "Welcome onboard",
    body:
      P(`${hi} — you're moments away from joining GoogolPlex.`) +
      P("Enter this code to verify your email and create your account:") +
      codeBlock(opts.code) +
      P('<span style="color:rgba(255,255,255,0.5);font-size:13px;">This code expires in 10 minutes. If you didn\'t request it, you can ignore this email.</span>'),
    footerNote: "You're receiving this because someone signed up with this email at ggakingclub.com."
  });
  const text = `${hi} — welcome to GoogolPlex.\n\nYour sign-up code is ${opts.code}. It expires in 10 minutes.\n\nIf you didn't request this, ignore this email.\n\n— GoogolPlex`;
  await deliver({ from: FROM.signup, to: opts.to, subject: "Welcome onboard — verify your email", html, text });
}

/** Login verification — from login@. */
export async function sendLoginOtp(opts: { to: string; code: string }): Promise<void> {
  const html = shell({
    preheader: "Your GoogolPlex login code",
    heading: "Your login code",
    body:
      P("Use this code to sign in to your GoogolPlex account:") +
      codeBlock(opts.code) +
      P('<span style="color:rgba(255,255,255,0.5);font-size:13px;">This code expires in 10 minutes. If this wasn\'t you, secure your account and ignore this email.</span>'),
    footerNote: "A sign-in to your account was requested at ggakingclub.com."
  });
  const text = `Your GoogolPlex login code is ${opts.code}. It expires in 10 minutes.\n\nIf this wasn't you, ignore this email.\n\n— GoogolPlex`;
  await deliver({ from: FROM.login, to: opts.to, subject: "Your GoogolPlex login code", html, text });
}

/** Wallet verification code — confirms wallet password setup. from no-reply@. */
export async function sendWalletOtp(opts: { to: string; code: string }): Promise<void> {
  const html = shell({
    preheader: "Your GoogolPlex wallet verification code",
    heading: "Verify your wallet",
    body:
      P("You're setting the password that protects your GoogolPlex wallet. Enter this code to confirm:") +
      codeBlock(opts.code) +
      P('<span style="color:rgba(255,255,255,0.5);font-size:13px;">This code expires in 10 minutes. If this wasn\'t you, do not share it — secure your account and ignore this email.</span>'),
    footerNote: "Wallet verification was requested at ggakingclub.com."
  });
  const text = `Your GoogolPlex wallet verification code is ${opts.code}. It expires in 10 minutes.\n\nIf this wasn't you, ignore this email.\n\n— GoogolPlex`;
  await deliver({ from: FROM.noreply, to: opts.to, subject: "Your GoogolPlex wallet code", html, text });
}

/** Welcome email — after the account is created. from no-reply@. */
export async function sendWelcomeEmail(opts: { to: string; firstName?: string | null; memberId: string }): Promise<void> {
  const hi = opts.firstName ? opts.firstName : "there";
  const html = shell({
    preheader: "Welcome to GoogolPlex",
    heading: "You're in.",
    body:
      P(`Hi ${hi}, your GoogolPlex account is ready.`) +
      P("Your member ID:") +
      `<div style="font-family:Menlo,Consolas,monospace;font-size:18px;letter-spacing:4px;color:#fff;background:#1a1a1a;border-radius:12px;padding:16px;margin:8px 0 20px;text-align:center;">${opts.memberId}</div>` +
      P("Next: activate your wallet with a $1 deposit to unlock Community, the AI Studio, and your GoogolPlex Seva Credit."),
    cta: { label: "Open your dashboard", url: APP_URL },
    footerNote: "Welcome aboard — we're glad you're here."
  });
  const text = `Hi ${hi}, welcome to GoogolPlex.\n\nYour member ID: ${opts.memberId}\n\nNext: activate your wallet with a $1 deposit to unlock everything.\n\nOpen your dashboard: ${APP_URL}\n\n— GoogolPlex`;
  await deliver({ from: FROM.noreply, to: opts.to, subject: "Welcome to GoogolPlex", html, text });
}

/** Wallet activated — the $1 cleared. from no-reply@. */
export async function sendWalletActivatedEmail(opts: { to: string; firstName?: string | null; creditedUsd: number }): Promise<void> {
  const hi = opts.firstName ? opts.firstName : "there";
  const html = shell({
    preheader: "Your wallet is active",
    heading: "Wallet activated",
    body:
      P(`Hi ${hi}, your $${opts.creditedUsd.toFixed(2)} activation deposit has cleared and your wallet is now active.`) +
      P("Community, the AI Studio, and your GoogolPlex Seva Credit are unlocked. Head to your dashboard to generate your Seva Credit."),
    cta: { label: "Go to wallet", url: `${APP_URL}/wallet` },
    footerNote: "This is a confirmation of activity on your account."
  });
  const text = `Hi ${hi}, your $${opts.creditedUsd.toFixed(2)} activation deposit cleared — your wallet is active.\n\nCommunity, the AI Studio, and your Seva Credit are unlocked.\n\n${APP_URL}/wallet\n\n— GoogolPlex`;
  await deliver({ from: FROM.noreply, to: opts.to, subject: "Your GoogolPlex wallet is active", html, text });
}

/** Incoming deposit. from no-reply@. */
export async function sendDepositEmail(opts: {
  to: string;
  firstName?: string | null;
  amount: string; // human-readable
  symbol: string;
  chain: string;
  usd?: number | null;
  txHash?: string | null;
}): Promise<void> {
  const hi = opts.firstName ? opts.firstName : "there";
  const rows =
    detailRow("Amount", `${opts.amount} ${opts.symbol}`) +
    (opts.usd != null ? detailRow("Value", `$${opts.usd.toFixed(2)}`) : "") +
    detailRow("Network", opts.chain.toUpperCase()) +
    detailRow("Status", '<span style="color:#34d399;">Confirmed</span>') +
    (opts.txHash ? detailRow("Transaction", opts.txHash) : "");
  const html = shell({
    preheader: `Received ${opts.amount} ${opts.symbol}`,
    heading: "Deposit received",
    body: P(`Hi ${hi}, we received a deposit into your GoogolPlex wallet.`) + detailTable(rows),
    cta: { label: "View in wallet", url: `${APP_URL}/wallet` },
    footerNote: "This is a confirmation of activity on your account."
  });
  const text = `Hi ${hi}, you received ${opts.amount} ${opts.symbol} on ${opts.chain.toUpperCase()}.${opts.txHash ? `\nTx: ${opts.txHash}` : ""}\n\n${APP_URL}/wallet\n\n— GoogolPlex`;
  await deliver({ from: FROM.noreply, to: opts.to, subject: `Deposit received — ${opts.amount} ${opts.symbol}`, html, text });
}

/** Outgoing withdrawal. from no-reply@. */
export async function sendWithdrawalEmail(opts: {
  to: string;
  firstName?: string | null;
  amount: string;
  symbol: string;
  chain: string;
  dest?: string | null;
  txHash?: string | null;
}): Promise<void> {
  const hi = opts.firstName ? opts.firstName : "there";
  const rows =
    detailRow("Amount", `${opts.amount} ${opts.symbol}`) +
    detailRow("Network", opts.chain.toUpperCase()) +
    (opts.dest ? detailRow("To", opts.dest) : "") +
    detailRow("Status", '<span style="color:#34d399;">Sent</span>') +
    (opts.txHash ? detailRow("Transaction", opts.txHash) : "");
  const html = shell({
    preheader: `Sent ${opts.amount} ${opts.symbol}`,
    heading: "Withdrawal sent",
    body:
      P(`Hi ${hi}, a withdrawal from your GoogolPlex wallet has been sent.`) +
      detailTable(rows) +
      P('<span style="color:rgba(255,255,255,0.5);font-size:13px;">If you didn\'t authorize this, contact support immediately.</span>'),
    cta: { label: "View in wallet", url: `${APP_URL}/wallet` },
    footerNote: "This is a confirmation of activity on your account."
  });
  const text = `Hi ${hi}, ${opts.amount} ${opts.symbol} was sent from your wallet on ${opts.chain.toUpperCase()}.${opts.dest ? `\nTo: ${opts.dest}` : ""}${opts.txHash ? `\nTx: ${opts.txHash}` : ""}\n\nIf you didn't authorize this, contact support immediately.\n\n— GoogolPlex`;
  await deliver({ from: FROM.noreply, to: opts.to, subject: `Withdrawal sent — ${opts.amount} ${opts.symbol}`, html, text });
}

/** Seva Credit generated (compliance confirmation). from no-reply@. */
export async function sendSevaCreditEmail(opts: { to: string; firstName?: string | null; memberId: string; amount: number }): Promise<void> {
  const hi = opts.firstName ? opts.firstName : "there";
  const rows =
    detailRow("Credits issued", opts.amount.toLocaleString()) +
    detailRow("Member ID", opts.memberId) +
    detailRow("Backed by", "Your $1 protected liquidity") +
    detailRow("Status", '<span style="color:#34d399;">Issued</span>');
  const html = shell({
    preheader: "Your GoogolPlex Seva Credit has been issued",
    heading: "Seva Credit issued",
    body:
      P(`Hi ${hi}, your GoogolPlex Seva Credit has been generated and recorded against your protected $1 deposit.`) +
      detailTable(rows) +
      P('<span style="color:rgba(255,255,255,0.5);font-size:13px;">This issuance is one-time and compliance-logged. Your credits live in your wallet.</span>'),
    cta: { label: "View in wallet", url: `${APP_URL}/wallet` },
    footerNote: "Compliance record of credit issuance on your account."
  });
  const text = `Hi ${hi}, ${opts.amount.toLocaleString()} GoogolPlex Seva Credit issued against your $1 (member ${opts.memberId}). One-time, compliance-logged.\n\n${APP_URL}/wallet\n\n— GoogolPlex`;
  await deliver({ from: FROM.noreply, to: opts.to, subject: "Your GoogolPlex Seva Credit has been issued", html, text });
}

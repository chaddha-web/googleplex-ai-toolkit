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
// Email-optimised mark (144px, ~44KB) served from the landing public dir —
// the full /media/logo.png is 640px / 730KB, far too heavy for email.
const LOGO_URL = process.env.EMAIL_LOGO_URL || "https://ggakingclub.com/email-logo.png";

export const FROM = {
  signup: `${BRAND} <signup@${DOMAIN}>`,
  login: `${BRAND} <login@${DOMAIN}>`,
  noreply: `${BRAND} <no-reply@${DOMAIN}>`
} as const;

// ── Design tokens ───────────────────────────────────────────────────────────
// A quiet near-black canvas with neutral-grey structure. The brand violet is
// spent in ONE place — the primary CTA — so it reads as an accent, not a wash.
// Everything degrades gracefully: solid bgcolors for Outlook, a serif fallback
// stack for the display font, square corners where border-radius isn't supported.
const INK = "#08080b";        // deep near-black canvas
const PANEL = "#131317";      // quiet neutral card (barely cool)
const WELL = "#1c1c22";       // inset well (code / mono chips)
const HAIR = "rgba(255,255,255,0.09)"; // neutral hairline — borders & dividers
const VIOLET = "#8a68ff";     // brand accent — kept only for the occasional text link
const TEXT = "#c9c8d0";       // body — neutral cool-grey, high contrast
const TEXT_DIM = "#8b8a94";   // muted / captions
const HEADING = "#f5f4f7";    // near-white, neutral
const SERIF =
  "'Fraunces','Iowan Old Style','Palatino Linotype',Palatino,Georgia,'Times New Roman',serif";
const SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'SFMono-Regular','SF Mono',ui-monospace,Menlo,Consolas,monospace";

/**
 * Refined CTA — an ivory, crafted button: a subtle top-lit satin gradient, a
 * bright 1px inner highlight, and a tight grounded shadow, with dark ink text.
 * High-contrast and clean on the dark canvas. Degrades to a solid ivory rounded
 * rect in Outlook (gradient + box-shadow ignored there).
 */
function ctaButton(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:34px auto 6px;"><tr>
    <td align="center" bgcolor="#f4f3f7" style="border-radius:14px;background:#f4f3f7;background-image:linear-gradient(180deg,#ffffff 0%,#ecebf1 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,0.9),0 2px 5px rgba(0,0,0,0.35),0 14px 26px -16px rgba(0,0,0,0.5);">
      <a href="${url}" style="display:inline-block;padding:16px 40px;font-family:${SANS};font-size:15px;font-weight:600;letter-spacing:0.01em;color:#0c0b12;text-decoration:none;border-radius:14px;">${label}</a>
    </td>
  </tr></table>`;
}

// ── Shared shell ────────────────────────────────────────────────────────────
function shell(opts: {
  preheader?: string;
  heading: string;
  body: string; // inner HTML (already escaped where needed)
  cta?: { label: string; url: string };
  footerNote?: string;
}): string {
  const { preheader = "", heading, body, cta, footerNote } = opts;
  // A whisper of neutral light at the top edge — no colour wash. Degrades to
  // the flat PANEL colour in Outlook.
  const aurora =
    `background-color:${PANEL};background-image:radial-gradient(120% 70% at 50% -20%,rgba(255,255,255,0.045) 0%,rgba(255,255,255,0) 60%);`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="dark">
    <meta name="supported-color-schemes" content="dark">
    <!--[if mso]><style>*{font-family:Georgia,'Times New Roman',serif !important;}</style><![endif]-->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500&display=swap" rel="stylesheet">
    <style>
      @media (max-width:600px){ .gp-card{ padding:32px 22px !important; } .gp-h1{ font-size:26px !important; } .gp-code{ font-size:34px !important; letter-spacing:8px !important; } }
      a{ color:${VIOLET}; }
    </style>
  </head>
  <body style="margin:0;padding:0;background:${INK};font-family:${SANS};color:${TEXT};">
    <span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${INK}" style="background:${INK};padding:40px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="gp-card" bgcolor="${PANEL}" style="max-width:560px;border-radius:28px;padding:44px 40px;${aurora}border:1px solid ${HAIR};">
          <tr><td align="center" style="padding-bottom:26px;">
            <img src="${LOGO_URL}" alt="${BRAND}" width="56" height="56" style="display:block;border-radius:50%;object-fit:contain;border:1px solid rgba(255,255,255,0.14);box-shadow:0 0 0 4px rgba(255,255,255,0.04);" />
            <div style="margin-top:14px;font-family:${SANS};font-size:11px;font-weight:600;letter-spacing:0.34em;text-transform:uppercase;color:${TEXT_DIM};">${BRAND}</div>
            <div style="width:34px;height:2px;margin:16px auto 0;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.22),rgba(255,255,255,0));"></div>
          </td></tr>
          <tr><td>
            <h1 class="gp-h1" style="margin:0 0 16px 0;font-family:${SERIF};font-weight:400;font-size:32px;line-height:1.16;color:${HEADING};text-align:center;letter-spacing:-0.01em;">${heading}</h1>
            ${body}
            ${cta ? ctaButton(cta.label, cta.url) : ""}
            ${footerNote ? `<p style="margin:26px 0 0 0;font-size:12px;line-height:1.6;color:${TEXT_DIM};text-align:center;">${footerNote}</p>` : ""}
          </td></tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <tr><td align="center" style="padding:26px 8px 0;">
            <div style="font-family:${SERIF};font-size:13px;font-style:italic;color:${TEXT_DIM};">One Team &middot; One Family &middot; One Future</div>
            <p style="margin:10px 0 0;font-size:11px;line-height:1.6;color:#5b5772;">&copy; 2026 ${BRAND} &middot; <a href="https://${DOMAIN}" style="color:#6f6a8a;text-decoration:none;">ggakingclub.com</a></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

const P = (html: string) =>
  `<p style="margin:0 0 15px 0;font-family:${SANS};font-size:15px;line-height:1.62;color:${TEXT};">${html}</p>`;

/** The hero of the OTP emails — big, tracked, on a quiet inset well. */
function codeBlock(code: string): string {
  return `<div class="gp-code" style="font-family:${MONO};font-size:40px;letter-spacing:11px;font-weight:600;color:${HEADING};background:${WELL};border:1px solid rgba(255,255,255,0.1);border-radius:18px;padding:24px 16px;margin:26px 0;text-align:center;text-indent:11px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.04),0 14px 34px -20px rgba(0,0,0,0.8);">${code}</div>`;
}

/** Emerald/amber status chip for receipts. */
function statusPill(label: string, tone: "ok" | "pending" = "ok"): string {
  const c = tone === "ok"
    ? { fg: "#5eead4", bg: "rgba(52,211,153,0.14)", bd: "rgba(52,211,153,0.4)" }
    : { fg: "#fcd34d", bg: "rgba(252,211,77,0.14)", bd: "rgba(252,211,77,0.4)" };
  return `<span style="display:inline-block;padding:3px 12px;font-family:${SANS};font-size:12px;font-weight:600;color:${c.fg};background:${c.bg};border:1px solid ${c.bd};border-radius:999px;">${label}</span>`;
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:12px 0;font-family:${SANS};font-size:13px;color:${TEXT_DIM};border-bottom:1px solid rgba(255,255,255,0.08);">${label}</td>
    <td style="padding:12px 0;font-family:${SANS};font-size:13px;color:${HEADING};text-align:right;border-bottom:1px solid rgba(255,255,255,0.08);word-break:break-all;">${value}</td>
  </tr>`;
}
function detailTable(rows: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;background:rgba(255,255,255,0.03);border-radius:16px;padding:4px 18px;">${rows}</table>`;
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
      `<div style="font-family:${MONO};font-size:18px;letter-spacing:5px;color:${HEADING};background:${WELL};border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:16px;margin:8px 0 22px;text-align:center;text-indent:5px;">${opts.memberId}</div>` +
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
    detailRow("Status", statusPill("Confirmed")) +
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
    detailRow("Status", statusPill("Sent")) +
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
    detailRow("Status", statusPill("Issued"));
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

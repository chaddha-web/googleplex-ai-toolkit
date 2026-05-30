import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { db, stmts } from "../db.js";
import { verifyAccessToken } from "../jwt.js";
import { sendRawEmail } from "../email.js";
import {
  renderMarkdown,
  applyMergeTags,
  wrapEmailShell,
  markdownToPlainText
} from "../markdown.js";
import { notify } from "../notify.js";

/**
 * Email marketing + inbox routes. Three audiences:
 *
 *   1. Admins (Bearer JWT, role='admin'): manage campaigns, view inbox.
 *   2. The public (token-based unsubscribe link in every campaign email).
 *   3. Resend's inbound webhook (HMAC-verified via Svix-style headers).
 *
 * Sends go out via the Resend wrapper in ../email.ts, with per-recipient
 * audit rows in email_sends so a partial failure is recoverable.
 */

// Public base used in unsubscribe links inside outbound emails. Falls back
// to the apex domain; override via env if your auth host is something else.
const PUBLIC_AUTH_BASE = (process.env.PUBLIC_AUTH_BASE || "https://auth.ggakingclub.com").replace(/\/+$/, "");

// HMAC secret used to sign unsubscribe tokens. Derived from JWT_SECRET so
// rotating the JWT secret also invalidates existing unsubscribe links (which
// is fine — the unsubscribe rows themselves are persisted).
function unsubSecret(): Buffer {
  return crypto.createHash("sha256").update("unsubscribe:" + (process.env.JWT_SECRET || "")).digest();
}
function makeUnsubToken(email: string): string {
  const lower = email.toLowerCase();
  const sig = crypto.createHmac("sha256", unsubSecret()).update(lower).digest("base64url");
  return Buffer.from(lower).toString("base64url") + "." + sig;
}
function parseUnsubToken(token: string): string | null {
  try {
    const [b64, sig] = token.split(".");
    if (!b64 || !sig) return null;
    const email = Buffer.from(b64, "base64url").toString("utf8");
    const expected = crypto.createHmac("sha256", unsubSecret()).update(email).digest("base64url");
    // Constant-time compare guards against timing oracles.
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return email;
  } catch {
    return null;
  }
}

// ── Audience filter ────────────────────────────────────────────────────────
// Mirrors the four targeting options the admin UI exposes. Empty/missing
// fields mean "no filter on that dimension".
type Tier = "new" | "activated" | "built";
type Audience = {
  tiers?: Tier[];
  requireOptIn?: boolean;
  from?: number | null;     // signup-date lower bound (ms)
  to?: number | null;       // signup-date upper bound (ms)
  countries?: string[];
};

function tierOf(u: { wallet_status: string; tokens_minted: number }): Tier {
  if ((u.tokens_minted ?? 0) > 0) return "built";
  if (u.wallet_status === "active") return "activated";
  return "new";
}

type RecipientRow = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  code11: string;
  country: string | null;
  notifications_opt_in: number;
  wallet_status: string;
  tokens_minted: number;
  created_at: number;
};

/** Resolve the recipient list for an audience filter (in-memory — small N). */
function resolveAudience(a: Audience): RecipientRow[] {
  const rows = db
    .prepare(
      `SELECT id, email, first_name, last_name, code11, country, notifications_opt_in,
              wallet_status, tokens_minted, created_at
         FROM users`
    )
    .all() as RecipientRow[];
  return rows.filter((u) => {
    if (a.requireOptIn && !u.notifications_opt_in) return false;
    if (a.from != null && u.created_at < a.from) return false;
    if (a.to != null && u.created_at > a.to) return false;
    if (a.tiers && a.tiers.length > 0 && !a.tiers.includes(tierOf(u))) return false;
    if (a.countries && a.countries.length > 0) {
      const c = (u.country || "").toLowerCase();
      if (!a.countries.map((x) => x.toLowerCase()).includes(c)) return false;
    }
    return true;
  });
}

// ── Routes ────────────────────────────────────────────────────────────────
export async function emailRoutes(app: FastifyInstance) {
  const requireAdmin = async (req: any, reply: any) => {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) {
      reply.code(401).send({ error: "Missing bearer token." });
      return null;
    }
    const claims = await verifyAccessToken(h.slice(7).trim());
    if (!claims) {
      reply.code(401).send({ error: "Invalid token." });
      return null;
    }
    const u = stmts.user.byId.get(claims.sub);
    if (!u || u.role !== "admin") {
      reply.code(403).send({ error: "Admin only." });
      return null;
    }
    return u;
  };

  // ── List campaigns ──────────────────────────────────────────────────────
  app.get("/auth/admin/campaigns", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const rows = stmts.email.campaignList.all() as Array<{
      id: string;
      subject: string;
      status: string;
      created_at: number;
      sent_at: number | null;
      recipient_count: number | null;
      sent_count: number;
      fail_count: number;
    }>;
    return reply.send({ campaigns: rows });
  });

  // ── Get one campaign (with last 500 sends) ──────────────────────────────
  app.get("/auth/admin/campaigns/:id", async (req: any, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const c = stmts.email.campaignById.get(req.params.id) as any;
    if (!c) return reply.code(404).send({ error: "No such campaign." });
    const sends = stmts.email.sendsForCampaign.all(req.params.id);
    return reply.send({
      campaign: { ...c, audience: JSON.parse(c.audience_json || "{}") },
      sends
    });
  });

  // ── Create campaign (draft) ─────────────────────────────────────────────
  app.post("/auth/admin/campaigns", async (req: any, reply) => {
    const me = await requireAdmin(req, reply);
    if (!me) return;
    const body = (req.body ?? {}) as { subject?: string; body_md?: string; audience?: Audience };
    const subject = String(body.subject || "").trim();
    const md = String(body.body_md || "").trim();
    if (!subject) return reply.code(400).send({ error: "Subject required." });
    if (subject.length > 250) return reply.code(400).send({ error: "Subject too long." });
    if (!md) return reply.code(400).send({ error: "Body required." });
    if (md.length > 50_000) return reply.code(400).send({ error: "Body too long." });
    const id = crypto.randomUUID();
    const now = Date.now();
    stmts.email.campaignInsert.run({
      id,
      subject,
      body_md: md,
      audience_json: JSON.stringify(body.audience || {}),
      created_by: me.id,
      created_at: now,
      updated_at: now
    });
    return reply.send({ ok: true, id });
  });

  // ── Update campaign draft ───────────────────────────────────────────────
  app.patch("/auth/admin/campaigns/:id", async (req: any, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const c = stmts.email.campaignById.get(req.params.id) as any;
    if (!c) return reply.code(404).send({ error: "No such campaign." });
    if (c.status !== "draft") {
      return reply.code(400).send({ error: "Only drafts can be edited." });
    }
    const body = (req.body ?? {}) as { subject?: string; body_md?: string; audience?: Audience };
    stmts.email.campaignUpdate.run({
      id: req.params.id,
      subject: String(body.subject ?? c.subject).trim(),
      body_md: String(body.body_md ?? c.body_md),
      audience_json: JSON.stringify(body.audience ?? JSON.parse(c.audience_json || "{}")),
      updated_at: Date.now()
    });
    return reply.send({ ok: true });
  });

  // ── Delete a draft (sent campaigns are immutable, keep for audit) ───────
  app.delete("/auth/admin/campaigns/:id", async (req: any, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const c = stmts.email.campaignById.get(req.params.id) as any;
    if (!c) return reply.code(404).send({ error: "No such campaign." });
    if (c.status !== "draft") {
      return reply.code(400).send({ error: "Sent campaigns can't be deleted." });
    }
    stmts.email.campaignDelete.run(req.params.id);
    return reply.send({ ok: true });
  });

  // ── Preview rendering (md → html + plaintext) ───────────────────────────
  app.post("/auth/admin/email/preview", async (req: any, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const body = (req.body ?? {}) as { body_md?: string; subject?: string };
    const md = String(body.body_md || "");
    const vars = {
      first_name: "Alex",
      last_name: "Sample",
      email: "sample@example.com",
      code11: "11CHAR-DEMO",
      unsubscribe_url: PUBLIC_AUTH_BASE + "/auth/email/unsubscribe?token=demo"
    };
    const html = wrapEmailShell({
      innerHtml: renderMarkdown(applyMergeTags(md, vars)),
      unsubscribeUrl: vars.unsubscribe_url
    });
    const text = markdownToPlainText(applyMergeTags(md, vars));
    return reply.send({ html, text, subject: String(body.subject || "") });
  });

  // ── Audience count (live preview as filters change) ─────────────────────
  app.post("/auth/admin/email/audience-count", async (req: any, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const a = (req.body ?? {}) as Audience;
    const recipients = resolveAudience(a);
    // Also exclude unsubscribers so the count reflects what will actually go out.
    const unsubs = new Set(
      (db.prepare(`SELECT email FROM email_unsubscribes`).all() as Array<{ email: string }>).map(
        (r) => r.email.toLowerCase()
      )
    );
    const effective = recipients.filter((r) => !unsubs.has(r.email.toLowerCase()));
    return reply.send({ total: recipients.length, effective: effective.length });
  });

  // ── Send a TEST email (single recipient, doesn't touch send log) ────────
  app.post("/auth/admin/campaigns/:id/test", async (req: any, reply) => {
    const me = await requireAdmin(req, reply);
    if (!me) return;
    const c = stmts.email.campaignById.get(req.params.id) as any;
    if (!c) return reply.code(404).send({ error: "No such campaign." });
    const body = (req.body ?? {}) as { to?: string };
    const to = String(body.to || me.email).trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return reply.code(400).send({ error: "Invalid email." });
    }
    const vars = {
      first_name: me.first_name || "there",
      last_name: me.last_name || "",
      email: to,
      code11: me.code11,
      unsubscribe_url: PUBLIC_AUTH_BASE + "/auth/email/unsubscribe?token=" + makeUnsubToken(to)
    };
    const html = wrapEmailShell({
      innerHtml: renderMarkdown(applyMergeTags(c.body_md, vars)),
      unsubscribeUrl: vars.unsubscribe_url
    });
    const text = markdownToPlainText(applyMergeTags(c.body_md, vars));
    try {
      const id = await sendRawEmail({ to, subject: "[TEST] " + c.subject, html, text });
      return reply.send({ ok: true, resend_id: id });
    } catch (e) {
      return reply.code(502).send({ error: (e as Error).message });
    }
  });

  // ── Send for real (the big one) ─────────────────────────────────────────
  // Status transitions: draft → sending → sent (or failed).
  // We mark recipients in email_sends as we go so a crash mid-send doesn't
  // re-send to people who already got it. The throttle keeps us under
  // Resend's default rate limit (2 req/s burst).
  app.post("/auth/admin/campaigns/:id/send", async (req: any, reply) => {
    const me = await requireAdmin(req, reply);
    if (!me) return;
    const c = stmts.email.campaignById.get(req.params.id) as any;
    if (!c) return reply.code(404).send({ error: "No such campaign." });
    if (c.status !== "draft") {
      return reply.code(400).send({ error: `Cannot send a campaign in status "${c.status}".` });
    }
    const audience: Audience = JSON.parse(c.audience_json || "{}");
    const recipients = resolveAudience(audience);
    if (recipients.length === 0) {
      return reply.code(400).send({ error: "No recipients match the audience filter." });
    }

    // Unsub set as a flat lookup.
    const unsubs = new Set(
      (db.prepare(`SELECT email FROM email_unsubscribes`).all() as Array<{ email: string }>).map(
        (r) => r.email.toLowerCase()
      )
    );

    const now = Date.now();
    stmts.email.campaignStatus.run({
      id: c.id,
      status: "sending",
      recipient_count: recipients.length,
      sent_count: 0,
      fail_count: 0,
      sent_at: null,
      error: null,
      updated_at: now
    });
    notify(
      `📨 <b>Campaign sending</b>\n<i>${c.subject}</i>\n${recipients.length} recipient(s) · by ${me.email}`
    );

    // Fire the send loop in the background so the HTTP request returns fast.
    // The caller polls GET /campaigns/:id for progress.
    (async () => {
      let sent = 0;
      let failed = 0;
      for (const r of recipients) {
        const sendId = crypto.randomUUID();
        stmts.email.sendInsert.run({
          id: sendId,
          campaign_id: c.id,
          user_id: r.id,
          email: r.email
        });
        // Skip unsubscribers
        if (unsubs.has(r.email.toLowerCase())) {
          stmts.email.sendMark.run({
            id: sendId,
            status: "skipped_unsubscribed",
            resend_id: null,
            error: null,
            sent_at: Date.now()
          });
          continue;
        }
        const vars = {
          first_name: r.first_name || "there",
          last_name: r.last_name || "",
          email: r.email,
          code11: r.code11,
          unsubscribe_url: PUBLIC_AUTH_BASE + "/auth/email/unsubscribe?token=" + makeUnsubToken(r.email)
        };
        const subject = applyMergeTags(c.subject, vars);
        const html = wrapEmailShell({
          innerHtml: renderMarkdown(applyMergeTags(c.body_md, vars)),
          unsubscribeUrl: vars.unsubscribe_url
        });
        const text = markdownToPlainText(applyMergeTags(c.body_md, vars));
        try {
          const rid = await sendRawEmail({ to: r.email, subject, html, text });
          stmts.email.sendMark.run({
            id: sendId,
            status: "sent",
            resend_id: rid,
            error: null,
            sent_at: Date.now()
          });
          sent++;
        } catch (e) {
          stmts.email.sendMark.run({
            id: sendId,
            status: "failed",
            resend_id: null,
            error: String((e as Error).message || e).slice(0, 500),
            sent_at: Date.now()
          });
          failed++;
        }
        // Persist progress every 25 sends so the UI's progress bar moves.
        if ((sent + failed) % 25 === 0) {
          stmts.email.campaignStatus.run({
            id: c.id,
            status: "sending",
            recipient_count: recipients.length,
            sent_count: sent,
            fail_count: failed,
            sent_at: null,
            error: null,
            updated_at: Date.now()
          });
        }
        // ~400 ms gap — stays under Resend's 2 rps default cap.
        await new Promise((res) => setTimeout(res, 400));
      }
      stmts.email.campaignStatus.run({
        id: c.id,
        status: failed === recipients.length ? "failed" : "sent",
        recipient_count: recipients.length,
        sent_count: sent,
        fail_count: failed,
        sent_at: Date.now(),
        error: null,
        updated_at: Date.now()
      });
      notify(
        `📬 <b>Campaign sent</b>\n<i>${c.subject}</i>\n✅ ${sent}  ⚠️ ${failed}`
      );
    })().catch((err) => {
      stmts.email.campaignStatus.run({
        id: c.id,
        status: "failed",
        recipient_count: recipients.length,
        sent_count: 0,
        fail_count: recipients.length,
        sent_at: Date.now(),
        error: String((err as Error).message).slice(0, 500),
        updated_at: Date.now()
      });
      notify(`❌ <b>Campaign FAILED</b>\n<i>${c.subject}</i>\n${(err as Error).message}`);
    });

    return reply.send({ ok: true, status: "sending", recipient_count: recipients.length });
  });

  // ── Public: unsubscribe by token (no auth) ──────────────────────────────
  app.get("/auth/email/unsubscribe", async (req: any, reply) => {
    const token = String(req.query?.token || "");
    const email = parseUnsubToken(token);
    if (!email) {
      reply.type("text/html").code(400).send(unsubPage({ ok: false, msg: "This unsubscribe link is invalid or expired." }));
      return;
    }
    stmts.email.unsubAdd.run(email, Date.now(), "user_clicked");
    reply.type("text/html").send(unsubPage({ ok: true, msg: `You're unsubscribed (${email}). We won't email you again.` }));
  });

  // ── Inbox (admin) ───────────────────────────────────────────────────────
  app.get("/auth/admin/inbox", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    return reply.send({ messages: stmts.email.inboxList.all() });
  });
  app.get("/auth/admin/inbox/:id", async (req: any, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const m = stmts.email.inboxById.get(req.params.id);
    if (!m) return reply.code(404).send({ error: "Not found." });
    // Lazy mark-read.
    stmts.email.inboxMarkRead.run(Date.now(), req.params.id);
    return reply.send({ message: m });
  });
  app.post("/auth/admin/inbox/:id/archive", async (req: any, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    stmts.email.inboxArchive.run(Date.now(), req.params.id);
    return reply.send({ ok: true });
  });

  // ── Resend inbound webhook ──────────────────────────────────────────────
  // Configure on resend.com → Inbound → set webhook URL to
  // https://auth.ggakingclub.com/auth/email/inbound and copy the signing
  // secret into RESEND_INBOUND_SECRET. The body is a Resend-shaped JSON
  // payload; we accept a few common shapes since the API surface has
  // evolved. Signature verification uses Svix-style headers
  // (svix-id, svix-timestamp, svix-signature).
  app.post("/auth/email/inbound", async (req: any, reply) => {
    // Signature verification: enabled only when RESEND_INBOUND_SECRET is set
    // AND we have access to the raw request bytes. Fastify parses JSON by
    // default, which loses byte fidelity (key order, whitespace) needed for
    // HMAC. To enable strict verification, add the fastify-raw-body plugin
    // and expose req.rawBody; until then the secret check is "best effort"
    // (we accept rather than reject so legitimate Resend traffic isn't lost).
    const secret = process.env.RESEND_INBOUND_SECRET;
    if (secret && typeof req.rawBody === "string") {
      const id = String(req.headers["svix-id"] || "");
      const ts = String(req.headers["svix-timestamp"] || "");
      const sigHeader = String(req.headers["svix-signature"] || "");
      const signedPayload = `${id}.${ts}.${req.rawBody}`;
      const expected = crypto
        .createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64"))
        .update(signedPayload)
        .digest("base64");
      const ok = sigHeader.split(" ").some((s) => {
        const parts = s.split(",");
        return parts[1] === expected;
      });
      if (!ok) return reply.code(401).send({ error: "Bad signature." });
    } else if (secret) {
      req.log.warn(
        "[inbound] RESEND_INBOUND_SECRET set but rawBody unavailable — signature NOT verified. Install fastify-raw-body to enforce."
      );
    }
    const data = (req.body ?? {}) as any;
    // Try to extract the email regardless of which exact field naming Resend uses.
    const inner = data.data ?? data;
    const fromObj = inner.from ?? inner.envelope?.from ?? {};
    const fromEmail =
      typeof fromObj === "string" ? fromObj : fromObj?.email || inner.from_email || "unknown@unknown";
    const fromName = typeof fromObj === "object" ? fromObj?.name : null;
    const toObj = Array.isArray(inner.to) ? inner.to[0] : inner.to ?? {};
    const toEmail = typeof toObj === "string" ? toObj : toObj?.email || inner.to_email || "inbox@ggakingclub.com";
    const subject = String(inner.subject || "(no subject)").slice(0, 500);
    const text = String(inner.text || inner.plain || "").slice(0, 200_000);
    const html = String(inner.html || "").slice(0, 500_000);
    const id = crypto.randomUUID();
    stmts.email.inboxInsert.run({
      id,
      from_email: String(fromEmail).toLowerCase(),
      from_name: fromName || null,
      to_email: String(toEmail).toLowerCase(),
      subject,
      body_text: text || null,
      body_html: html || null,
      resend_id: inner.id || data.id || null,
      received_at: Date.now()
    });
    notify(`📥 <b>Email received</b>\nfrom ${fromEmail}\n<i>${subject}</i>`);
    return reply.send({ ok: true, id });
  });
}

function unsubPage(opts: { ok: boolean; msg: string }): string {
  const color = opts.ok ? "#7dd3fc" : "#fca5a5";
  return `<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribe — GoogolPlex</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
</head><body style="margin:0;padding:0;background:#0a0a0a;font-family:Inter,system-ui,sans-serif;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center">
  <div style="max-width:480px;padding:48px 32px;text-align:center">
    <div style="font-size:12px;letter-spacing:0.3em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:24px">GoogolPlex</div>
    <h1 style="font-family:Georgia,serif;font-weight:400;font-size:32px;margin:0 0 16px 0;color:${color}">${opts.ok ? "Unsubscribed" : "Couldn't unsubscribe"}</h1>
    <p style="font-size:15px;line-height:1.6;color:rgba(255,255,255,0.7);margin:0">${opts.msg}</p>
  </div>
</body></html>`;
}

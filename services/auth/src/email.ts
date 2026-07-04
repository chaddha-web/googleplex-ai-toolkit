import { Resend } from "resend";
import { recordOutbound } from "./db.js";

/**
 * Sends a GoogolPlex 6-digit sign-in code via Resend. Falls back to a
 * console.log when RESEND_API_KEY is missing so local dev works without
 * a real key.
 */
export async function sendOtpEmail({
  to,
  code,
  firstName
}: {
  to: string;
  code: string;
  firstName?: string | null;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "GoogolPlex <onboarding@resend.dev>";

  const resend2From = from;
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.log(`[dev] OTP for ${to}: ${code}`);
    recordOutbound({ from: resend2From, to, subject: "Your GoogolPlex sign-in code", kind: "login_otp", status: "dev" });
    return;
  }

  const resend = new Resend(apiKey);
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";

  const subject = "Your GoogolPlex sign-in code";
  const text =
    `${greeting}\n\n` +
    `Your GoogolPlex sign-in code is ${code}.\n` +
    `It expires in 10 minutes.\n\n` +
    `If you didn't request this code, you can safely ignore this email.\n\n` +
    `— GoogolPlex`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0a0a0a;font-family:Inter,system-ui,-apple-system,sans-serif;color:#fff;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#111;border-radius:24px;padding:40px 32px;">
            <tr>
              <td style="text-align:center;">
                <div style="font-size:14px;letter-spacing:0.3em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:24px;">GoogolPlex</div>
                <h1 style="margin:0 0 12px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:32px;line-height:1.15;color:#fff;">Your sign-in code</h1>
                <p style="margin:0 0 32px 0;font-size:15px;line-height:1.55;color:rgba(255,255,255,0.7);">${greeting} use the code below to continue. It expires in 10 minutes.</p>
                <div style="font-size:44px;letter-spacing:14px;font-weight:600;color:#fff;background:#1a1a1a;border-radius:16px;padding:24px;margin-bottom:32px;">${code}</div>
                <p style="margin:0;font-size:13px;line-height:1.55;color:rgba(255,255,255,0.4);">If you didn't request this code, you can safely ignore this email.</p>
              </td>
            </tr>
          </table>
          <p style="margin:24px 0 0 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.25);">© 2026 GoogolPlex</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  try {
    const res = await resend.emails.send({ from, to, subject, text, html });
    if ((res as any)?.error) throw new Error((res as any).error.message || "Resend error");
    recordOutbound({ from, to, subject, html, text, kind: "login_otp", resendId: (res as any)?.data?.id, status: "sent" });
  } catch (e) {
    recordOutbound({ from, to, subject, html, text, kind: "login_otp", status: "failed", error: (e as Error).message });
    throw e;
  }
}

/**
 * Generic Resend send — used by campaigns + ad-hoc admin sends. Returns the
 * Resend message id on success, or throws. In dev (no RESEND_API_KEY) it
 * logs and returns a fake id so the rest of the pipeline still flows.
 */
export async function sendRawEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "GoogolPlex <onboarding@resend.dev>";
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.log(`[dev] email → ${opts.to} · ${opts.subject}`);
    recordOutbound({ from, to: opts.to, subject: opts.subject, html: opts.html, text: opts.text, kind: "generic", status: "dev" });
    return "dev-" + Math.random().toString(36).slice(2, 10);
  }
  const resend = new Resend(apiKey);
  try {
    const res = await resend.emails.send({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {})
    });
    // Resend SDK returns { data: { id }, error } — surface whichever is set.
    if ((res as any)?.error) {
      throw new Error((res as any).error.message || "Resend error");
    }
    const id = (res as any)?.data?.id || "";
    recordOutbound({ from, to: opts.to, subject: opts.subject, html: opts.html, text: opts.text, kind: "generic", resendId: id, status: "sent" });
    return id;
  } catch (e) {
    recordOutbound({ from, to: opts.to, subject: opts.subject, html: opts.html, text: opts.text, kind: "generic", status: "failed", error: (e as Error).message });
    throw e;
  }
}

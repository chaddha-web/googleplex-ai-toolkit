/**
 * Tiny, dependency-free Markdown → email-safe HTML renderer.
 *
 * Why not pull in `marked` / `markdown-it`: email rendering is one of the few
 * places HTML *injection* is the #1 risk, and the safest defense is a
 * whitelist of supported markdown features rather than a permissive parser
 * with a sanitizer bolted on top. This renderer:
 *
 *   - HTML-escapes everything by default (no raw HTML passthrough)
 *   - Supports: # ## ### headings, **bold**, *italic*, `inline code`,
 *     [link](url) (http/https/mailto only), - ordered & unordered lists,
 *     > blockquotes, ``` code blocks, --- horizontal rules, blank-line paragraphs
 *   - Strips javascript: and data: URLs from links
 *   - Substitutes {{first_name}}, {{last_name}}, {{email}}, {{code11}},
 *     {{unsubscribe_url}}
 *
 * Output is intentionally inline-styled so it survives Gmail / Outlook
 * stripping <style> blocks.
 */

const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]!);
}

/** Allowed link protocols. Anything else (javascript:, data:) → '#'. */
function safeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  // Allow protocol-relative // → assume https
  if (trimmed.startsWith("//")) return "https:" + trimmed;
  return "#";
}

/** Inline pass: code → bold → italic → links (order matters). */
function renderInline(src: string): string {
  let out = escapeHtml(src);
  // `inline code` — backticks (do BEFORE bold/italic so * inside code stays literal)
  out = out.replace(/`([^`\n]+)`/g, (_, c) => `<code style="background:#1a1a1a;border-radius:4px;padding:2px 6px;font-family:Menlo,Consolas,monospace;font-size:0.92em">${c}</code>`);
  // **bold**
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  // *italic*  — match * that isn't preceded/followed by *
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  // [text](url)
  out = out.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_, text, url) => {
    const href = safeUrl(url);
    return `<a href="${escapeHtml(href)}" style="color:#7dd3fc;text-decoration:underline">${text}</a>`;
  });
  return out;
}

type Block =
  | { kind: "h"; level: 1 | 2 | 3; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "code"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "hr" };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    // Skip leading blank lines between blocks
    if (line.trim() === "") {
      i++;
      continue;
    }
    // Fenced code: ```
    if (line.trim().startsWith("```")) {
      i++;
      const buf: string[] = [];
      while (i < lines.length && !lines[i]!.trim().startsWith("```")) {
        buf.push(lines[i]!);
        i++;
      }
      if (i < lines.length) i++; // consume closing fence
      blocks.push({ kind: "code", text: buf.join("\n") });
      continue;
    }
    // Heading
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      blocks.push({ kind: "h", level: h[1]!.length as 1 | 2 | 3, text: h[2]! });
      i++;
      continue;
    }
    // Horizontal rule
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }
    // Blockquote
    if (line.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i]!.startsWith(">")) {
        buf.push(lines[i]!.replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "quote", text: buf.join(" ") });
      continue;
    }
    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }
    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }
    // Paragraph: consume until blank line
    const buf: string[] = [line];
    i++;
    while (i < lines.length && lines[i]!.trim() !== "" && !/^(#{1,3}\s|>|\s*[-*]\s|\s*\d+\.\s|```)/.test(lines[i]!)) {
      buf.push(lines[i]!);
      i++;
    }
    blocks.push({ kind: "p", text: buf.join(" ") });
  }

  return blocks;
}

const P_STYLE = "margin:0 0 16px 0;font-size:15px;line-height:1.6;color:rgba(255,255,255,0.85)";
const H_STYLES = {
  1: "margin:24px 0 12px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:28px;line-height:1.2;color:#fff",
  2: "margin:24px 0 12px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:22px;line-height:1.25;color:#fff",
  3: "margin:20px 0 10px 0;font-weight:600;font-size:17px;line-height:1.3;color:#fff"
} as const;

/** Render parsed blocks to email-safe HTML. */
function renderBlocks(blocks: Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.kind) {
      case "h":
        out.push(`<h${b.level} style="${H_STYLES[b.level]}">${renderInline(b.text)}</h${b.level}>`);
        break;
      case "p":
        out.push(`<p style="${P_STYLE}">${renderInline(b.text)}</p>`);
        break;
      case "ul":
        out.push(`<ul style="margin:0 0 16px 0;padding-left:20px;color:rgba(255,255,255,0.85);font-size:15px;line-height:1.6">${b.items.map((it) => `<li style="margin-bottom:4px">${renderInline(it)}</li>`).join("")}</ul>`);
        break;
      case "ol":
        out.push(`<ol style="margin:0 0 16px 0;padding-left:24px;color:rgba(255,255,255,0.85);font-size:15px;line-height:1.6">${b.items.map((it) => `<li style="margin-bottom:4px">${renderInline(it)}</li>`).join("")}</ol>`);
        break;
      case "code":
        out.push(`<pre style="margin:0 0 16px 0;padding:14px 16px;background:#0f0f0f;border:1px solid #222;border-radius:8px;overflow-x:auto;font-family:Menlo,Consolas,monospace;font-size:13px;line-height:1.5;color:#e5e5e5;white-space:pre-wrap"><code>${escapeHtml(b.text)}</code></pre>`);
        break;
      case "quote":
        out.push(`<blockquote style="margin:0 0 16px 0;padding:8px 16px;border-left:3px solid #444;color:rgba(255,255,255,0.7);font-size:15px;line-height:1.6;font-style:italic">${renderInline(b.text)}</blockquote>`);
        break;
      case "hr":
        out.push(`<hr style="margin:24px 0;border:none;border-top:1px solid #2a2a2a">`);
        break;
    }
  }
  return out.join("\n");
}

/** Render markdown to inline-styled HTML, no raw-HTML passthrough. */
export function renderMarkdown(md: string): string {
  return renderBlocks(parseBlocks(md));
}

/** Merge-tag substitution. Unknown tags pass through as the literal {{name}}. */
export function applyMergeTags(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, key) => {
    const v = vars[String(key).toLowerCase()];
    return v == null ? m : v;
  });
}

/** Wrap inner HTML in the GoogolPlex email shell (matching the OTP look). */
export function wrapEmailShell(opts: { innerHtml: string; unsubscribeUrl: string }): string {
  const { innerHtml, unsubscribeUrl } = opts;
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0a0a0a;font-family:Inter,system-ui,-apple-system,sans-serif;color:#fff;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#111;border-radius:24px;padding:36px 32px;">
            <tr>
              <td>
                <div style="font-size:12px;letter-spacing:0.3em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:24px">GoogolPlex</div>
                ${innerHtml}
              </td>
            </tr>
          </table>
          <p style="margin:24px 0 0 0;font-size:11px;line-height:1.6;color:rgba(255,255,255,0.4);max-width:560px;text-align:center">
            You're receiving this because you signed up at ggakingclub.com.
            <a href="${escapeHtml(unsubscribeUrl)}" style="color:rgba(255,255,255,0.6);text-decoration:underline">Unsubscribe</a>
            · © 2026 GoogolPlex
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Plaintext fallback — strip markdown markers for a readable .txt body. */
export function markdownToPlainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "") // strip fenced code blocks entirely
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^(\*{3,}|-{3,}|_{3,})\s*$/gm, "----")
    .trim();
}

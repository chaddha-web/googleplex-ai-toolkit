import { NextRequest, NextResponse } from "next/server";
import { callProvider, type ChatMsg, type Provider } from "@/lib/ai-providers";
import { publishSite, sanitizeSlug } from "@/lib/sites-store";
import {
  DEMO_BRAND_KIT,
  DEMO_LOGO_SVG,
  DEMO_SLUG,
  DEMO_STORE_NAME
} from "@/lib/studio-demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTH_INTERNAL = (
  process.env.AUTH_INTERNAL_BASE || "http://auth:4200"
).replace(/\/$/, "");
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;

// When on, the Studio returns the hand-built showcase instead of calling a
// provider — used for demos / recording with no API key.
const DEMO_MODE = process.env.STUDIO_DEMO_MODE === "1";

const BRAND_SYSTEM = `You are the GoogolPlex AI Studio — a senior brand designer + founder coach.
Given a member's project description, produce a concise, ready-to-use brand kit.

Return clean Markdown with these sections:
- **Brand names** — 3 options
- **Tagline** — 1 line
- **Palette** — 4–5 colors as hex with a one-word role each
- **Typography** — a heading + body font pairing
- **Brand story** — 2–3 sentences
- **First 3 steps** — to launch in the GoogolPlex ecosystem

Keep it tight and practical. No preamble.`;

const SITE_SYSTEM = `You are the GoogolPlex AI Studio site generator.
Given a member's business description and brand name, output ONE complete, valid,
self-contained HTML5 document for a premium marketing landing page.

Hard requirements:
- A single file: all CSS in one <style> tag, no external CSS/JS frameworks.
- Distinctive Google Fonts via <link> (NOT Inter/Roboto/Arial).
- An inline <svg> logo mark (no external images).
- Sections: sticky nav, hero, services/offerings, about the founder, mission,
  how-it-works, a call-to-action, and a footer.
- Cohesive color system via CSS variables; generous spacing; subtle load animation.
- Mobile responsive.
- End with a small fixed badge AND a footer line, both reading
  "Developed by GoogolPlex AI Powerbox".

Output ONLY the raw HTML, starting with <!doctype html>. No markdown fences, no commentary.`;

type AiConfig = {
  activeProvider: Provider;
  fallbackOrder: Provider[];
  providers: Record<Provider, { model: string | null; key: string | null }>;
};

let cached: { at: number; cfg: AiConfig } | null = null;

async function loadConfig(): Promise<AiConfig | null> {
  if (cached && Date.now() - cached.at < 60_000) return cached.cfg;
  if (!INTERNAL_TOKEN) return null;
  try {
    const res = await fetch(`${AUTH_INTERNAL}/internal/settings/ai`, {
      headers: { Authorization: `Bearer ${INTERNAL_TOKEN}` },
      cache: "no-store"
    });
    if (!res.ok) return null;
    const cfg = (await res.json()) as AiConfig;
    cached = { at: Date.now(), cfg };
    return cfg;
  } catch {
    return null;
  }
}

function providerChain(cfg: AiConfig): Provider[] {
  const order = [cfg.activeProvider, ...cfg.fallbackOrder].filter(
    (p, i, a) => p && a.indexOf(p) === i
  ) as Provider[];
  return order.filter((p) => cfg.providers[p]?.key);
}

function stripFences(s: string): string {
  return s
    .replace(/^\s*```(?:html)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

export async function POST(req: NextRequest) {
  let body: { prompt?: unknown; storeName?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const storeName =
    typeof body.storeName === "string" ? body.storeName.trim() : "";
  if (!prompt || prompt.length > 4000) {
    return NextResponse.json(
      { error: "A project description (1–4000 chars) is required." },
      { status: 400 }
    );
  }

  // Build the real provider chain.
  const cfg = await loadConfig();
  const attempts: Array<{ provider: Provider; key: string; model: string | null }> = [];
  if (cfg) {
    for (const p of providerChain(cfg)) {
      attempts.push({ provider: p, key: cfg.providers[p]!.key!, model: cfg.providers[p]!.model });
    }
  }
  if (attempts.length === 0 && process.env.ANTHROPIC_API_KEY) {
    attempts.push({ provider: "anthropic", key: process.env.ANTHROPIC_API_KEY, model: null });
  }

  // ── Demo short-circuit ──────────────────────────────────────────────────
  // Explicit demo flag, or no provider configured: return the hand-built
  // showcase store (already live at /store/<DEMO_SLUG>). Looks identical to the
  // real flow in the UI — no key required.
  if (DEMO_MODE || attempts.length === 0) {
    return NextResponse.json({
      ok: true,
      demo: true,
      provider: "demo",
      storeName: storeName || DEMO_STORE_NAME,
      slug: DEMO_SLUG,
      url: `/store/${DEMO_SLUG}`,
      logoSvg: DEMO_LOGO_SVG,
      brandKit: DEMO_BRAND_KIT
    });
  }

  // ── Real pipeline ───────────────────────────────────────────────────────
  const brandMsgs: ChatMsg[] = [
    { role: "user", content: `Project description:\n\n${prompt}` }
  ];
  const siteMsgs: ChatMsg[] = [
    {
      role: "user",
      content: `Brand name: ${storeName || "(choose a strong one)"}\n\nBusiness description:\n\n${prompt}`
    }
  ];

  let brandKit: string | null = null;
  let siteHtml: string | null = null;
  let usedProvider: Provider | null = null;
  let lastErr: unknown = null;

  for (const a of attempts) {
    try {
      const [bk, site] = await Promise.all([
        callProvider(a.provider, a.key, a.model, BRAND_SYSTEM, brandMsgs),
        callProvider(a.provider, a.key, a.model, SITE_SYSTEM, siteMsgs)
      ]);
      if (bk && site) {
        brandKit = bk;
        siteHtml = stripFences(site);
        usedProvider = a.provider;
        break;
      }
    } catch (e) {
      lastErr = e;
    }
  }

  if (!brandKit || !siteHtml) {
    console.error("[studio/generate] all providers failed", lastErr);
    return NextResponse.json(
      { error: "Generation failed — please try again." },
      { status: 502 }
    );
  }

  // Publish the generated site so it's live at /store/<slug>.
  const slug =
    sanitizeSlug(storeName) || sanitizeSlug(prompt.slice(0, 40)) || "my-store";
  let url: string;
  try {
    url = await publishSite(slug, siteHtml);
  } catch (e) {
    console.error("[studio/generate] publish failed", e);
    return NextResponse.json(
      { error: "Generated, but publishing failed." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    demo: false,
    provider: usedProvider,
    storeName: storeName || slug,
    slug,
    url,
    brandKit
  });
}

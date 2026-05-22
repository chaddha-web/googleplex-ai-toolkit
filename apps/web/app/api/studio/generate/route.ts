import { NextRequest, NextResponse } from "next/server";
import { callProvider, type ChatMsg, type Provider } from "@/lib/ai-providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTH_INTERNAL = (
  process.env.AUTH_INTERNAL_BASE || "http://auth:4200"
).replace(/\/$/, "");
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;

const SYSTEM = `You are the GoogolPlex AI Studio — a senior brand designer + founder coach.
Given a member's project description, produce a concise, ready-to-use brand kit.

Return clean Markdown with these sections:
- **Brand names** — 3 options
- **Tagline** — 1 line
- **Palette** — 4–5 colors as hex with a one-word role each
- **Typography** — a heading + body font pairing
- **Brand story** — 2–3 sentences
- **First 3 steps** — to launch in the GoogolPlex ecosystem

Keep it tight and practical. No preamble.`;

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

export async function POST(req: NextRequest) {
  let body: { prompt?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt || prompt.length > 4000) {
    return NextResponse.json(
      { error: "A project description (1–4000 chars) is required." },
      { status: 400 }
    );
  }

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
  if (attempts.length === 0) {
    return NextResponse.json(
      { error: "AI is not configured yet — an admin must add a provider key in Settings." },
      { status: 503 }
    );
  }

  const messages: ChatMsg[] = [
    { role: "user", content: `Project description:\n\n${prompt}` }
  ];

  let lastErr: unknown = null;
  for (const a of attempts) {
    try {
      const brandKit = await callProvider(a.provider, a.key, a.model, SYSTEM, messages);
      if (brandKit) return NextResponse.json({ ok: true, provider: a.provider, brandKit });
    } catch (e) {
      lastErr = e;
    }
  }
  console.error("[studio/generate] all providers failed", lastErr);
  return NextResponse.json(
    { error: "Generation failed — please try again." },
    { status: 502 }
  );
}

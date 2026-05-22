import { NextRequest, NextResponse } from "next/server";
import {
  callProvider,
  type ChatMsg,
  type Provider
} from "@/lib/ai-providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Auth service (internal network) for the admin-configured AI settings.
const AUTH_INTERNAL = (
  process.env.AUTH_INTERNAL_BASE || "http://auth:4200"
).replace(/\/$/, "");
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;

const SYSTEM = `You are the GoogolPlex Specialist — a concise, warm AI guide embedded on the GoogolPlex website (ggakingclub.com).

About GoogolPlex: a Web3 + Social + AI ecosystem built around community. Key facts:
- Onboarding starts at $1; every member is minted 10 billion personalized tokens at signup.
- Universal Smart Wallet holds USDT/USDC/ETH/BNB/TRX/BTC and the PARTY token; deposits + withdrawals supported.
- AI Studio: generate a brand kit + deployable site; unlocking it is a one-time $18 fee payable in any supported coin.
- Services: The Social Hub, Universal Finance, Shared Wealth, City of Peace, AI-Powered Ventures (see /services).
- Founder/vision: Dr. Narendra Singh Khurana; ethos "Mother First. By Design." and "Har Maidan Fateh".

Style: friendly, brief (2-4 sentences unless asked for detail), plain language. Help users understand the ecosystem, navigate the site, and decide next steps. If unsure, say so and point them to /contact. Never invent prices, token mechanics, or financial advice.`;

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

/** Ordered, de-duplicated provider list with a usable key. */
function providerChain(cfg: AiConfig): Provider[] {
  const order = [cfg.activeProvider, ...cfg.fallbackOrder].filter(
    (p, i, a) => p && a.indexOf(p) === i
  ) as Provider[];
  return order.filter((p) => cfg.providers[p]?.key);
}

export async function POST(req: NextRequest) {
  let body: { message?: unknown; history?: unknown; page?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 4000) {
    return NextResponse.json(
      { error: "A message (1–4000 chars) is required." },
      { status: 400 }
    );
  }
  const page = typeof body.page === "string" ? body.page.slice(0, 200) : "unknown";

  const history: ChatMsg[] = Array.isArray(body.history)
    ? (body.history as any[])
        .filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string"
        )
        .slice(-10)
        .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }))
    : [];

  const messages: ChatMsg[] = [
    ...history,
    { role: "user", content: `[The user is currently on the page: ${page}]\n\n${message}` }
  ];

  // Build the provider chain from admin settings, with an env fallback so the
  // assistant still works if settings aren't configured yet.
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
    return NextResponse.json({
      configured: false,
      reply:
        "The GoogolPlex Specialist isn't connected yet. Explore the site or reach us via the Contact page — we'll be glad to help."
    });
  }

  let lastErr: unknown = null;
  for (const a of attempts) {
    try {
      const reply = await callProvider(a.provider, a.key, a.model, SYSTEM, messages);
      if (reply) return NextResponse.json({ configured: true, provider: a.provider, reply });
    } catch (e) {
      lastErr = e;
      // try next provider in the chain
    }
  }

  console.error("[assistant] all providers failed", lastErr);
  return NextResponse.json(
    { error: "The assistant is temporarily unavailable. Please try again." },
    { status: 502 }
  );
}

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Default model per house style; override with ASSISTANT_MODEL (e.g. set it to
// claude-haiku-4-5 for a cheaper public-facing assistant).
const MODEL = process.env.ASSISTANT_MODEL || "claude-opus-4-7";

// Frozen system prompt → cached. Keep this byte-stable: do NOT interpolate
// timestamps / per-request data here, or the cache breaks. Page context is
// passed in the user turn instead.
const SYSTEM = `You are the GoogolPlex Specialist — a concise, warm AI guide embedded on the GoogolPlex website (ggakingclub.com).

About GoogolPlex: a Web3 + Social + AI ecosystem built around community. Key facts you can rely on:
- Onboarding starts at $1; every member is minted 10 billion personalized tokens at signup.
- Universal Smart Wallet: holds USDT/USDC/ETH/BNB/TRX/BTC and the PARTY token; deposits + withdrawals supported.
- AI Studio: generate a brand kit + deployable site; unlocking it is a one-time $18 fee payable in any supported coin.
- Services: The Social Hub, Universal Finance, Shared Wealth, City of Peace, AI-Powered Ventures (see /services).
- Founder/vision: Dr. Narendra Singh Khurana; ethos "Mother First. By Design." and "Har Maidan Fateh".

Style: friendly, brief (2-4 sentences unless asked for detail), plain language. Help users understand the ecosystem, navigate the site, and decide next steps (sign up, explore services, read the about page). If you don't know something specific, say so and point them to /contact. Never invent prices, token mechanics, or financial advice.`;

type IncomingMessage = { role: "user" | "assistant"; content: string };

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

  // Graceful degradation when the key isn't configured — no fake answers.
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      configured: false,
      reply:
        "The GoogolPlex Specialist isn't connected yet. In the meantime, explore the site or reach us via the Contact page — we'll be glad to help."
    });
  }

  const page =
    typeof body.page === "string" ? body.page.slice(0, 200) : "unknown";

  // Sanitize + cap history to the last 10 turns.
  const history: IncomingMessage[] = Array.isArray(body.history)
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

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    // Page context rides on the volatile user turn (keeps the system cache warm).
    { role: "user", content: `[The user is currently on the page: ${page}]\n\n${message}` }
  ];

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }
      ],
      messages
    });

    const reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return NextResponse.json({ configured: true, reply: reply || "…" });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: "Assistant auth failed." },
        { status: 502 }
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "The assistant is busy right now — please try again shortly." },
        { status: 429 }
      );
    }
    console.error("[assistant] error", error);
    return NextResponse.json(
      { error: "The assistant hit an error. Please try again." },
      { status: 500 }
    );
  }
}

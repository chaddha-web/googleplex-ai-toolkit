/**
 * Multi-provider chat completion with a normalized interface. Each function
 * takes (system, messages, model, key) and returns the assistant's text.
 * Used by /api/assistant with an active+fallback provider chain.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

export type ChatMsg = { role: "user" | "assistant"; content: string };
export type Provider = "anthropic" | "openai" | "gemini";

export const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-4o-mini",
  gemini: "gemini-1.5-flash"
};

const MAX_TOKENS = 1024;

async function callAnthropic(
  key: string,
  model: string,
  system: string,
  messages: ChatMsg[]
): Promise<string> {
  const client = new Anthropic({ apiKey: key });
  const res = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: messages.map((m) => ({ role: m.role, content: m.content }))
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

async function callOpenAI(
  key: string,
  model: string,
  system: string,
  messages: ChatMsg[]
): Promise<string> {
  const client = new OpenAI({ apiKey: key });
  const res = await client.chat.completions.create({
    model,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: "system", content: system },
      ...messages.map((m) => ({ role: m.role, content: m.content }))
    ]
  });
  return (res.choices[0]?.message?.content ?? "").trim();
}

async function callGemini(
  key: string,
  model: string,
  system: string,
  messages: ChatMsg[]
): Promise<string> {
  const genAI = new GoogleGenerativeAI(key);
  const m = genAI.getGenerativeModel({ model, systemInstruction: system });
  const contents = messages.map((x) => ({
    role: x.role === "assistant" ? "model" : "user",
    parts: [{ text: x.content }]
  }));
  const res = await m.generateContent({ contents });
  return res.response.text().trim();
}

export async function callProvider(
  provider: Provider,
  key: string,
  model: string | null,
  system: string,
  messages: ChatMsg[]
): Promise<string> {
  const mdl = model || DEFAULT_MODEL[provider];
  if (provider === "anthropic") return callAnthropic(key, mdl, system, messages);
  if (provider === "openai") return callOpenAI(key, mdl, system, messages);
  return callGemini(key, mdl, system, messages);
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Camera, Globe, Sparkles } from "@/components/icons";
import { LoopVideo } from "@/components/video";
import { SmartCta } from "@/components/smart-cta";
import { AssistantPanel } from "@/components/assistant-panel";
import { checkEmailExists } from "@/lib/auth-client";
import { VIDEOS } from "@/lib/assets";

/**
 * Hero email capture. Once a valid email is typed the round arrow button
 * expands to a pill reading "Get Started →". On submit we check whether an
 * account exists: if it does → /login (prefilled), else → /signup (prefilled).
 */
function HeroEmailForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    const addr = email.trim();
    try {
      const exists = await checkEmailExists(addr);
      const dest = exists ? "/login" : "/signup";
      router.push(`${dest}?email=${encodeURIComponent(addr)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 w-full max-w-xl">
      <div className="liquid-glass rounded-full pl-6 pr-2 py-2 flex items-center gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          className="flex-1 bg-transparent text-white placeholder:text-white/40 text-sm py-2 outline-none"
        />
        <button
          type="submit"
          disabled={!valid || busy}
          aria-label={valid ? "Get started" : "Enter your email"}
          className={`shrink-0 bg-white text-black hover:bg-white/90 transition-all duration-300 ease-out flex items-center justify-center gap-2 disabled:opacity-60 ${
            valid ? "rounded-full pl-5 pr-4 py-3 text-sm font-medium" : "rounded-full p-3"
          }`}
        >
          {valid && (
            <span className="whitespace-nowrap">
              {busy ? "Checking…" : "Get Started"}
            </span>
          )}
          <ArrowRight size={20} />
        </button>
      </div>
    </form>
  );
}

export function Hero() {
  const [assistantOpen, setAssistantOpen] = useState(false);
  return (
    <section className="min-h-screen relative overflow-hidden flex flex-col">
      {/* Background video */}
      <div className="absolute inset-0 w-full h-full">
        <LoopVideo
          src={VIDEOS.hero}
          placeholderClass="placeholder-video"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-black/60 pointer-events-none" />
      </div>

      {/* Nav */}
      <nav className="relative z-20 px-6 py-6">
        <div className="liquid-glass rounded-full max-w-5xl mx-auto px-6 py-3 flex justify-between items-center md:grid md:grid-cols-[1fr_auto_1fr]">
          {/* Left — logo */}
          <div className="flex items-center justify-self-start">
            <Link href="/" className="flex items-center gap-2 text-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="GoogolPlex"
                className="h-7 w-auto object-contain"
              />
              <span className="font-semibold text-lg tracking-tight">
                GoogolPlex
              </span>
            </Link>
          </div>

          {/* Center — 5 nav links */}
          <div className="hidden md:flex gap-8 justify-self-center">
            {[
              { label: "About", href: "#about" },
              { label: "Partners", href: "#partners" },
              { label: "Vision", href: "#vision" },
              { label: "Benefit", href: "#benefit" },
              { label: "Contact", href: "#contact" }
            ].map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="text-white/80 hover:text-white text-sm font-medium transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </div>

          {/* Right — CTA (becomes "Continue →" if a session is restored) */}
          <div className="flex items-center justify-self-end">
            <SmartCta className="liquid-glass rounded-full px-6 py-2 text-white text-sm font-medium" />
          </div>
        </div>
      </nav>

      {/* Hero content — centered: heading → subtitle → email pill */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
        <h1 className="font-serif text-white tracking-tight whitespace-nowrap text-6xl sm:text-7xl md:text-8xl lg:text-9xl">
          Know it <em className="font-serif-i">all</em>
        </h1>

        <p className="mt-6 text-white text-sm leading-relaxed px-4 max-w-xl">
          Redefine connectivity with the Googolplex ecosystem. It&rsquo;s never
          too late to begin a new journey where community is everything.
        </p>

        <HeroEmailForm />
      </div>

      {/* Bottom row: manifesto (left) — socials (right) */}
      <div className="relative z-10 w-full flex flex-col md:flex-row md:items-end md:justify-between gap-6 px-6 md:px-12 pb-12">
        <div className="flex md:justify-start justify-center">
          <a
            href="/Googolplex_Whitepaper.pdf"
            download="Googolplex_Whitepaper.pdf"
            className="liquid-glass rounded-full px-8 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors"
          >
            View Whitepaper
          </a>
        </div>

        <div className="flex md:justify-end justify-center gap-4">
          {/* Camera — the film */}
          <div className="relative group">
            <Link
              href="/video"
              aria-label="Watch the GoogolPlex film"
              className="liquid-glass rounded-full p-4 text-white/80 hover:text-white hover:bg-white/5 transition-all inline-flex"
            >
              <Camera size={20} strokeWidth={1.6} />
            </Link>
            <span className="pointer-events-none absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/80 px-3 py-1 text-[11px] text-white/80 opacity-0 group-hover:opacity-100 transition-opacity">
              The film
            </span>
          </div>

          {/* AI Specialist — opens the assistant panel */}
          <div className="relative group">
            <button
              type="button"
              onClick={() => setAssistantOpen(true)}
              aria-label="Open the GoogolPlex AI specialist"
              className="liquid-glass rounded-full p-4 text-white/80 hover:text-white hover:bg-white/5 transition-all"
            >
              <Sparkles size={20} strokeWidth={1.6} />
            </button>
            <span className="pointer-events-none absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/80 px-3 py-1 text-[11px] text-white/80 opacity-0 group-hover:opacity-100 transition-opacity">
              Ask the AI
            </span>
          </div>

          {/* Globe — into the story */}
          <div className="relative group">
            <Link
              href="/about"
              aria-label="About the GoogolPlex ecosystem"
              className="liquid-glass rounded-full p-4 text-white/80 hover:text-white hover:bg-white/5 transition-all inline-flex"
            >
              <Globe size={20} strokeWidth={1.6} />
            </Link>
            <span className="pointer-events-none absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/80 px-3 py-1 text-[11px] text-white/80 opacity-0 group-hover:opacity-100 transition-opacity">
              Our story
            </span>
          </div>
        </div>
      </div>

      <AssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} />
    </section>
  );
}

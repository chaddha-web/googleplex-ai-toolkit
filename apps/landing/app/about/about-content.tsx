"use client";

import Link from "next/link";
import NextImage from "next/image";
import { motion } from "framer-motion";
import { SiteNav } from "@/components/site-nav";
import { SiteFooterCard } from "@/components/site-footer-card";
import { ArrowLeft } from "@/components/icons";
import { AssetLoader } from "@/components/asset-loader";

/* Only the above-the-fold assets gate the splash — logo + the hero portrait.
 * The big AI images further down the page stream in lazily as the user
 * scrolls (see FullImage `loading`), so the loader exits fast instead of
 * waiting on multi-MB artwork the visitor hasn't reached yet. */
const ABOUT_CRITICAL_IMAGES = [
  "/logo.png",
  "https://i.ibb.co/DfbCrkgc/image.png" // Dr. Narendra Singh Khurana (first visible)
];

/* ──────────────────────────────────────────────────────────────────────────
 * Shared motion presets
 * ────────────────────────────────────────────────────────────────────────── */
const rise = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.7, ease: [0.21, 0.6, 0.35, 1] as const }
};

const pop = {
  initial: { opacity: 0, y: 60, scale: 0.92, filter: "blur(8px)" },
  whileInView: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
  viewport: { once: true, margin: "-120px" },
  transition: { type: "spring" as const, stiffness: 120, damping: 14, mass: 0.9 }
};

/* Accent palette — rotated per section to keep the long page lively. */
const ACCENTS = {
  gold: "from-amber-200 via-yellow-300 to-amber-400",
  violet: "from-violet-300 via-fuchsia-300 to-indigo-300",
  emerald: "from-emerald-200 via-teal-300 to-cyan-300",
  rose: "from-rose-200 via-pink-300 to-fuchsia-300",
  sky: "from-sky-200 via-cyan-300 to-blue-300"
} as const;
type Accent = keyof typeof ACCENTS;

function Gradient({ accent = "gold", children }: { accent?: Accent; children: React.ReactNode }) {
  return (
    <span className={`bg-gradient-to-r ${ACCENTS[accent]} bg-clip-text text-transparent`}>
      {children}
    </span>
  );
}

function Eyebrow({ accent = "gold", children }: { accent?: Accent; children: React.ReactNode }) {
  const dot = {
    gold: "bg-amber-300",
    violet: "bg-fuchsia-300",
    emerald: "bg-emerald-300",
    rose: "bg-pink-300",
    sky: "bg-cyan-300"
  }[accent];
  return (
    <motion.p {...rise} className="flex items-center gap-2 text-white/50 text-xs tracking-[0.3em] uppercase mb-5">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </motion.p>
  );
}

/* Image — full size, springs up on scroll. Side-by-side capable. */
function FullImage({
  src,
  alt = "",
  label,
  caption,
  aspect = "aspect-[4/3]",
  priority = false,
  w = 1600,
  h = 1200,
  sizes = "(max-width: 1024px) 100vw, 50vw"
}: {
  src?: string;
  alt?: string;
  label: string;
  caption?: string;
  aspect?: string;
  /** First/above-fold image fetches eagerly; everything else lazy-loads. */
  priority?: boolean;
  /** REAL intrinsic pixel size — so next/image keeps the true aspect ratio. */
  w?: number;
  h?: number;
  sizes?: string;
}) {
  return (
    <motion.figure {...pop} className="w-full">
      {src ? (
        <div className="rounded-[2rem] overflow-hidden ring-1 ring-white/10 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
          {/* next/image: auto AVIF/WebP + resize to the displayed size + long
              device cache (see next.config minimumCacheTTL + headers). The
              w/h MUST match the source's true ratio or the box distorts. */}
          <NextImage
            src={src}
            alt={alt}
            width={w}
            height={h}
            sizes={sizes}
            priority={priority}
            loading={priority ? "eager" : "lazy"}
            className="block w-full h-auto"
          />
        </div>
      ) : (
        <div className={`relative w-full ${aspect} rounded-[2rem] overflow-hidden liquid-glass flex items-center justify-center`}>
          <div className="text-center px-6">
            <div className="mx-auto mb-4 h-12 w-12 rounded-2xl border border-dashed border-white/30 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/40">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </div>
            <p className="text-white/50 text-xs tracking-[0.3em] uppercase">{label}</p>
            <p className="text-white/25 text-[11px] mt-1">Image placeholder · drop artwork here</p>
          </div>
        </div>
      )}
      {caption ? (
        <figcaption className="text-white/40 text-xs mt-3">{caption}</figcaption>
      ) : null}
    </motion.figure>
  );
}

const PILLARS = [
  { n: "01", a: "violet" as Accent, h: "Universal Smart Wallet & Global Identity", b: "A secure, universal digital wallet paired with a verifiable, zero-knowledge global identity — intelligent wealth management and financial inclusion for all, bridging fiat and digital assets." },
  { n: "02", a: "sky" as Accent, h: "The AI Learning Engine", b: "An adaptive, personalized education system in 100+ languages, delivering lifelong learning, skill certification and career pathways to learners of every age." },
  { n: "03", a: "emerald" as Accent, h: "Health AI", b: "A preventive intelligence module that analyzes lifestyle data to provide wellness coaching, mental-wellness tools and early health insights before problems escalate." },
  { n: "04", a: "rose" as Accent, h: "The Global Community Hub", b: "A borderless collaboration network where members share projects, vote in transparent DAO governance and support each other's ideas." },
  { n: "05", a: "gold" as Accent, h: "The Spiritual Layer", b: "A culturally neutral space for daily mindfulness, reflection and inner-peace tools — honoring all traditions without imposing any single doctrine." }
];

const GENERATIONS = [
  { h: "Children · 6–12", b: "Gamified learning, age-appropriate content and strict parental oversight for safe digital exploration.", a: "sky" as Accent },
  { h: "Youth · 13–25", b: "Career discovery, financial literacy and community-building tools.", a: "violet" as Accent },
  { h: "Adults · 26–60", b: "Professional growth, family financial management, health optimization and civic participation.", a: "emerald" as Accent },
  { h: "Seniors · 60+", b: "Simplified, large-text and voice-first interfaces prioritizing health monitoring and legacy planning.", a: "gold" as Accent }
];

const STATS = [
  { v: "3.7B", l: "people digitally underserved", a: "rose" as Accent },
  { v: "$8T", l: "lost economic value globally", a: "gold" as Accent },
  { v: "30–40", l: "disconnected apps used daily", a: "sky" as Accent }
];

export function AboutContent() {
  return (
    <AssetLoader images={ABOUT_CRITICAL_IMAGES} warmKey="about" maxWaitMs={5000}>
    <main className="relative w-full min-h-screen overflow-x-hidden flex flex-col items-center font-sans selection:bg-amber-200/30 selection:text-white bg-black">
      {/* Vibrant aurora wash — gold + violet + emerald, low saturation so type stays readable */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute -top-32 -left-32 w-[42rem] h-[42rem] rounded-full bg-[radial-gradient(circle,_rgba(180,140,255,0.18)_0%,_transparent_70%)] blur-2xl" />
        <div className="absolute top-1/3 -right-40 w-[40rem] h-[40rem] rounded-full bg-[radial-gradient(circle,_rgba(245,196,81,0.16)_0%,_transparent_70%)] blur-2xl" />
        <div className="absolute bottom-0 left-1/4 w-[38rem] h-[38rem] rounded-full bg-[radial-gradient(circle,_rgba(52,211,153,0.12)_0%,_transparent_70%)] blur-2xl" />
      </div>
      <div className="fixed inset-0 z-[1] pointer-events-none stars" />

      <div className="relative z-10 w-full max-w-[110rem] flex flex-col items-center flex-1">
        <SiteNav />

        <div className="w-full px-6 md:px-12 lg:px-20 pt-10 md:pt-16 pb-24 md:pb-40">
          <Link href="/" className="inline-flex items-center gap-2 text-white/50 hover:text-white text-xs transition-colors mb-12">
            <ArrowLeft size={14} /> Back to home
          </Link>

          {/* ── HERO — full bleed, big gradient H1 ─────────────────────── */}
          <header className="max-w-6xl">
            <Eyebrow accent="gold">About GoogolPlex</Eyebrow>
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.05 }}
              className="font-serif text-white tracking-tight text-5xl md:text-7xl lg:text-[5.5rem] leading-[1.02]"
            >
              Architecting the{" "}
              <Gradient accent="gold">unified digital future</Gradient>{" "}
              for humanity.
            </motion.h1>
            <motion.p {...rise} className="text-white/70 text-lg md:text-2xl leading-relaxed max-w-4xl mt-8 font-light">
              We are a <strong className="text-white font-medium">Web3, Social &amp; AI Studio</strong>{" "}
              pioneering ideas for minds that create, build and inspire — building the{" "}
              <strong className="text-white font-medium">Googolplex AI Power Box</strong>, humanity&apos;s
              first <Gradient accent="violet">Unified Life Operating System</Gradient>. The most ambitious
              and ethical attempt to unify the human digital experience in history.
            </motion.p>
          </header>

          {/* ── VISIONARY — full-width 2-col spread ────────────────────── */}
          <section className="mt-28 md:mt-40 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div>
              <Eyebrow accent="gold">The Visionary</Eyebrow>
              <motion.h2 {...rise} className="font-serif text-white tracking-tight text-4xl md:text-6xl leading-[1.05]">
                The vision of{" "}
                <Gradient accent="gold">Dr. Narendra Singh Khurana</Gradient>
              </motion.h2>
              <motion.p {...rise} className="text-white/70 text-base md:text-lg leading-relaxed mt-7">
                Guided by the visionary leadership of{" "}
                <strong className="text-white">Dr. Narendra Singh Khurana</strong> and the{" "}
                <strong className="text-white">Googolplex Smiles Party Billionaires Club</strong>,
                we operate under the banner of the{" "}
                <em className="font-serif-i text-amber-200/90">&ldquo;Har Maidan Fateh&rdquo;</em>{" "}
                vision — driving a global <strong className="text-white">Peace with Prosperity
                movement</strong> where no one is left behind.
              </motion.p>
              <motion.p {...rise} className="text-white/70 text-base md:text-lg leading-relaxed mt-5">
                Our belief is simple: <Gradient accent="gold">One Team. One Family. One Future.</Gradient>{" "}
                We do not ask anyone to change their faith, culture or language — only to add love to
                their prayers and join us in building a world where everyone prospers.
              </motion.p>
            </div>
            {/* IMAGE 1 — Dr. Narendra Singh Khurana */}
            <FullImage
              src="https://i.ibb.co/DfbCrkgc/image.png"
              alt="Dr. Narendra Singh Khurana"
              label="Dr. Narendra Singh Khurana"
              caption="Founder & visionary — Dr. Narendra Singh Khurana"
              priority
              w={1290}
              h={1340}
            />
          </section>

          {/* ── PHILOSOPHY — centered statement ────────────────────────── */}
          <section className="mt-28 md:mt-40 text-center max-w-4xl mx-auto">
            <Eyebrow accent="rose"><span className="mx-auto">Our Core Philosophy</span></Eyebrow>
            <motion.h2 {...rise} className="font-serif tracking-tight text-5xl md:text-7xl leading-[1.05]">
              <Gradient accent="rose">Mother First.</Gradient>{" "}
              <span className="text-white">By Design.</span>
            </motion.h2>
            <motion.p {...rise} className="text-white/70 text-lg leading-relaxed mt-7">
              Everything we build is anchored in a profound philosophy. Our technology is built with
              love, deployed with integrity, and designed to be inherently safe, caring and easy to
              use. We prioritize inclusive design so the platform is accessible to everyone — from an
              <strong className="text-white"> 8-year-old</strong> in a safe learning space to an{" "}
              <strong className="text-white">80-year-old</strong> navigating a voice-first interface.
            </motion.p>
          </section>

          {/* ── CRISIS + STATS strip ───────────────────────────────────── */}
          <section className="mt-28 md:mt-40">
            <div className="max-w-3xl">
              <Eyebrow accent="rose">The Problem</Eyebrow>
              <motion.h2 {...rise} className="font-serif text-white tracking-tight text-4xl md:text-6xl leading-[1.05]">
                The global crisis we are <Gradient accent="rose">solving</Gradient>.
              </motion.h2>
              <motion.p {...rise} className="text-white/70 text-base md:text-lg leading-relaxed mt-7 max-w-2xl">
                The modern digital world is broken and fragmented — causing decision fatigue, scattered
                data and massive exclusion.
              </motion.p>
            </div>
            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-5">
              {STATS.map((s, i) => (
                <motion.div
                  key={s.l}
                  {...rise}
                  transition={{ ...rise.transition, delay: i * 0.1 }}
                  className="liquid-glass rounded-3xl p-8"
                >
                  <p className={`font-serif text-6xl md:text-7xl tracking-tight ${`bg-gradient-to-r ${ACCENTS[s.a]} bg-clip-text text-transparent`}`}>
                    {s.v}
                  </p>
                  <p className="text-white/60 text-sm mt-3 leading-relaxed">{s.l}</p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* IMAGE 2 — AI Power Box, full bleed */}
          <section className="mt-28 md:mt-40">
            <div className="max-w-3xl mb-10">
              <Eyebrow accent="violet">Our Revolutionary Solution</Eyebrow>
              <motion.h2 {...rise} className="font-serif text-white tracking-tight text-4xl md:text-6xl leading-[1.05]">
                The <Gradient accent="violet">Googolplex AI Power Box</Gradient> Toolkit
              </motion.h2>
              <motion.p {...rise} className="text-white/70 text-base md:text-lg leading-relaxed mt-7 max-w-2xl">
                Humanity&apos;s first <strong className="text-white">Unified Life Operating
                System</strong> — a fully integrated, AI-driven ecosystem touching every dimension of
                human life: financial, educational, spiritual, social, physical and civic. Our rallying
                cry: <Gradient accent="violet">&ldquo;From Fragmented Apps to One Unified System.&rdquo;</Gradient>
              </motion.p>
            </div>
            <FullImage src="https://i.ibb.co/mrLdXKsY/Generated-Image-May-20-2026-12-22-PM.jpg" alt="Googolplex AI Power Box" label="Googolplex AI Power Box" caption="From fragmented apps to one unified system." w={5632} h={3072} sizes="100vw" />

            {/* 5 pillars — vibrant grid */}
            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {PILLARS.map((p, i) => (
                <motion.div
                  key={p.h}
                  {...rise}
                  transition={{ ...rise.transition, delay: (i % 3) * 0.08 }}
                  className="group liquid-glass rounded-3xl p-7 hover:bg-white/[0.03] transition-colors"
                >
                  <p className={`font-serif text-4xl tracking-tight ${`bg-gradient-to-r ${ACCENTS[p.a]} bg-clip-text text-transparent`}`}>
                    {p.n}
                  </p>
                  <h3 className="text-white text-lg font-medium mt-4">{p.h}</h3>
                  <p className="text-white/60 text-sm leading-relaxed mt-2">{p.b}</p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* ── ARCHITECTURE + IMAGE 3 spread ──────────────────────────── */}
          {/* Text first in DOM → mobile reads text→image (image explains the
              copy, so it should follow it); on lg the grid still puts text
              left / image right. items-start avoids the tall-column void. */}
          <section className="mt-20 md:mt-40 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-start">
            <div>
              <Eyebrow accent="emerald">Technical Architecture</Eyebrow>
              <motion.h2 {...rise} className="font-serif text-white tracking-tight text-4xl md:text-6xl leading-[1.05]">
                <Gradient accent="emerald">Integrate,</Gradient> don&apos;t rebuild.
              </motion.h2>
              <motion.p {...rise} className="text-white/70 text-base md:text-lg leading-relaxed mt-7">
                Instead of spending years and billions rebuilding what already exists, we orchestrate
                the world&apos;s best-in-class APIs for AI, finance and cloud — delivering elite
                capabilities at a fraction of the time and cost. Built on a{" "}
                <strong className="text-white">Zero Trust</strong> model with end-to-end encryption,
                strictly protected by global compliance (GDPR, KYC, AML) and{" "}
                <strong className="text-white">never exploited for advertising</strong>.{" "}
                Our <strong className="text-white">Voice AI</strong> lets users speak naturally in 50+
                languages.
              </motion.p>
              <div className="mt-8 grid grid-cols-3 gap-3 sm:gap-4">
                {[
                  { v: "1B", l: "concurrent users", a: "emerald" as Accent },
                  { v: "<200ms", l: "global response", a: "sky" as Accent },
                  { v: "99.99%", l: "uptime SLA", a: "violet" as Accent }
                ].map((x) => (
                  <div key={x.l}>
                    <p className={`font-serif text-2xl sm:text-3xl tracking-tight whitespace-nowrap ${`bg-gradient-to-r ${ACCENTS[x.a]} bg-clip-text text-transparent`}`}>{x.v}</p>
                    <p className="text-white/50 text-[11px] sm:text-xs mt-1 leading-snug">{x.l}</p>
                  </div>
                ))}
              </div>
            </div>
            <FullImage src="https://i.ibb.co/9m7nkx3v/Generated-Image-May-20-2026-12-26-PM.jpg" alt="Planetary-scale architecture" label="Planetary-scale architecture" caption="Built for 1 billion concurrent users — Zero Trust by foundation." w={5504} h={3072} />
          </section>

          {/* ── INCLUSION — full-width grid ────────────────────────────── */}
          <section className="mt-28 md:mt-40">
            <div className="max-w-3xl">
              <Eyebrow accent="sky">True Inclusion</Eyebrow>
              <motion.h2 {...rise} className="font-serif text-white tracking-tight text-4xl md:text-6xl leading-[1.05]">
                Built for <Gradient accent="sky">every generation</Gradient>.
              </motion.h2>
              <motion.p {...rise} className="text-white/70 text-base md:text-lg leading-relaxed mt-7 max-w-2xl">
                Technology must adapt to the human — not the other way around. No demographic is left
                behind, across <strong className="text-white">200 countries</strong> and{" "}
                <strong className="text-white">50+ languages</strong> (scaling to 100+).
              </motion.p>
            </div>
            <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {GENERATIONS.map((g, i) => (
                <motion.div
                  key={g.h}
                  {...rise}
                  transition={{ ...rise.transition, delay: i * 0.08 }}
                  className="liquid-glass rounded-3xl p-7"
                >
                  <h3 className={`text-sm font-medium tracking-wide ${`bg-gradient-to-r ${ACCENTS[g.a]} bg-clip-text text-transparent`}`}>{g.h}</h3>
                  <p className="text-white/60 text-sm leading-relaxed mt-2.5">{g.b}</p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* IMAGE 4 — community, full bleed */}
          <section className="mt-28 md:mt-40">
            <div className="max-w-3xl mb-10">
              <Eyebrow accent="rose">One Team. One Family. One Future.</Eyebrow>
              <motion.h2 {...rise} className="font-serif text-white tracking-tight text-4xl md:text-6xl leading-[1.05]">
                A <Gradient accent="rose">borderless community</Gradient> of creators.
              </motion.h2>
            </div>
            <FullImage src="https://i.ibb.co/5XK8QkvS/Generated-Image-May-20-2026-12-45-PM.jpg" alt="One Team. One Family. One Future." label="One Team. One Family. One Future." caption="A borderless community spanning 200 countries." w={6336} h={2688} sizes="100vw" />
          </section>

          {/* ── TOKENOMICS ─────────────────────────────────────────────── */}
          <section className="mt-28 md:mt-40">
            <div className="max-w-3xl">
              <Eyebrow accent="gold">The $1 Journey</Eyebrow>
              <motion.h2 {...rise} className="font-serif text-white tracking-tight text-4xl md:text-6xl leading-[1.05]">
                Revolutionary <Gradient accent="gold">tokenomics</Gradient>.
              </motion.h2>
              <motion.p {...rise} className="text-white/70 text-base md:text-lg leading-relaxed mt-7 max-w-2xl">
                Every user is a creator and an owner. A simple{" "}
                <strong className="text-white">$1 onboarding investment</strong> unlocks a wallet
                pre-loaded with <Gradient accent="gold">10 billion personalized tokens</Gradient>{" "}
                minted in your name.
              </motion.p>
            </div>
            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                { h: "10 Billion tokens", b: "Minted in your name on a $1 onboarding investment — you become a true stakeholder in the digital economy.", a: "gold" as Accent },
                { h: "Strategic distribution", b: "6B to the community pool, 2B to you (1B tradeable, 1B locked for future generations), 2B in platform reserves.", a: "violet" as Accent },
                { h: "The Commitment Rule", b: "Withdraw your initial $1 and all tokens return to the community pool — value is protected and shared only among committed members.", a: "emerald" as Accent }
              ].map((x, i) => (
                <motion.div
                  key={x.h}
                  {...rise}
                  transition={{ ...rise.transition, delay: i * 0.1 }}
                  className="liquid-glass rounded-3xl p-8"
                >
                  <h3 className={`font-serif text-2xl tracking-tight ${`bg-gradient-to-r ${ACCENTS[x.a]} bg-clip-text text-transparent`}`}>{x.h}</h3>
                  <p className="text-white/60 text-sm leading-relaxed mt-3">{x.b}</p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* ── DAO + SPRINT row ───────────────────────────────────────── */}
          <section className="mt-28 md:mt-40 grid grid-cols-1 lg:grid-cols-2 gap-8">
            <motion.div {...rise} className="liquid-glass rounded-[2rem] p-10">
              <Eyebrow accent="violet">Decentralized Governance</Eyebrow>
              <h2 className="font-serif text-white tracking-tight text-3xl md:text-4xl leading-tight">
                DAO 3.0 &amp; <Gradient accent="violet">Lex Cryptographica</Gradient>
              </h2>
              <p className="text-white/65 text-base leading-relaxed mt-5">
                Rules that are transparent, cryptographic and community-owned. Our{" "}
                <strong className="text-white">Social Reputation Ranking (SRR)</strong> algorithm ties
                voting power to genuine, verified contributions — not wealth — preventing
                &ldquo;whale&rdquo; manipulation and rewarding true community leaders.
              </p>
            </motion.div>
            <motion.div {...rise} className="liquid-glass rounded-[2rem] p-10">
              <Eyebrow accent="emerald">Rapid Execution</Eyebrow>
              <h2 className="font-serif text-white tracking-tight text-3xl md:text-4xl leading-tight">
                The <Gradient accent="emerald">9-month</Gradient> sprint
              </h2>
              <p className="text-white/65 text-base leading-relaxed mt-5">
                Platforms of this scale take 5+ years and hundreds of millions. Our{" "}
                <strong className="text-white">&ldquo;Integrate, Don&apos;t Rebuild&rdquo;</strong>{" "}
                strategy yields <strong className="text-white">80% faster development</strong> and{" "}
                <strong className="text-white">70% lower cost</strong> — a full MVP to market in just{" "}
                9 months.
              </p>
            </motion.div>
          </section>

          {/* ── ULTIMATE VISION — full-bleed gradient finale ───────────── */}
          <section className="mt-28 md:mt-40">
            <motion.div
              {...rise}
              className="relative overflow-hidden rounded-[2.5rem] p-10 md:p-20 text-center"
              style={{
                background:
                  "linear-gradient(135deg, rgba(245,196,81,0.14) 0%, rgba(180,140,255,0.14) 50%, rgba(52,211,153,0.12) 100%)"
              }}
            >
              <div className="absolute inset-0 ring-1 ring-white/10 rounded-[2.5rem] pointer-events-none" />
              <p className="text-white/50 text-xs tracking-[0.3em] uppercase mb-6">Our Ultimate Vision</p>
              <h2 className="font-serif tracking-tight text-5xl md:text-8xl leading-[1.0]">
                <Gradient accent="gold">1,000 billionaires.</Gradient>
                <br />
                <span className="text-white">9 billion empowered lives.</span>
              </h2>
              <p className="text-white/70 text-lg leading-relaxed mt-8 max-w-3xl mx-auto">
                Our first milestone: create <strong className="text-white">1,000 billionaires</strong>{" "}
                through community collaboration — proving shared global prosperity is genuinely
                possible. Over 10 years we scale to <strong className="text-white">9 billion
                members</strong>, making unified intelligence accessible to every human on Earth.
              </p>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <Link href="/signup" className="rounded-full px-8 py-3.5 text-black text-sm font-semibold bg-gradient-to-r from-amber-200 to-yellow-400 hover:from-amber-100 hover:to-yellow-300 transition-all">
                  Begin your $1 journey
                </Link>
                <Link
                  href="/Googolplex_Whitepaper.pdf"
                  download="Googolplex_Whitepaper.pdf"
                  className="liquid-glass rounded-full px-8 py-3.5 text-white text-sm font-medium hover:bg-white/5 transition-colors"
                >
                  View Whitepaper
                </Link>
              </div>
            </motion.div>
          </section>
        </div>
      </div>

      <div className="relative z-10 w-full px-6 pb-10 max-w-[110rem] mx-auto">
        <SiteFooterCard />
      </div>
    </main>
    </AssetLoader>
  );
}

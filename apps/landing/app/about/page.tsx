"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { SiteNav } from "@/components/site-nav";
import { SiteFooterCard } from "@/components/site-footer-card";
import { ArrowLeft } from "@/components/icons";

const pillars = [
  {
    tag: "01 · Vision",
    title: "Curiosity over certainty",
    body: "We believe that the most interesting questions are the ones that don't have obvious answers yet — and that the right team can turn those questions into platforms."
  },
  {
    tag: "02 · Craft",
    title: "Calm, premium experiences",
    body: "Every surface is treated as a piece of editorial: typography that reads, motion that breathes, and information design that respects the reader's attention."
  },
  {
    tag: "03 · Community",
    title: "Built in the open",
    body: "Web3, social and AI live or die by their communities. We design for participation from day one — governance, attribution and trust baked into the foundation."
  }
];

export default function AboutPage() {
  return (
    <main className="relative w-full min-h-screen overflow-x-hidden flex flex-col items-center font-sans selection:bg-white/20 selection:text-white bg-black">
      {/* Subtle radial glow */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.05)_0%,_transparent_60%)]" />
      <div className="fixed inset-0 z-[1] pointer-events-none stars" />

      <div className="relative z-10 w-full max-w-7xl flex flex-col items-center flex-1">
        <SiteNav />

        <section className="w-full px-6 pt-12 md:pt-24 pb-24 md:pb-40">
          {/* Back link */}
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-white/50 hover:text-white text-xs transition-colors mb-12"
          >
            <ArrowLeft size={14} /> Back to home
          </Link>

          {/* Eyebrow */}
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-white/40 text-xs tracking-[0.3em] uppercase mb-6"
          >
            About GoogolPlex
          </motion.p>

          {/* Hero heading */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.05 }}
            className="font-serif text-white tracking-tight text-5xl md:text-7xl lg:text-8xl leading-[1.05] max-w-4xl"
          >
            A platform for{" "}
            <span className="font-serif-i text-white/60">curious teams</span> who
            ship calm, premium work.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="text-white/70 text-base md:text-lg leading-relaxed max-w-2xl mt-8"
          >
            GoogolPlex is the operating layer for a new kind of ecosystem — one
            where Web3 governance, social presence and AI-native tooling are
            treated as a single, coherent surface rather than three separate
            stacks bolted together.
          </motion.p>

          {/* Three pillars */}
          <div className="mt-20 md:mt-28 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {pillars.map((p, i) => (
              <motion.div
                key={p.tag}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.4 + i * 0.12 }}
                className="liquid-glass rounded-3xl p-6 md:p-8"
              >
                <p className="text-white/40 text-xs tracking-widest uppercase mb-4">
                  {p.tag}
                </p>
                <h3 className="font-serif text-white text-2xl md:text-3xl tracking-tight mb-3">
                  {p.title}
                </h3>
                <p className="text-white/60 text-sm leading-relaxed">{p.body}</p>
              </motion.div>
            ))}
          </div>

          {/* CTA back to home */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.85 }}
            className="mt-20 md:mt-28 flex flex-wrap items-center gap-3"
          >
            <Link
              href="/signup"
              className="liquid-glass rounded-full px-8 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors"
            >
              Get Started
            </Link>
            <Link
              href="/Googolplex_Whitepaper.pdf"
              download="Googolplex_Whitepaper.pdf"
              className="liquid-glass rounded-full px-8 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors"
            >
              View Whitepaper
            </Link>
          </motion.div>
        </section>
      </div>

      <div className="relative z-10 w-full px-6 pb-10 max-w-7xl mx-auto">
        <SiteFooterCard />
      </div>
    </main>
  );
}

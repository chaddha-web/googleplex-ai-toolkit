"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { FooterBgVideo } from "@/components/video";
import { SiteNav } from "@/components/site-nav";
import { SiteFooterCard } from "@/components/site-footer-card";
import { ArrowLeft, ArrowRight, Search } from "@/components/icons";
import { VIDEOS } from "@/lib/assets";

const suggested = [
  { label: "Features", sub: "What Googolplex can do", href: "#" },
  { label: "Pricing", sub: "Plans for every team", href: "#" },
  { label: "Manifesto", sub: "Our philosophy in full", href: "#" }
];

export default function NotFound() {
  return (
    <main className="relative w-full min-h-[115vh] overflow-x-hidden flex flex-col items-center font-sans selection:bg-white/20 selection:text-white">
      {/* Background video — fixed, full viewport */}
      <div className="fixed inset-0 z-0">
        <FooterBgVideo src={VIDEOS.footer} />
      </div>
      {/* Readability scrim + drifting stars */}
      <div className="fixed inset-0 z-[1] pointer-events-none bg-gradient-to-b from-black/40 via-black/30 to-black/70" />
      <div className="fixed inset-0 z-[2] pointer-events-none stars" />

      <div className="relative z-10 w-full max-w-7xl flex flex-col items-center flex-1">
        <SiteNav />

        <section className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pt-8 pb-24 text-center">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-white/40 text-xs tracking-[0.3em] uppercase mb-6"
          >
            Error · 404
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.05 }}
            className="font-serif text-white tracking-tight leading-none text-[26vw] md:text-[18vw] lg:text-[260px]"
            style={{ lineHeight: 0.88 }}
          >
            4<span className="font-serif-i text-white/60">0</span>4
          </motion.h1>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.25 }}
            className="font-serif text-white text-4xl md:text-6xl lg:text-7xl tracking-tight mt-4"
          >
            Lost in <span className="font-serif-i text-white/60">space</span>.
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="text-white/70 text-sm md:text-base leading-relaxed max-w-xl mt-6 px-4"
          >
            The page you were looking for has drifted beyond the edge of the map.
            Don&apos;t worry — every wrong turn opens a new door to discovery.
          </motion.p>

          {/* Search */}
          <motion.form
            onSubmit={(e) => e.preventDefault()}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="mt-8 max-w-xl w-full"
          >
            <div className="liquid-glass rounded-full pl-6 pr-2 py-2 flex items-center gap-3">
              <Search size={18} className="text-white/50 shrink-0" />
              <input
                type="text"
                placeholder="Search the archive"
                className="flex-1 bg-transparent text-white placeholder:text-white/40 text-sm py-2"
              />
              <button
                type="submit"
                aria-label="Search"
                className="bg-white rounded-full p-3 text-black hover:bg-white/90 transition"
              >
                <ArrowRight size={20} />
              </button>
            </div>
          </motion.form>

          {/* Action chips */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.6 }}
            className="mt-6 flex flex-wrap items-center justify-center gap-3"
          >
            <Link
              href="/"
              className="liquid-glass rounded-full px-6 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors inline-flex items-center gap-2"
            >
              <ArrowLeft size={16} /> Back to home
            </Link>
            <Link
              href="#"
              className="liquid-glass rounded-full px-6 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors"
            >
              Read the manifesto
            </Link>
          </motion.div>

          {/* Suggested links */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.75 }}
            className="mt-16 w-full max-w-3xl"
          >
            <p className="text-white/40 text-xs tracking-widest uppercase mb-5">
              You might be looking for
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {suggested.map((it) => (
                <Link
                  key={it.label}
                  href={it.href}
                  className="liquid-glass rounded-2xl p-4 text-left flex items-start justify-between gap-3 hover:bg-white/5 transition-colors group"
                >
                  <div>
                    <p className="text-white text-sm font-medium">{it.label}</p>
                    <p className="text-white/50 text-xs mt-1">{it.sub}</p>
                  </div>
                  <div className="text-white/40 group-hover:text-white transition-colors mt-0.5">
                    <ArrowRight size={16} />
                  </div>
                </Link>
              ))}
            </div>
          </motion.div>
        </section>
      </div>

      <div className="relative z-10 w-full px-6 pb-10 max-w-7xl mx-auto mt-16 md:mt-24">
        <SiteFooterCard />
      </div>
    </main>
  );
}

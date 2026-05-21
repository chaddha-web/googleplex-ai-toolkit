"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft } from "@/components/icons";
import { TESTIMONIALS } from "@/lib/testimonials";

// ── Shared bits ────────────────────────────────────────────────────────────

function Portrait({
  src,
  alt
}: {
  src: string;
  alt: string;
}) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={(e) => {
        const t = e.currentTarget;
        t.style.display = "none";
        if (t.parentElement) {
          t.parentElement.style.background =
            "linear-gradient(160deg, #d4c0a8, #5a4530)";
        }
      }}
      className="w-full h-full object-cover"
    />
  );
}

function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2l2.4 1.8 3 .2.9 2.9 2.2 2-1 2.8 1 2.8-2.2 2-.9 2.9-3 .2L12 22l-2.4-1.8-3-.2-.9-2.9-2.2-2 1-2.8-1-2.8 2.2-2 .9-2.9 3-.2L12 2z" />
        <path d="M10.6 14.6l-2.1-2.1-1.1 1.1 3.2 3.2 5.6-5.6-1.1-1.1z" fill="#fff" />
      </svg>
      Verified
    </span>
  );
}

// ── Concept 1: Interactive hover grid ───────────────────────────────────────

type Pos = { l: string; t: number; w: number };

// 9 unique headshots framing the headline; the center column above the text is
// intentionally left open so the typography reads cleanly.
const POS: Pos[] = [
  { l: "3%", t: 120, w: 120 },
  { l: "13%", t: 50, w: 132 },
  { l: "24%", t: 88, w: 120 },
  { l: "9%", t: 222, w: 120 },
  { l: "39%", t: 56, w: 126 },
  { l: "52%", t: 50, w: 126 },
  { l: "65%", t: 92, w: 124 },
  { l: "75%", t: 58, w: 130 },
  { l: "86%", t: 118, w: 118 }
];

function HoverGrid() {
  return (
    <div className="max-w-7xl mx-auto bg-white text-neutral-900 rounded-3xl relative overflow-hidden md:min-h-[760px]">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 55% 35% at 50% 65%, rgba(255,255,255,0.95), transparent 65%)"
        }}
      />

      <div className="hidden md:block absolute inset-0">
        {POS.map((p, i) => {
          const t = TESTIMONIALS[i]!;
          const onRight = parseFloat(p.l) > 55;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.04 + (i % 7) * 0.05 }}
              whileHover={{ scale: 1.06, zIndex: 40 }}
              className="group absolute rounded-2xl shadow-[0_8px_24px_-12px_rgba(0,0,0,0.35)] ring-1 ring-black/5 bg-neutral-200"
              style={{
                left: p.l,
                top: `${p.t}px`,
                width: `${p.w}px`,
                height: `${Math.round(p.w * 1.25)}px`
              }}
            >
              <div className="w-full h-full rounded-2xl overflow-hidden grayscale group-hover:grayscale-0 transition-[filter] duration-300">
                <Portrait src={t.img} alt={t.name} />
              </div>

              {/* Hover tooltip */}
              <div
                className={`pointer-events-none absolute top-1/2 -translate-y-1/2 z-50 w-56 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 ${
                  onRight ? "right-full mr-3" : "left-full ml-3"
                }`}
              >
                <div className="rounded-2xl bg-neutral-900 text-white p-4 shadow-xl">
                  <p className="text-[13px] leading-snug font-medium">
                    “{t.micro}”
                  </p>
                  <p className="mt-2 text-[11px] text-white/60">
                    {t.name} · {t.role}
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="relative z-10 flex flex-col items-center text-center px-6 pt-20 md:pt-[360px] pb-20 md:pb-28">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[1.05] font-sans font-bold"
        >
          Trusted by leaders
          <br />
          <span className="text-neutral-400">from various industries</span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="mt-6 text-neutral-600 leading-relaxed max-w-lg text-[17px]"
        >
          See how builders use the Googolplex ecosystem to onboard from Web2,
          launch ventures, and share wealth — starting with a single dollar.
        </motion.p>

        <motion.a
          href="#story-wall"
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.25 }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          className="mt-10 inline-flex items-center gap-2 text-neutral-900 text-sm font-semibold px-6 py-3 rounded-full transition-colors"
          style={{ background: "#d6ee4f" }}
        >
          Read Success Stories <ArrowRight size={14} />
        </motion.a>
      </div>
    </div>
  );
}

// ── Concept 3: Minimalist carousel ──────────────────────────────────────────

function Carousel() {
  const [i, setI] = useState(0);
  const n = TESTIMONIALS.length;
  const t = TESTIMONIALS[i]!;

  const go = (d: number) => setI((p) => (p + d + n) % n);

  // Auto-advance.
  useEffect(() => {
    const id = setInterval(() => setI((p) => (p + 1) % n), 6000);
    return () => clearInterval(id);
  }, [n]);

  return (
    <div className="max-w-6xl mx-auto mt-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
        <div className="relative aspect-[4/5] rounded-3xl overflow-hidden ring-1 ring-white/10 max-w-sm w-full mx-auto md:mx-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="w-full h-full"
            >
              <Portrait src={t.img} alt={t.name} />
            </motion.div>
          </AnimatePresence>
        </div>

        <div>
          <AnimatePresence mode="wait">
            <motion.blockquote
              key={i}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.5 }}
            >
              <p
                className="font-serif text-white text-2xl md:text-3xl lg:text-[34px] leading-snug tracking-tight"
              >
                “{t.quote}”
              </p>
              <footer className="mt-8">
                <p className="text-white font-medium">{t.name}</p>
                <p className="text-white/50 text-sm">
                  {t.role} · {t.company}
                </p>
                <p
                  className="mt-3 inline-block text-sm font-semibold"
                  style={{ color: "#d6ee4f" }}
                >
                  {t.metric}
                </p>
              </footer>
            </motion.blockquote>
          </AnimatePresence>

          <div className="mt-10 flex items-center gap-5">
            <button
              onClick={() => go(-1)}
              aria-label="Previous story"
              className="liquid-glass w-11 h-11 rounded-full text-white/80 hover:text-white flex items-center justify-center transition-colors"
            >
              <ArrowLeft size={16} />
            </button>
            <button
              onClick={() => go(1)}
              aria-label="Next story"
              className="w-11 h-11 rounded-full bg-white text-black hover:bg-white/90 flex items-center justify-center transition-colors"
            >
              <ArrowRight size={16} />
            </button>
            <div className="flex items-center gap-2 ml-1">
              {TESTIMONIALS.map((_, k) => (
                <button
                  key={k}
                  onClick={() => setI(k)}
                  aria-label={`Story ${k + 1}`}
                  className="h-1.5 rounded-full transition-all duration-300"
                  style={{
                    width: k === i ? 26 : 7,
                    background: k === i ? "#d6ee4f" : "rgba(255,255,255,0.22)"
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Concept 2: Masonry review wall ──────────────────────────────────────────

function ReviewWall() {
  return (
    <div id="story-wall" className="max-w-6xl mx-auto mt-6 scroll-mt-24">
      <div className="columns-1 sm:columns-2 lg:columns-3 gap-5 [column-fill:_balance]">
        {TESTIMONIALS.map((t, i) => (
          <motion.figure
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, delay: (i % 3) * 0.06 }}
            className="mb-5 break-inside-avoid rounded-3xl bg-white text-neutral-900 p-6 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.5)]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full overflow-hidden bg-neutral-200 shrink-0">
                  <Portrait src={t.img} alt={t.name} />
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight">{t.name}</p>
                  <p className="text-xs text-neutral-500">{t.company}</p>
                </div>
              </div>
              <VerifiedBadge />
            </div>

            <p className="mt-4 text-[15px] leading-relaxed text-neutral-700">
              “{t.quote}”
            </p>

            <p className="mt-4 text-xs font-semibold text-neutral-900">
              <span
                className="inline-block px-2 py-0.5 rounded-md"
                style={{ background: "#eaff5a" }}
              >
                {t.metric}
              </span>
              <span className="ml-2 font-normal text-neutral-400">{t.role}</span>
            </p>
          </motion.figure>
        ))}
      </div>
    </div>
  );
}

// ── Section ──────────────────────────────────────────────────────────────────

export function TestimonialsSection() {
  return (
    <section className="bg-black px-6 py-20 md:py-28 space-y-20 md:space-y-28">
      <HoverGrid />
      <Carousel />
      <ReviewWall />
    </section>
  );
}

"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "@/components/icons";
import { HEADSHOTS } from "@/lib/assets";

type Portrait = { l: string; t: number; w: number; img: string };

const portraits: Portrait[] = [
  // Left cluster
  { l: "3%", t: 100, w: 115, img: HEADSHOTS[0] },
  { l: "14%", t: 45, w: 130, img: HEADSHOTS[1] },
  { l: "24%", t: 70, w: 120, img: HEADSHOTS[2] },
  { l: "14%", t: 215, w: 120, img: HEADSHOTS[3] },
  { l: "3%", t: 260, w: 120, img: HEADSHOTS[4] },
  // Center band — top half only
  { l: "34%", t: 50, w: 125, img: HEADSHOTS[5] },
  { l: "45%", t: 80, w: 125, img: HEADSHOTS[6] },
  { l: "56%", t: 50, w: 130, img: HEADSHOTS[7] },
  // Right cluster
  { l: "68%", t: 90, w: 125, img: HEADSHOTS[8] },
  { l: "79%", t: 50, w: 125, img: HEADSHOTS[0] },
  { l: "68%", t: 240, w: 130, img: HEADSHOTS[1] },
  { l: "90%", t: 165, w: 110, img: HEADSHOTS[2] },
  { l: "90%", t: 290, w: 110, img: HEADSHOTS[3] }
];

export function TestimonialsSection() {
  return (
    <section className="bg-black py-20 md:py-28 px-6">
      <div className="max-w-7xl mx-auto bg-white text-neutral-900 rounded-3xl relative overflow-hidden md:min-h-[720px]">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 55% 35% at 50% 65%, rgba(255,255,255,0.95), transparent 65%)"
          }}
        />

        <div className="hidden md:block absolute inset-0 pointer-events-none">
          {["11%", "22%", "32%", "67%", "77%", "88%"].map((x) => (
            <div
              key={x}
              className="absolute top-12 bottom-12 border-l border-dashed border-neutral-200/70"
              style={{ left: x }}
            />
          ))}
        </div>

        <div className="hidden md:block absolute inset-0">
          {portraits.map((p, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.6,
                delay: 0.04 + (i % 7) * 0.05,
                ease: "easeOut"
              }}
              className="absolute rounded-2xl overflow-hidden shadow-[0_8px_24px_-12px_rgba(0,0,0,0.35)] ring-1 ring-black/5 bg-neutral-200"
              style={{
                left: p.l,
                top: `${p.t}px`,
                width: `${p.w}px`,
                height: `${Math.round(p.w * 1.25)}px`
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.img}
                alt=""
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
            </motion.div>
          ))}
        </div>

        <div className="relative z-10 flex flex-col items-center text-center px-6 pt-20 md:pt-[330px] pb-20 md:pb-24">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="inline-block text-[11px] font-bold px-3 py-1 rounded-full bg-neutral-100 border border-neutral-200 text-neutral-700"
          >
            Testimonials
          </motion.span>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="mt-6 text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[1.05] font-sans font-bold"
          >
            Trusted by leaders
            <br />
            <span className="text-neutral-400">from various industries</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.65 }}
            className="mt-6 text-neutral-700 leading-relaxed max-w-md font-bold text-[18px]"
          >
            Learn why professionals trust our solutions to complete their customer
            journeys.
          </motion.p>

          <motion.a
            href="#"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.8 }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="mt-10 inline-flex items-center gap-2 bg-neutral-900 text-white text-sm font-medium px-6 py-3 rounded-full hover:bg-neutral-800 transition-colors"
          >
            Read Success Stories <ArrowRight size={14} />
          </motion.a>
        </div>
      </div>
    </section>
  );
}

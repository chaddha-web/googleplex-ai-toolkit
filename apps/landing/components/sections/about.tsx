"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

export function AboutSection() {
  const ref = useRef<HTMLElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section
      id="about"
      ref={ref}
      className="bg-black pt-32 md:pt-44 pb-10 md:pb-14 px-6 overflow-hidden bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.03)_0%,_transparent_70%)] scroll-mt-24"
    >
      <div className="max-w-6xl mx-auto">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-white/40 text-sm tracking-widest uppercase mb-8"
        >
          About Us
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 40 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-white text-4xl md:text-6xl lg:text-7xl leading-[1.1] tracking-tight"
        >
          <span>Intelligence </span>
          <span className="font-serif-i text-white/60">lives here.</span>
          <br className="hidden md:block" />
          <span> Building the unified infrastructure for </span>
          <span className="font-serif-i text-white/60">every mind, every dream,</span>
          <span> and </span>
          <span className="font-serif-i text-white/60">every human.</span>
        </motion.h2>
      </div>
    </section>
  );
}

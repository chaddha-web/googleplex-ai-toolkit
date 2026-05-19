"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { LoopVideo } from "@/components/video";
import { VIDEOS } from "@/lib/assets";

export function PhilosophySection() {
  const ref = useRef<HTMLElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="vision" ref={ref} className="bg-black py-28 md:py-40 px-6 overflow-hidden scroll-mt-24">
      <div className="max-w-6xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 40 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-white text-5xl md:text-7xl lg:text-8xl tracking-tight mb-16 md:mb-24"
        >
          Innovation <span className="font-serif-i text-white/40">x</span> Vision
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-stretch">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.9, delay: 0.1 }}
            className="relative rounded-3xl overflow-hidden aspect-[4/3]"
          >
            <LoopVideo
              src={VIDEOS.philosophy}
              placeholderClass="placeholder-video-3"
              className="w-full h-full object-cover"
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.9, delay: 0.1 }}
            className="flex flex-col justify-center gap-10"
          >
            <div>
              <p className="text-white/40 text-xs tracking-widest uppercase mb-4">
                Choose your space
              </p>
              <p className="text-white/70 text-base md:text-lg leading-relaxed">
                Every meaningful breakthrough begins at the intersection of
                disciplined strategy and remarkable creative vision. We operate at
                that crossroads, turning bold thinking into tangible outcomes that
                move people and reshape industries.
              </p>
            </div>
            <div className="w-full h-px bg-white/10" />
            <div>
              <p className="text-white/40 text-xs tracking-widest uppercase mb-4">
                Shape the future
              </p>
              <p className="text-white/70 text-base md:text-lg leading-relaxed">
                We believe that the best work emerges when curiosity meets
                conviction. Our process is designed to uncover hidden opportunities
                and translate them into experiences that resonate long after the
                first impression.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

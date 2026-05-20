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
              className="w-full h-full object-cover scale-110"
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
                Har Maidan Fateh
              </p>
              <p className="text-white/70 text-base md:text-lg leading-relaxed">
                Our innovation is anchored in the{" "}
                <span className="text-white">&ldquo;Har Maidan Fateh&rdquo;</span> vision — a
                strategic mandate for universal victory and global prosperity. Under
                this vision, we aim to deliver shared wealth and digital sovereignty
                to every participant in the global economy.
              </p>
            </div>
            <div className="w-full h-px bg-white/10" />
            <div>
              <p className="text-white/40 text-xs tracking-widest uppercase mb-4">
                One Team. One Family. One Future.
              </p>
              <p className="text-white/70 text-base md:text-lg leading-relaxed">
                We believe true prosperity is collective. We do not ask anyone to
                change their faith, their culture, their language, or their way of
                life. We simply ask humanity to add love to their prayers, bring
                their unique gifts to our shared community, and join us in building a
                world where everyone prospers together.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

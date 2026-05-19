"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { LoopVideo } from "@/components/video";
import { VIDEOS } from "@/lib/assets";

export function FeaturedVideoSection() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="bg-black pt-6 md:pt-10 pb-20 md:pb-32 px-6 overflow-hidden">
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 60 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.9 }}
        className="max-w-6xl mx-auto relative rounded-3xl overflow-hidden aspect-video"
      >
        <LoopVideo
          src={VIDEOS.featured}
          placeholderClass="placeholder-video-2"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div className="liquid-glass rounded-2xl p-6 md:p-8 max-w-md">
            <p className="text-white/50 text-xs tracking-widest uppercase mb-3">
              Our Approach
            </p>
            <p className="text-white text-sm md:text-base leading-relaxed">
              We believe in the power of curiosity-driven exploration. Every project
              starts with a question, and every answer opens a new door to innovation.
            </p>
          </div>
          <Link href="/about" className="self-start md:self-end">
            <motion.span
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="inline-block liquid-glass rounded-full px-8 py-3 text-white text-sm font-medium"
            >
              Explore more
            </motion.span>
          </Link>
        </div>
      </motion.div>
    </section>
  );
}

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
        className="max-w-6xl mx-auto relative rounded-3xl overflow-hidden"
      >
        {/* Video — keeps the cinematic 16:9 frame */}
        <div className="relative aspect-video w-full">
          <LoopVideo
            src={VIDEOS.featured}
            placeholderClass="placeholder-video-2"
            className="w-full h-full object-cover"
          />
          {/* Gradient for legibility behind the overlaid button + (md+) card */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent pointer-events-none" />

          {/* Explore more — always overlays the video, bottom-right */}
          <Link href="/about" className="absolute bottom-5 right-5 md:bottom-10 md:right-10 z-10">
            <motion.span
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="inline-block liquid-glass rounded-full px-7 py-3 text-white text-sm font-medium"
            >
              Explore more
            </motion.span>
          </Link>
        </div>

        {/* Approach card — overlays the video bottom-left on md+, stacks below
            it on mobile so the longer copy never clips the 16:9 frame. */}
        <div className="md:absolute md:bottom-0 md:left-0 p-5 sm:p-6 md:p-10">
          <div className="liquid-glass rounded-2xl p-6 md:p-8 max-w-md">
            <p className="text-white/50 text-xs tracking-widest uppercase mb-3">
              Our Approach
            </p>
            <p className="text-white text-sm md:text-base leading-relaxed">
              Every meaningful breakthrough begins at the intersection of disciplined
              strategy and remarkable creative vision. We operate at that crossroads,
              turning bold thinking into tangible outcomes that move people and reshape
              industries.
            </p>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "@/components/icons";
import { LoopVideo } from "@/components/video";
import { SERVICES, type Service } from "@/lib/services";

const N = SERVICES.length;

function CardView({
  c,
  index,
  pageKey,
  side
}: {
  c: Service;
  index: number;
  pageKey: number;
  side: "L" | "R";
}) {
  const number = String(index + 1).padStart(2, "0");
  return (
    <motion.div
      key={`${pageKey}-${side}`}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: "easeOut" }}
    >
      <Link
        href={`/services/${c.slug}`}
        aria-label={`${c.title} — read more`}
        className="group liquid-glass rounded-3xl overflow-hidden block hover:bg-white/[0.02] transition-colors"
      >
        <div className="relative aspect-video overflow-hidden">
          <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-105">
            <LoopVideo
              src={c.video}
              placeholderClass={c.placeholder}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
          <div className="absolute top-4 left-4 liquid-glass rounded-full px-3 py-1 text-white text-xs font-medium tracking-widest">
            {number}
          </div>
        </div>
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between mb-4">
            <p className="text-white/40 text-xs tracking-widest uppercase">
              {c.tag}
            </p>
            <div className="liquid-glass rounded-full p-2 text-white group-hover:bg-white/10 transition-colors">
              <ArrowUpRight size={16} />
            </div>
          </div>
          <h3 className="text-white text-xl md:text-2xl mb-3 tracking-tight font-serif">
            {c.title}
          </h3>
          <p className="text-white/50 text-sm leading-relaxed">{c.body}</p>
        </div>
      </Link>
    </motion.div>
  );
}

export function ServicesSection() {
  // Pair index: 0→[0,1], 1→[1,2], 2→[2,3], 3→[3,4], 4→[4,0]
  const [pairIdx, setPairIdx] = useState(0);
  const leftIdx = pairIdx;
  const rightIdx = (pairIdx + 1) % N;

  const next = () => setPairIdx((i) => (i + 1) % N);
  const prev = () => setPairIdx((i) => (i - 1 + N) % N);

  return (
    <section className="bg-black py-28 md:py-40 px-6 overflow-hidden bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.02)_0%,_transparent_60%)]">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="flex items-end justify-between mb-12 md:mb-16"
        >
          <h2 className="text-3xl md:text-5xl text-white tracking-tight font-serif">
            What we do
          </h2>
          <p className="text-white/40 text-sm hidden md:block tracking-widest uppercase">
            Our services
          </p>
        </motion.div>

        {/* Pair of cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          <CardView
            c={SERVICES[leftIdx]!}
            index={leftIdx}
            pageKey={pairIdx}
            side="L"
          />
          <CardView
            c={SERVICES[rightIdx]!}
            index={rightIdx}
            pageKey={pairIdx}
            side="R"
          />
        </div>

        {/* Pagination — bottom right: ← arrow · indicators · → arrow */}
        <div className="mt-10 flex items-center justify-end gap-5">
          <button
            onClick={prev}
            aria-label="Previous pair"
            className="liquid-glass w-11 h-11 rounded-full text-white/80 hover:text-white flex items-center justify-center transition-colors"
          >
            <ArrowLeft size={16} />
          </button>

          {/* Pair indicator: active pair lights two adjacent dashes */}
          <div className="flex items-center gap-2">
            {SERVICES.map((_, i) => {
              const onPair = i === pairIdx || i === (pairIdx + 1) % N;
              return (
                <button
                  key={i}
                  onClick={() => setPairIdx(i)}
                  aria-label={`Show cards ${i + 1} and ${((i + 1) % N) + 1}`}
                  className="h-1.5 rounded-full transition-all duration-300"
                  style={{
                    width: onPair ? 28 : 8,
                    background: onPair ? "#fff" : "rgba(255,255,255,0.22)"
                  }}
                />
              );
            })}
          </div>

          <button
            onClick={next}
            aria-label="Next pair"
            className="w-11 h-11 rounded-full bg-white text-black hover:bg-white/90 flex items-center justify-center transition-colors"
          >
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
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
      initial={{ opacity: 0, x: 80 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.7,
        delay: side === "R" ? 0.08 : 0,
        ease: [0.16, 1, 0.3, 1]
      }}
      className="h-full"
    >
      <Link
        href={`/services/${c.slug}`}
        aria-label={`${c.title} — read more`}
        className="group liquid-glass rounded-3xl overflow-hidden flex flex-col h-full hover:bg-white/[0.02] transition-colors"
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
          <div className="absolute top-4 left-4 z-10">
            <div className="liquid-glass rounded-full px-3 py-1 text-white text-xs font-medium tracking-widest">
              {number}
            </div>
          </div>
        </div>
        <div className="p-6 md:p-8 flex flex-col flex-1">
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
          <p className="text-white/50 text-sm leading-relaxed flex-1">{c.body}</p>
        </div>
      </Link>
    </motion.div>
  );
}

export function ServicesSection() {
  const [pageIdx, setPageIdx] = useState(0);
  const [vw, setVw] = useState<number>(1024);

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isMobile = vw < 768;

  // Overlapping pages of 2 for desktop; pages of 1 for mobile to show single cards.
  const pages = isMobile
    ? SERVICES.map((_, i) => [i])
    : SERVICES.map((_, i) => [i, (i + 1) % N]);

  const pageCount = pages.length;
  const page = pages[pageIdx] || [0];

  const next = () => setPageIdx((i) => (i + 1) % pageCount);
  const prev = () => setPageIdx((i) => (i - 1 + pageCount) % pageCount);

  const sectionRef = useRef<HTMLElement | null>(null);
  const isInView = useInView(sectionRef, { margin: "-20%" });

  useEffect(() => {
    if (!isInView) return;

    const interval = setInterval(() => {
      setPageIdx((i) => (i + 1) % pageCount);
    }, 7000);

    return () => clearInterval(interval);
  }, [isInView, pageIdx, pageCount]);

  return (
    <section
      ref={sectionRef}
      className="bg-black py-28 md:py-40 px-6 overflow-hidden bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.02)_0%,_transparent_60%)]"
    >
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

        {/* Cards for the current page (1 or 2) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {page.map((idx, k) => (
            <CardView
              key={idx}
              c={SERVICES[idx]!}
              index={idx}
              pageKey={pageIdx}
              side={k === 0 ? "L" : "R"}
            />
          ))}
        </div>

        {/* Pagination — bottom right: ← arrow · indicators · → arrow */}
        <div className="mt-10 flex items-center justify-end gap-5">
          <button
            onClick={prev}
            aria-label="Previous page"
            className="liquid-glass w-11 h-11 rounded-full text-white/80 hover:text-white flex items-center justify-center transition-colors"
          >
            <ArrowLeft size={16} />
          </button>

          {/* One dash per page; active page is wide + white */}
          <div className="flex items-center gap-2">
            {pages.map((p, i) => (
              <button
                key={i}
                onClick={() => setPageIdx(i)}
                aria-label={
                  isMobile
                    ? `Show service ${p[0]! + 1}`
                    : `Show services ${p.map((x) => x + 1).join(" & ")}`
                }
                className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: i === pageIdx ? 28 : 8,
                  background: i === pageIdx ? "#fff" : "rgba(255,255,255,0.22)"
                }}
              />
            ))}
          </div>

          <button
            onClick={next}
            aria-label="Next page"
            className="w-11 h-11 rounded-full bg-white text-black hover:bg-white/90 flex items-center justify-center transition-colors"
          >
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}

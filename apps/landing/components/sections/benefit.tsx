"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform
} from "framer-motion";

const stats = [
  {
    pct: 78,
    copy: "Accelerated user onboarding via zkTLS protocol (Web2 to Web3)."
  },
  {
    pct: 62,
    copy: "Lift in AI-guided business venture creations and fundings."
  },
  {
    pct: 41,
    copy: "Reduction in transaction and operational overhead through micro-payments."
  }
];

const SIZES = [170, 140, 110];

const enter = (i: number = 0) => ({
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.3 },
  transition: { duration: 0.7, delay: 0.05 + i * 0.1, ease: "easeOut" as const }
});

// Max pixels the orb shifts away from the cursor.
const MAX_REPEL = 18;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function Orb({ size }: { size: number }) {
  return (
    <div
      className="rounded-[28%] relative h-full w-full"
      style={{
        background:
          "radial-gradient(circle at 50% 45%, #eaff5a 0%, #d6ee4f 38%, #b9d23e 70%, #94a23b 100%)"
      }}
    >
      <div
        className="absolute inset-0 rounded-[28%]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.55) 1px, transparent 1.6px)",
          backgroundSize: "7px 7px",
          mixBlendMode: "screen",
          maskImage:
            "radial-gradient(circle at 50% 50%, black 0%, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(circle at 50% 50%, black 0%, transparent 78%)",
          opacity: 0.5
        }}
      />
    </div>
  );
}

function MetricCard({
  pct,
  copy,
  size,
  delay,
  className = ""
}: {
  pct: number;
  copy: string;
  size: number;
  delay: number;
  className?: string;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  // Cursor-repel offset (spring-smoothed).
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const x = useSpring(rx, { stiffness: 150, damping: 15, mass: 0.4 });
  const y = useSpring(ry, { stiffness: 150, damping: 15, mass: 0.4 });

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Cursor position relative to card center, normalised to [-1, 1].
    const nx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const ny = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    // Push the orb away from the cursor.
    rx.set(clamp(-nx, -1, 1) * MAX_REPEL);
    ry.set(clamp(-ny, -1, 1) * MAX_REPEL);
  }

  function handleLeave() {
    rx.set(0);
    ry.set(0);
  }

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      {...enter(1)}
      className={`relative overflow-hidden rounded-3xl border border-white/10 px-7 py-8 flex flex-col min-h-[420px] ${className}`}
      style={{
        background:
          "radial-gradient(120% 90% at 30% 0%, rgba(60,72,120,0.55) 0%, rgba(24,28,48,0.85) 45%, rgba(10,12,24,0.95) 100%)"
      }}
    >
      {/* starfield */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.7) 0.6px, transparent 1px), radial-gradient(rgba(180,200,255,0.5) 0.5px, transparent 1px)",
          backgroundSize: "26px 26px, 17px 17px",
          backgroundPosition: "0 0, 9px 13px"
        }}
      />

      <div className="relative flex items-start">
        <span className="text-[56px] sm:text-[64px] md:text-[72px] leading-[0.95] tracking-tight text-white font-sans font-bold">
          {pct}
        </span>
        <span className="text-xl sm:text-2xl mt-1 ml-1 text-white/80 font-sans font-bold">
          %
        </span>
      </div>

      <p className="relative text-white/55 text-sm mt-4 leading-relaxed max-w-[26ch]">
        {copy}
      </p>

      <div className="relative mt-auto pt-10 flex justify-center">
        {/* Outer layer: cursor-repel translation (spring). */}
        <motion.div style={{ x, y }}>
          {/* Inner layer: idle float + pulse + glow. */}
          <motion.div
            animate={{
              y: [0, -10, 0],
              scale: [1, 1.04, 1],
              boxShadow: [
                "0 0 40px -8px rgba(210,240,90,0.45), 0 18px 40px -14px rgba(160,180,60,0.6), inset 0 -8px 18px rgba(120,140,30,0.25)",
                "0 0 70px -4px rgba(210,240,90,0.7), 0 24px 48px -14px rgba(160,180,60,0.7), inset 0 -8px 18px rgba(120,140,30,0.25)",
                "0 0 40px -8px rgba(210,240,90,0.45), 0 18px 40px -14px rgba(160,180,60,0.6), inset 0 -8px 18px rgba(120,140,30,0.25)"
              ]
            }}
            transition={{
              duration: 4.5,
              delay,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="rounded-[28%]"
            style={{ width: `${size}px`, height: `${size}px` }}
          >
            <Orb size={size} />
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function Heading() {
  return (
    <motion.div {...enter(0)}>
      <span className="inline-block whitespace-nowrap text-[11px] font-medium px-3 py-1 rounded-full border border-white/15 text-white/80 bg-white/[0.04]">
        Benefit received
      </span>
      <h2 className="mt-7 text-4xl sm:text-5xl lg:text-[56px] tracking-tight leading-[1.04] font-sans font-bold text-white max-w-[18ch]">
        Measuring the Googolplex Impact: Ecosystem Metrics
      </h2>
    </motion.div>
  );
}

// Mobile only: pin the section and pan the cards horizontally as the user
// scrolls vertically through it.
function MobileScroller() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [distance, setDistance] = useState(0);

  const { scrollYProgress } = useScroll({
    target: wrapRef,
    offset: ["start start", "end end"]
  });
  const x = useTransform(scrollYProgress, [0, 1], [0, -distance]);

  useEffect(() => {
    const calc = () => {
      const track = trackRef.current;
      if (!track) return;
      // Total horizontal overflow past the viewport.
      setDistance(Math.max(0, track.scrollWidth - window.innerWidth));
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  return (
    // Tall wrapper gives the scroll its travel distance.
    <div ref={wrapRef} className="md:hidden relative h-[260vh]">
      <div className="sticky top-0 h-screen flex flex-col justify-center overflow-hidden">
        <div className="px-6">
          <Heading />
        </div>
        <motion.div
          ref={trackRef}
          style={{ x }}
          className="mt-10 flex gap-4 pl-6 pr-[20vw] w-max"
        >
          {stats.map((s, i) => (
            <MetricCard
              key={s.pct}
              pct={s.pct}
              copy={s.copy}
              size={SIZES[i]!}
              delay={i * 0.6}
              className="w-[78vw] shrink-0"
            />
          ))}
        </motion.div>
      </div>
    </div>
  );
}

export function BenefitSection() {
  return (
    <section id="benefit" className="bg-black scroll-mt-24">
      {/* Desktop / tablet: static triptych */}
      <div className="hidden md:block py-28 px-6">
        <div className="max-w-7xl mx-auto">
          <Heading />
          <div className="mt-12 grid grid-cols-3 gap-5">
            {stats.map((s, i) => (
              <MetricCard
                key={s.pct}
                pct={s.pct}
                copy={s.copy}
                size={SIZES[i]!}
                delay={i * 0.6}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Mobile: pinned horizontal scroll */}
      <MobileScroller />
    </section>
  );
}

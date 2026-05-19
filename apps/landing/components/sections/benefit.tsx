"use client";

import { motion } from "framer-motion";

const stats = [
  { pct: 72, copy: "Faster time to first insight across audited engagements." },
  { pct: 65, copy: "Lift in qualified user task completion after redesign." },
  { pct: 39, copy: "Reduction in production cost per published artefact." }
];

const ORB_SIZES = [180, 150, 120];

const enter = (i: number = 0) => ({
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, delay: 0.05 + i * 0.1, ease: "easeOut" as const }
});

function Orb({ size = 180 }: { size?: number }) {
  return (
    <div
      className="rounded-[28%] relative"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background:
          "radial-gradient(circle at 50% 50%, #e9f76b 0%, #d6e85f 38%, #b9c94e 70%, #94a23b 100%)",
        boxShadow:
          "0 18px 38px -14px rgba(160,180,60,0.55), inset 0 -8px 18px rgba(120,140,30,0.18)"
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

export function BenefitSection() {
  return (
    <section id="benefit" className="bg-black py-20 md:py-28 px-6 scroll-mt-24">
      <div className="max-w-7xl mx-auto bg-white text-neutral-900 rounded-3xl px-6 md:px-12 py-12 md:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-start">
          <motion.div {...enter(0)} className="lg:col-span-4">
            <span className="inline-block whitespace-nowrap text-[11px] font-medium px-3 py-1 rounded-full border border-neutral-300 text-neutral-800 bg-white">
              Benefit received
            </span>
            <h2 className="mt-8 text-4xl sm:text-5xl lg:text-[56px] tracking-tight leading-[1.02] font-sans font-bold">
              Boosting
              <br />
              Efficiency with
              <br />
              Googolplex Insight
              <br />
              Practice
            </h2>
          </motion.div>

          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3">
            {stats.map((s, i) => (
              <motion.div
                key={s.pct}
                {...enter(1 + i)}
                className={`px-6 py-4 flex flex-col ${i > 0 ? "sm:border-l sm:border-dashed sm:border-neutral-300" : ""}`}
              >
                <div className="flex items-start">
                  <span className="text-[56px] sm:text-[64px] md:text-[72px] leading-[0.95] tracking-tight text-neutral-900 font-sans font-bold">
                    {s.pct}
                  </span>
                  <span className="text-xl sm:text-2xl mt-1 ml-1 text-neutral-900 font-sans font-bold">
                    %
                  </span>
                </div>

                <p className="text-neutral-500 text-sm mt-4 leading-relaxed max-w-[22ch]">
                  {s.copy}
                </p>

                <div className="mt-8 sm:mt-10 md:mt-14 flex justify-center">
                  <div className="rounded-[28%] border border-dashed border-neutral-300 flex items-center justify-center w-[200px] h-[200px] sm:w-[220px] sm:h-[220px] md:w-[240px] md:h-[240px]">
                    <Orb size={ORB_SIZES[i]} />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

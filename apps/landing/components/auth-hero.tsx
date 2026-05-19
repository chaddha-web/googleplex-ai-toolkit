"use client";

import { motion } from "framer-motion";
import { LoopVideo } from "@/components/video";
import { VIDEOS } from "@/lib/assets";

type Step = { number: number; text: string };

type AuthHeroProps = {
  heading: string;
  tagline: string;
  steps: Step[];
};

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.2 }
  }
};

const child = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" as const }
  }
};

function StepItem({
  number,
  text,
  active
}: Step & { active: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl ${
        active
          ? "bg-white text-black border border-white"
          : "bg-[#1A1A1A] text-white border-none"
      }`}
    >
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
          active ? "bg-black text-white" : "bg-white/10 text-white/40"
        }`}
      >
        {number}
      </div>
      <span className="text-sm font-medium">{text}</span>
    </div>
  );
}

export function AuthHero({ heading, tagline, steps }: AuthHeroProps) {
  return (
    <div className="relative hidden lg:flex w-[52%] flex-col items-center justify-end pb-32 px-12 rounded-3xl overflow-hidden shadow-2xl h-full">
      <LoopVideo
        src={VIDEOS.signup}
        placeholderClass="placeholder-video"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/40 pointer-events-none" />

      <motion.div
        initial="hidden"
        animate="show"
        variants={container}
        className="relative z-10 w-full max-w-xs space-y-8"
      >
        <motion.div
          variants={child}
          className="flex items-center gap-2 text-white"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon.png"
            alt="GoogolPlex"
            className="h-6 w-auto object-contain"
          />
          <span className="text-xl font-semibold tracking-tight">GoogolPlex</span>
        </motion.div>

        <motion.div variants={child} className="space-y-3">
          <h1 className="text-4xl font-medium tracking-tight whitespace-nowrap">
            {heading}
          </h1>
          <p className="text-white/60 text-sm leading-relaxed px-4">{tagline}</p>
        </motion.div>

        {steps.map((s, i) => (
          <motion.div
            key={s.number}
            variants={child}
            className={i === 0 ? "space-y-2" : "space-y-2 -mt-6"}
          >
            <StepItem {...s} active={i === 0} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

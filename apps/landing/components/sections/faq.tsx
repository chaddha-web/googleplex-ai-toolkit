"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "@/components/icons";

const ACCENT = "#1e3a8a";

const faqs = [
  {
    q: "What kinds of projects do you take on?",
    a: "We partner with teams on brand systems, product redesigns, content strategy, and full-stack experience work. Most engagements run 6–14 weeks, with a sprint cadence designed around the depth of the problem rather than calendar time."
  },
  {
    q: "How do engagements typically begin?",
    a: "Every project opens with a discovery week — interviews, audits, and a written point of view. You leave that week with a real plan we both believe in. If it isn’t the right fit, we say so before any larger commitment is made."
  },
  {
    q: "Who will actually be doing the work?",
    a: "The same senior team you meet in the pitch. We don’t hand work off to juniors after the deal closes — every artefact passes through a partner before it reaches you, and you have a direct line to whoever is leading the engagement."
  },
  {
    q: "How do you handle pricing?",
    a: "Fixed-scope engagements are quoted as a single number; longer partnerships are structured as monthly retainers with a clear deliverable cadence. Either way, you see the math before you sign, and we re-baseline together if scope changes."
  },
  {
    q: "Can you work with our existing in-house team?",
    a: "Yes — most of our best work happens alongside in-house teams. We embed inside your tooling and rituals, share working files openly, and run a weekly review your team can join. The goal is leaving you stronger, not more dependent."
  },
  {
    q: "What do you need from us to start?",
    a: "A signed SOW, a single point of contact, and access to whatever past research, brand assets, or analytics already exist. We’ll handle the rest of the onboarding — calendar holds, tool invites, kick-off agenda — in the first 48 hours."
  }
];

export function FAQSection() {
  const [active, setActive] = useState(0);
  const [vw, setVw] = useState<number>(1280);

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isMobile = vw < 768;
  const CARD_W_ACTIVE = isMobile ? Math.min(vw - 48, 560) : 600;
  const CARD_W_INACTIVE = isMobile ? Math.min(vw - 48, 560) : 320;
  const CARD_H = isMobile ? 440 : 520;
  const GAP = isMobile ? 16 : 24;

  const prev = () => setActive((a) => (a - 1 + faqs.length) % faqs.length);
  const next = () => setActive((a) => (a + 1) % faqs.length);

  return (
    <section
      className="py-16 md:py-20 px-6 md:px-10 overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse 60% 50% at 20% 20%, #f4f6fa 0%, transparent 70%)," +
          "radial-gradient(ellipse 70% 50% at 90% 80%, #e9eef6 0%, transparent 70%)," +
          "linear-gradient(180deg, #f0f3f8 0%, #e7ecf3 100%)"
      }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8 md:gap-16 mb-10 md:mb-12">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl tracking-tight leading-[1.02] text-neutral-900 font-sans font-semibold"
          >
            Frequently
            <br />
            Asked <span style={{ color: ACCENT }}>Questions</span>
          </motion.h2>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
            className="md:max-w-xs"
          >
            <p className="text-neutral-700 text-sm leading-relaxed mb-6">
              Find answers to common questions about how we work, scope projects,
              and partner with in-house teams.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={prev}
                aria-label="Previous question"
                className="w-11 h-11 rounded-full border border-neutral-400 text-neutral-700 flex items-center justify-center hover:bg-neutral-200/60 transition-colors"
              >
                <ArrowLeft size={16} />
              </button>
              <button
                onClick={next}
                aria-label="Next question"
                className="w-11 h-11 rounded-full bg-neutral-900 text-white flex items-center justify-center hover:bg-neutral-800 transition-colors"
              >
                <ArrowRight size={16} />
              </button>
            </div>
          </motion.div>
        </div>

        <div className="relative">
          <motion.div
            className="flex"
            style={{ gap: `${GAP}px` }}
            animate={{ x: -active * (CARD_W_INACTIVE + GAP) }}
            transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
          >
            {faqs.map((f, i) => {
              const isActive = i === active;
              return (
                <motion.button
                  key={i}
                  onClick={() => setActive(i)}
                  whileHover={!isActive ? { y: -4 } : undefined}
                  className="shrink-0 text-left rounded-3xl p-6 sm:p-8 md:p-10 flex flex-col overflow-hidden"
                  initial={false}
                  animate={{ width: isActive ? CARD_W_ACTIVE : CARD_W_INACTIVE }}
                  transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
                  style={{
                    height: `${CARD_H}px`,
                    background: isActive ? ACCENT : "rgba(255,255,255,0.55)",
                    color: isActive ? "#fff" : "#cbd2dc",
                    boxShadow: isActive
                      ? "0 24px 60px -20px rgba(30,58,138,0.55)"
                      : "0 8px 24px -16px rgba(20,30,55,0.18)",
                    backdropFilter: isActive ? "none" : "blur(8px)",
                    WebkitBackdropFilter: isActive ? "none" : "blur(8px)",
                    border: isActive ? "none" : "1px solid rgba(255,255,255,0.6)",
                    cursor: isActive ? "default" : "pointer"
                  }}
                >
                  <h3
                    className="text-2xl md:text-[28px] leading-[1.15] tracking-tight font-sans font-medium"
                    style={{ color: isActive ? "#fff" : "#9ba3b0" }}
                  >
                    {f.q}
                  </h3>

                  <div className="flex-1" />

                  <motion.p
                    initial={false}
                    animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 8 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="text-sm leading-relaxed mt-6"
                    style={{ color: "rgba(255,255,255,0.85)", minHeight: "6rem" }}
                  >
                    {isActive ? f.a : ""}
                  </motion.p>
                </motion.button>
              );
            })}
          </motion.div>
        </div>

        <div className="flex justify-center gap-2 mt-10">
          {faqs.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              aria-label={`Go to question ${i + 1}`}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: i === active ? 28 : 8,
                background: i === active ? ACCENT : "rgba(30,58,138,0.25)"
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

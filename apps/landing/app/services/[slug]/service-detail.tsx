"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { SiteNav } from "@/components/site-nav";
import { SiteFooterCard } from "@/components/site-footer-card";
import { ArrowLeft, ArrowUpRight } from "@/components/icons";
import { SERVICES, type Service } from "@/lib/services";

export function ServiceDetail({ service }: { service: Service }) {
  const idx = SERVICES.findIndex((s) => s.slug === service.slug);
  const number = String(idx + 1).padStart(2, "0");
  const nextService = SERVICES[(idx + 1) % SERVICES.length]!;

  return (
    <main className="relative w-full min-h-screen overflow-x-hidden flex flex-col items-center font-sans selection:bg-white/20 selection:text-white bg-black">
      <div className="relative z-10 w-full max-w-7xl flex flex-col items-center flex-1">
        <SiteNav />

        <article className="w-full px-6 pt-8 md:pt-12 pb-24 md:pb-32">
          {/* Back link */}
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-white/50 hover:text-white text-xs transition-colors mb-12"
          >
            <ArrowLeft size={14} /> Back to home
          </Link>

          {/* Header */}
          <div className="max-w-5xl">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="flex items-center gap-3 mb-6"
            >
              <span className="liquid-glass rounded-full px-3 py-1 text-white text-xs font-medium tracking-widest">
                {number}
              </span>
              <span className="text-white/40 text-xs tracking-[0.3em] uppercase">
                {service.tag}
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.05 }}
              className="font-serif text-white tracking-tight text-5xl md:text-7xl lg:text-8xl leading-[1.05]"
            >
              {service.title}
            </motion.h1>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.25 }}
              className="text-white/70 text-base md:text-lg leading-relaxed max-w-3xl mt-8 space-y-6 font-light"
            >
              {service.intro.split("\n\n").map((para, idx) => (
                <p key={idx}>
                  {para.split("**").map((part, pIdx) =>
                    pIdx % 2 === 1 ? (
                      <strong key={pIdx} className="text-white font-medium">
                        {part}
                      </strong>
                    ) : (
                      part
                    )
                  )}
                </p>
              ))}
            </motion.div>
          </div>

          {/* Video hero */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.35 }}
            className="mt-12 md:mt-16 relative rounded-3xl overflow-hidden aspect-video"
          >
            <Image
              src={service.image}
              alt={service.title}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 1024px"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
          </motion.div>

          {/* Long-form sections */}
          <div className="mt-16 md:mt-24 grid grid-cols-1 md:grid-cols-12 gap-y-12 md:gap-x-12">
            {service.sections.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.7, delay: i * 0.08 }}
                className="md:col-span-12 grid grid-cols-1 md:grid-cols-12 gap-y-3 md:gap-x-12 items-start border-t border-white/10 pt-10 md:pt-12"
              >
                <div className="md:col-span-4">
                  <p className="text-white/40 text-xs tracking-widest uppercase">
                    {s.label}
                  </p>
                </div>
                <div className="md:col-span-8 space-y-6">
                  {s.body.split("\n\n").map((para, pIdx) => {
                    // Check if paragraph contains bullet items (lines starting with •)
                    if (para.includes("\n• ") || para.startsWith("• ")) {
                      const lines = para.split("\n");
                      return (
                        <ul key={pIdx} className="space-y-4 my-4 pl-1">
                          {lines.map((line, lIdx) => {
                            const cleanLine = line.replace(/^[•\-]\s*/, "");
                            return (
                              <li
                                key={lIdx}
                                className="flex items-start gap-3 text-white/70 text-base md:text-lg leading-relaxed animate-[fadeIn_0.5s_ease-out]"
                              >
                                <span className="text-[#a5b4fc] mt-[10px] select-none text-[8px] flex-shrink-0">
                                  ◆
                                </span>
                                <span>
                                  {cleanLine.split("**").map((part, partIdx) =>
                                    partIdx % 2 === 1 ? (
                                      <strong
                                        key={partIdx}
                                        className="text-white font-semibold"
                                      >
                                        {part}
                                      </strong>
                                    ) : (
                                      part
                                    )
                                  )}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      );
                    }

                    return (
                      <p
                        key={pIdx}
                        className="text-white/70 text-base md:text-lg leading-relaxed"
                      >
                        {para.split("**").map((part, partIdx) =>
                          partIdx % 2 === 1 ? (
                            <strong
                              key={partIdx}
                              className="text-white font-semibold"
                            >
                              {part}
                            </strong>
                          ) : (
                            part
                          )
                        )}
                      </p>
                    );
                  })}
                </div>
              </motion.div>
            ))}
          </div>

          {/* CTAs */}
          <div className="mt-20 md:mt-28 flex flex-col sm:flex-row sm:items-center gap-4">
            <Link
              href="/signup"
              className="liquid-glass rounded-full px-8 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors"
            >
              Get Started
            </Link>
            <Link
              href={`/services/${nextService.slug}`}
              className="inline-flex items-center gap-3 text-white/60 hover:text-white text-sm font-medium transition-colors group"
            >
              <span>Next: {nextService.title}</span>
              <span className="liquid-glass rounded-full p-2 group-hover:bg-white/10 transition-colors">
                <ArrowUpRight size={14} />
              </span>
            </Link>
          </div>
        </article>
      </div>

      <div className="relative z-10 w-full px-6 pb-10 max-w-7xl mx-auto">
        <SiteFooterCard />
      </div>
    </main>
  );
}

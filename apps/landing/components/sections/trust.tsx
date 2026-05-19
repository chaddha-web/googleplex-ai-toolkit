"use client";

import { motion } from "framer-motion";

const LOGOS = [
  "https://i.ibb.co/FGYbCDx/1.png",
  "https://i.ibb.co/7JFb8tGY/2.png",
  "https://i.ibb.co/JRH4Yw4m/3.png",
  "https://i.ibb.co/nt3gG3w/4.png",
  "https://i.ibb.co/0jvxfdrv/5.png",
  "https://i.ibb.co/WWR8GsSZ/6.png",
  "https://i.ibb.co/7J5jyrDQ/7.png"
];

// Duplicate the track so the CSS translateX(-50%) loops seamlessly
const TRACK = [...LOGOS, ...LOGOS];

const enter = (i: number = 0) => ({
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, delay: 0.05 + i * 0.06, ease: "easeOut" as const }
});

export function TrustSection() {
  return (
    <section id="partners" className="bg-[#f6f5f1] text-neutral-900 py-24 md:py-32 px-6 scroll-mt-24">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-start mb-16 md:mb-20">
          <motion.h2
            {...enter(0)}
            className="md:col-span-8 text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[1.05] font-sans font-normal"
          >
            Driving progress through,
            <br />
            <span className="text-neutral-400">Strategic partnerships</span>
          </motion.h2>
          <motion.p
            {...enter(1)}
            className="md:col-span-4 text-neutral-500 text-sm leading-relaxed md:pt-3"
          >
            Innovation isn&apos;t built in isolation. We work hand-in-hand with
            exceptional partner companies to combine cutting-edge technology
            with sustainable practices, shaping a better future together.
          </motion.p>
        </div>
      </div>

      {/* Marquee — full bleed inside the section padding */}
      <motion.div {...enter(2)} className="trust-fade overflow-hidden -mx-6">
        <div className="trust-track py-2">
          {TRACK.map((src, i) => (
            <div
              key={i}
              className="shrink-0 rounded-full bg-[#ececea] flex items-center justify-center overflow-hidden"
              style={{ width: "180px", height: "180px" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="w-[92%] h-[92%] object-cover rounded-full"
              />
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

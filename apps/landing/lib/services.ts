import { VIDEOS } from "@/lib/assets";

export type Service = {
  slug: string;
  tag: string;
  title: string;
  /** Short card-level description (used on the landing services grid). */
  body: string;
  /** One-line intro shown under the headline on the detail page. */
  intro: string;
  /** Long-form sections of the detail page. Each gets a small label + paragraph. */
  sections: { label: string; body: string }[];
  video: string;
  placeholder: string;
};

export const SERVICES: Service[] = [
  {
    slug: "research-insight",
    tag: "Strategy",
    title: "Research & Insight",
    body: "We dig deep into data, culture, and human behavior to surface the insights that drive meaningful, lasting change.",
    intro:
      "The work that lasts starts with the questions nobody else is asking. We pair quantitative rigour with field-level empathy so the answers actually compound.",
    sections: [
      {
        label: "What we do",
        body: "Mixed-method discovery — qual interviews, contextual inquiry, longitudinal log analysis, and quantitative survey work — synthesised into a written point of view your whole team can rally behind."
      },
      {
        label: "How we work",
        body: "Every engagement opens with a discovery sprint and ends with a research artefact you actually use: a synthesised insight library, a tagged interview corpus, and a 6-month research roadmap your in-house team can run with."
      },
      {
        label: "Why it matters",
        body: "Most teams skip straight to design because research feels slow. We make it fast and concrete — the same week you commission us, you'll have a working hypothesis, three risks you didn't know you had, and a path through them."
      }
    ],
    video: VIDEOS.serviceStrategy,
    placeholder: "placeholder-video-4"
  },
  {
    slug: "design-execution",
    tag: "Craft",
    title: "Design & Execution",
    body: "From concept to launch, we obsess over every detail to deliver experiences that feel effortless and look extraordinary.",
    intro:
      "Calm, premium interfaces are a design problem and a production problem in equal measure. We treat both with the same care.",
    sections: [
      {
        label: "What we do",
        body: "Brand systems, product surfaces, motion direction, and a component library that lives in code. We design in the medium the work will ship in — no static mock that quietly cannot be built."
      },
      {
        label: "How we work",
        body: "Two-week design cycles, weekly internal reviews with a partner present, and a shared Linear/GitHub board so engineering can pull alongside design instead of waiting for hand-off."
      },
      {
        label: "Why it matters",
        body: "Polished work earns trust the moment a user lands. That trust is what lets the rest of the product breathe — fewer onboarding panels, fewer disclaimers, fewer tutorials nobody reads."
      }
    ],
    video: VIDEOS.serviceCraft,
    placeholder: "placeholder-video-5"
  },
  {
    slug: "narrative-brand",
    tag: "Story",
    title: "Narrative & Brand",
    body: "We help teams find the words, tone, and visual language that make their work feel inevitable, not invented.",
    intro:
      "The most enduring brands feel like they were always there. We help you find that voice — and then write the words that make it real.",
    sections: [
      {
        label: "What we do",
        body: "Positioning, naming, voice & tone, narrative architecture, launch copy, and the editorial systems that keep the story consistent as your team scales."
      },
      {
        label: "How we work",
        body: "We embed for a 4–8 week sprint, interview leadership and customers, and ship a written brand book plus the first three pieces of public-facing copy your team can riff on."
      },
      {
        label: "Why it matters",
        body: "Strong narrative compounds — it makes recruiting easier, sales calls shorter, and product decisions clearer. Weak narrative quietly taxes every other function."
      }
    ],
    video: VIDEOS.philosophy,
    placeholder: "placeholder-video-3"
  },
  {
    slug: "product-platform",
    tag: "Build",
    title: "Product & Platform",
    body: "From prototype to production, we build interfaces that are fast, accessible, and a pleasure to use every day.",
    intro:
      "We ship the working software — not the wireframe of it. Web, mobile, and the platform underneath, built to be lived in for years.",
    sections: [
      {
        label: "What we do",
        body: "Full-stack product engineering on a modern web stack (Next.js, React, TypeScript, Postgres, edge-first hosting). Native-feel mobile via React Native where it earns its keep, web-first where it doesn't."
      },
      {
        label: "How we work",
        body: "Trunk-based development, design-tokens-in-code, type-safe API contracts shared between client and server, and a CI gate that runs the same checks locally so you never get surprised by a deploy."
      },
      {
        label: "Why it matters",
        body: "Most agencies ship a polished v1 and then leave you to maintain it. We instrument what we build, hand over a runbook, and stay on retainer through the first six months of real users — when the real work begins."
      }
    ],
    video: VIDEOS.featured,
    placeholder: "placeholder-video-2"
  },
  {
    slug: "growth-iteration",
    tag: "Care",
    title: "Growth & Iteration",
    body: "After launch, we stay close — measuring what matters, sharpening what works, and quietly retiring what doesn't.",
    intro:
      "Launch is the start of the work, not the end of it. We build the measurement and decision loops that let the product keep getting better, week after week.",
    sections: [
      {
        label: "What we do",
        body: "Analytics instrumentation, experimentation infrastructure, weekly product reviews, retention dashboards, and the kind of qualitative listening loop that catches the things the numbers don't show."
      },
      {
        label: "How we work",
        body: "A small embedded team works alongside yours on a monthly cadence — one designer, one engineer, one researcher, and a partner in the loop on every decision."
      },
      {
        label: "Why it matters",
        body: "The product that ships is rarely the product that wins. The teams that iterate clearly, calmly and quickly are the ones who build category-defining work — and that habit is what we leave behind."
      }
    ],
    video: VIDEOS.serviceCare,
    placeholder: "placeholder-video"
  }
];

export function getService(slug: string): Service | undefined {
  return SERVICES.find((s) => s.slug === slug);
}

import type { Metadata } from "next";
import { AboutContent } from "./about-content";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ggakingclub.com";

export const metadata: Metadata = {
  title: "About GoogolPlex: The World's First Unified AI Life Operating System",
  description:
    "GoogolPlex is a Web3 and AI Studio building the Googolplex AI Power Box — humanity's first Unified Life Operating System. Founded under the vision of Dr. Narendra Singh Khurana and the Googolplex Smiles Party Billionaires Club, driving a Peace with Prosperity movement.",
  keywords: [
    "Googolplex AI Power Box",
    "Unified Life Operating System",
    "Web3 and AI Studio",
    "Dr. Narendra Singh Khurana",
    "Peace with Prosperity movement",
    "Global digital identity",
    "AI Health Advisor",
    "Decentralized community hub",
    "Googolplex Smiles Party Billionaires Club",
    "Mother First By Design",
    "Lex Cryptographica",
    "DAO 3.0"
  ],
  alternates: { canonical: `${SITE_URL}/about` },
  openGraph: {
    type: "article",
    title: "About GoogolPlex — The World's First Unified AI Life Operating System",
    description:
      "From fragmented apps to one unified system. The Googolplex AI Power Box unifies finance, learning, health, community and spirituality under one Mother First. By Design. philosophy.",
    url: `${SITE_URL}/about`,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "About GoogolPlex" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "About GoogolPlex — Unified AI Life Operating System",
    description:
      "Humanity's first Unified Life Operating System. Mother First. By Design.",
    images: ["/og.png"]
  }
};

export default function AboutPage() {
  return <AboutContent />;
}

import { HEADSHOTS } from "@/lib/assets";

export type Testimonial = {
  name: string;
  /** Short role + sector, e.g. "CTO · FinTech". */
  role: string;
  company: string;
  img: string;
  /** 2-line micro-quote for the hover tooltip. */
  micro: string;
  /** Full quote for the carousel + review wall. */
  quote: string;
  /** Headline metric / impact, shown as an accent. */
  metric: string;
};

// NOTE: Placeholder copy — themed to the Googolplex ecosystem (Web3 onboarding,
// AI ventures, micro-payments, community). Swap in real testimonials later.
export const TESTIMONIALS: Testimonial[] = [
  {
    name: "Arjun Mehta",
    role: "Founder · Creator Economy",
    company: "Maker Labs",
    img: HEADSHOTS[0],
    micro: "Minted my token and raised my first round from the community in 11 days.",
    quote:
      "I came in with a $1 onboarding and walked out with a funded venture. The AI minted my personalized tokens, the community backed the pitch, and I raised my first round in eleven days — no VCs, no gatekeepers.",
    metric: "$1 → funded in 11 days"
  },
  {
    name: "Sara Okafor",
    role: "CTO · FinTech",
    company: "Remit One",
    img: HEADSHOTS[1],
    micro: "zkTLS onboarding cut our Web2-to-Web3 drop-off by 78%.",
    quote:
      "Account abstraction and gasless transactions meant our users never saw a seed phrase. The zkTLS bridge ported their existing reputation in one tap. Web2-to-Web3 drop-off fell by 78% overnight.",
    metric: "78% lower drop-off"
  },
  {
    name: "Daniel Cho",
    role: "Head of Payments · Marketplace",
    company: "Bazaar",
    img: HEADSHOTS[2],
    micro: "Micro-payments dropped our transaction overhead by 41%.",
    quote:
      "The $1 micro-transaction engine replaced three payment processors for us. Settlement is near-instant across 200 currencies and our transaction and operational overhead dropped by 41%.",
    metric: "41% less overhead"
  },
  {
    name: "Priya Nair",
    role: "Community Lead · DAO",
    company: "Seva Collective",
    img: HEADSHOTS[3],
    micro: "Our SRR-ranked governance finally killed bot manipulation.",
    quote:
      "Soulbound reputation and the Social Reputation Ranking engine gave real contributors real voice. Governance went from bot-gamed chaos to a community that actually decides together.",
    metric: "0 bot-gamed votes"
  },
  {
    name: "Maya Thompson",
    role: "Operations · Logistics",
    company: "Northwind",
    img: HEADSHOTS[4],
    micro: "AI-guided ventures lifted our new business creations by 62%.",
    quote:
      "We used the AI Power Box to spin up sub-ventures and fund them from the community pool. AI-guided business creation lifted our new venture launches by 62% in two quarters.",
    metric: "62% more ventures"
  },
  {
    name: "Leona Park",
    role: "Founder · Social",
    company: "Circles",
    img: HEADSHOTS[5],
    micro: "Brought my whole Web2 audience over without losing a follower.",
    quote:
      "The zkTLS port let me bring my entire audience from three platforms into one owned, censorship-proof identity. My social capital is finally mine — a portable, on-chain asset.",
    metric: "100% audience ported"
  },
  {
    name: "Omar Haddad",
    role: "Engineering · Infra",
    company: "Atlas Grid",
    img: HEADSHOTS[6],
    micro: "Scaled to production load without dropping a single packet.",
    quote:
      "The planetary-scale architecture handled our peak load like it was nothing. We scaled across regions without dropping a single packet — the kind of resilience we couldn't build in-house.",
    metric: "Zero dropped packets"
  },
  {
    name: "Yusuf Demir",
    role: "Treasurer · Cooperative",
    company: "United Fields",
    img: HEADSHOTS[7],
    micro: "The ripple effect distributed wealth across our whole co-op.",
    quote:
      "When one member's token gained value, six billion of those tokens in the community pool lifted everyone's wallet. The Regenerative Economic Loop turned individual wins into shared prosperity.",
    metric: "Shared upside, by design"
  },
  {
    name: "Hannah Reyes",
    role: "Product · Wallet",
    company: "Keyless",
    img: HEADSHOTS[8],
    micro: "MPC + biometric recovery — no lost keys, no support tickets.",
    quote:
      "Multi-party computation meant no single point of failure, and biometric recovery ended the nightmare of lost keys. Our wallet support tickets practically vanished.",
    metric: "Near-zero key loss"
  }
];

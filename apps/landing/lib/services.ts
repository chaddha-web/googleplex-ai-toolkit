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
  /** Cover + article hero image (used on the grid card and detail page). */
  image: string;
  video: string;
  placeholder: string;
};

export const SERVICES: Service[] = [
  {
    slug: "community-hub",
    tag: "Community",
    title: "The Social Hub",
    body: "We connect billions by porting existing Web2 reputations into a decentralized network, uniting people through shared interests rather than just demographics.",
    intro: "At GoogolPlex, we view community not as a passive audience, but as the foundational \"social intelligence layer\" of the entire ecosystem. The modern digital landscape suffers from a profound crisis that we define as \"Reputational Feudalism\". Today, Web2 creators and users are essentially \"leased\" to centralized platforms; their digital identity, social capital, and historical engagement metrics are locked inside corporate silos. If a platform changes its algorithm or suspends an account, a user’s hard-earned audience is instantly destroyed. We are definitively ending this era by building a network where your social capital is a permanently owned, portable asset.",
    sections: [
      {
        label: "Breaking the Walled Gardens: zkTLS & Soulbound Tokens",
        body: "To solve this systemic crisis, we do not force users to start from zero. Instead, we utilize advanced Zero-Knowledge Transport Layer Security (zkTLS) protocols. This breakthrough technology allows users to seamlessly and securely port their existing Web2 social capital—from massive networks like Twitter, Reddit, and Instagram—directly into our decentralized Web3 ecosystem without exposing sensitive personal data.\n\nOnce this social capital is verified, it is crystallized onto the blockchain as a Soulbound Token (SBT). Unlike standard NFTs, SBTs are non-transferable, representing a permanent, verifiable digital identity linked directly to the user's Universal Smart Wallet. This ensures that your reputation belongs entirely to you, allowing you to monetize your influence across the ecosystem regardless of external platform censorship or bans."
      },
      {
        label: "The Social Reputation Ranking (SRR) Engine",
        body: "To ensure absolute trust and prevent \"bot\" manipulation, a user's influence within the community is governed by our proprietary Social Reputation Ranking (SRR) Algorithm. This algorithm mathematically weights a user's genuine ecosystem contribution using three core metrics:\n\n• **Verified Reach ($V_r$)**: The logarithmic scale of verified followers and subscribers ported from integrated platforms.\n• **Engagement Consistency ($E_c$)**: The frequency and depth of a user's verified, positive interactions within the community.\n• **Protocol Longevity ($P_l$)**: The duration of the user's verified account history and their sustained contributions to the ecosystem.\n\nBy utilizing this transparent SRR system, we grant institutional voting multipliers to experienced, genuine community leaders, ensuring that governance and visibility are earned through merit rather than purchased wealth."
      },
      {
        label: "The Global Collaboration Network: How We Connect",
        body: "Once onboarded, users enter a massive, AI-orchestrated Community Hub designed to connect 9 billion people. The Hub functions through powerful, interconnected features:\n\n• **Interest-Based Circles**: Instead of grouping people by arbitrary geographic borders, our AI forms hyper-targeted networks around shared goals, skills, and values.\n• **Project Sharing Platform**: Every member has the stage to present their business idea, product, or vision to a global audience. Through AI-assisted voting, the best ideas rise to the top to receive immediate ecosystem support and tokenized micro-investments.\n• **Mentorship Networks**: Our AI actively matches experienced practitioners with individuals seeking guidance, creating a borderless flow of knowledge and skill-building.\n• **Mutual Aid Network**: Members actively support one another across financial, educational, health, and spiritual needs, creating tangible human solidarity on a global scale."
      },
      {
        label: "The Human Core: One Family. One Future.",
        body: "At the heart of this immense technological infrastructure is the visionary mandate of Dr. Narendra Singh Khurana and the Googolplex Smiles Party Billionaires Club. The Community Hub is where collaboration, opportunity, and love converge.\n\nOur mission is to empower citizens across 200 countries to grow together as One Global Family. We achieve this radical unity without ever asking anyone to change their culture, their faith, or their language. By providing real-time AI translation and respecting all traditions, we ensure that every member—whether an engineer in Singapore, a teacher in Kenya, or a farmer in rural India—has an equal starting point: one dollar, one community, and one shared future.\n\nBecause in the Googolplex ecosystem, every member is a brother or sister—their success is your success, and their peace is your peace."
      }
    ],
    image: "https://i.ibb.co/nNqPpv1G/1.jpg",
    video: VIDEOS.serviceStrategy,
    placeholder: "placeholder-video-4"
  },
  {
    slug: "universal-finance",
    tag: "Wallet",
    title: "Universal Finance",
    body: "We bridge fiat and digital assets into a single interface, empowering users with instant global transactions and proactive AI financial guidance.",
    intro: "At GoogolPlex, we recognize that true digital sovereignty requires absolute financial empowerment. Currently, the global financial system is divided: traditional banking is laden with intermediaries extracting exorbitant fees, while the decentralized Web3 economy remains too complex and volatile for the average human. The Googolplex Universal Smart Wallet is our solution—a secure digital financial home accessible across 200 countries that entirely eliminates the friction between these two worlds.",
    sections: [
      {
        label: "The Dual Railway Architecture: Bridging Fiat and Crypto",
        body: "To make global finance truly universal, we have engineered a Dual EVM and Fiat Wallet Architecture. This system directly connects legacy payment rails with real-time blockchain settlement layers.\n\n• **Seamless Integration**: The wallet natively integrates with global payment networks including Visa, Mastercard, SWIFT, and Apple Pay, alongside Open Banking APIs.\n• **Universal Currency Support**: Users can effortlessly manage over 200 fiat currencies, community tokens, and digital assets on a single, intuitive screen.\n• **The $1 Micro-Transaction Engine**: By utilizing this dual railway, we enable frictionless, near-zero cost global transactions, allowing users to participate in the Googolplex economy—and even launch their businesses—starting with a simple $1 onboarding investment."
      },
      {
        label: "Eliminating Web3 Friction: ERC-4337 Account Abstraction",
        body: "Historically, blockchain adoption has been hindered by massive user friction: seed phrases, lost private keys, and the confusing need to purchase native tokens just to pay for network \"gas\" fees. We have completely abstracted this complexity for the mass consumer.\n\n• **Smart Contract Accounts**: We utilize the advanced ERC-4337 Account Abstraction standard, upgrading standard wallets into highly flexible, programmable smart contracts.\n• **The Gasless Experience**: Through our proprietary \"Paymaster Orchestration,\" users never need to understand or manually fund blockchain gas fees. The platform can sponsor these fees automatically, or allow users to pay for network costs seamlessly in fiat or stablecoins like USDC."
      },
      {
        label: "Keyless, Institutional-Grade Security (MPC)",
        body: "Under our strict Zero Trust Security framework, we have discarded the archaic and vulnerable single private key model.\n\n• **Multi-Party Computation (MPC)**: Our wallets natively integrate MPC threshold cryptography. This means a user's private key is never generated or stored in a single location. Instead, it is divided into distributed shares.\n• **Biometric Recovery**: If a user loses their device, there is no catastrophic loss of funds. Access can be instantly and securely restored through programmable biometric or social recovery bridges."
      },
      {
        label: "The AI Financial Advisor",
        body: "The Universal Smart Wallet is not just a storage vessel; it is an active, intelligent financial companion. Every wallet is equipped with a built-in AI Financial Advisor that works for the user 24/7.\n\n• **Proactive Insights**: The AI analyzes spending patterns, identifies intelligent saving opportunities, and generates real-time financial health scores.\n• **Predictive Coaching**: It learns from the user’s goals to offer personalized coaching for wealth generation and token management. (Note: As part of our strict global compliance, all AI features remain assistive, directing users to certified partners when licensed financial advice is required.)"
      },
      {
        label: "Built for the Unbanked: Mother First Design",
        body: "True to our \"Mother First. By Design.\" philosophy, the wallet is engineered for the 1 billion people globally who lack official identification or banking access.\n\n• **Global Compliance**: The wallet utilizes AI-powered document verification and biometric recognition to provide frictionless KYC and AML compliance globally.\n• **Offline Capabilities**: Utilizing edge computing and Progressive Web App (PWA) architecture, core financial features remain functional even in rural environments with low-bandwidth or offline conditions.\n\nThe Googolplex Universal Smart Wallet is more than an application; it is a profound upgrade to human financial dignity, delivering a Web2 experience with Web3 trust."
      }
    ],
    image: "https://i.ibb.co/G4QPWKJT/2.jpg",
    video: VIDEOS.serviceCraft,
    placeholder: "placeholder-video-5"
  },
  {
    slug: "shared-wealth",
    tag: "Prosperity",
    title: "Shared Wealth",
    body: "We engineer global wealth through personalized tokenomics, where community adoption drives mutual value and proves prosperity does not require extraction.",
    intro: "At GoogolPlex, we are architecting the transition away from the extractive \"Surveillance Capitalism\" of the Web2 era into a revolutionary framework of Community Capitalism. In the legacy digital landscape, monopolistic platforms act as gatekeepers, routinely extracting a 30% to 100% \"tax\" on the value generated by their users. We believe that true global prosperity cannot be hoarded in centralized corporate treasuries; it must be built on the continuous Velocity of Capital, ensuring that wealth circulates directly among the people who create it.",
    sections: [
      {
        label: "The $1 Economy and the Genesis Block",
        body: "The engine of our shared wealth relies on a frictionless $1 micro-transaction paradigm. This single dollar is not a fee; it is an onboarding investment that instantly transforms a passive consumer into an empowered, active stakeholder.\n\nUpon joining, our AI Assistant mints a Genesis Block of 10 Billion personalized tokens in the new member's name. This total is meticulously allocated to guarantee sustainable, non-extractive global abundance:\n\n• **6 Billion (Community Pool)**: 60% flows into the global community to reward loyalty, peace promotion, and collaboration.\n• **2 Billion (Member Ownership)**: 20% belongs entirely to the creator (1 Billion tradeable and promotable, 1 Billion permanently locked to support future generations).\n• **2 Billion (Platform Reserve)**: 20% is held to fund platform operations, global expansion, and ecosystem development."
      },
      {
        label: "The Regenerative Economic Loop (REL)",
        body: "To eliminate the intermediary tax and ensure wealth is mathematically distributed, our ecosystem operates on a Regenerative Economic Loop (REL) enforced by immutable smart contracts. Every $1 transaction is trustlessly split at the protocol layer without human intervention:\n\n• **40% Creator Payout**: Pushed instantly to the creator's secure wallet.\n• **20% Community Rewards**: Funds staking yields and engagement bonuses for active ecosystem participants.\n• **20% Platform Operations**: Allocated for enterprise infrastructure and core research & development.\n• **10% Liquidity & Stability**: Supports automated market stability on decentralized exchanges.\n• **10% Charity / Seva Fund**: Routed transparently to audited global peace initiatives and impact projects."
      },
      {
        label: "The Altruistic Reward Curve & The Ripple Effect",
        body: "In the Googolplex ecosystem, success is never a zero-sum game. We utilize a mathematically proven Altruistic Reward Curve, which ensures that as transaction velocity increases, the collective wealth of the entire community grows exponentially.\n\nBecause 6 billion of every member's tokens circulate in the global pool, every individual's success creates a massive ripple effect. If a user's 1 billion tradeable tokens achieve a value of just $1 through community adoption, that creator effectively holds $1 billion in assets. However, because the global community holds 6 billion of those specific tokens, that single user's rise to success simultaneously distributes $6 billion in wealth across the wallets of the rest of the network.\n\nThis is the ultimate proof that one person's success does not require another's failure. In our unified ecosystem, a rising tide literally lifts every boat, proving that civilizational prosperity can be achieved purely through shared human collaboration."
      }
    ],
    image: "https://i.ibb.co/n8r5J4mb/3.jpg",
    video: VIDEOS.philosophy,
    placeholder: "placeholder-video-3"
  },
  {
    slug: "city-of-peace",
    tag: "Infrastructure",
    title: "City of Peace",
    body: "We manifest our digital ecosystem into physical urban hubs managed by a decentralized DAO, establishing India as a global capital for decentralized finance.",
    intro: "At GoogolPlex, we understand that to build a true civilization, our technology must extend beyond the digital realm and reshape the physical world. We are not just building software; we are architecting environments where human potential can thrive. The \"City of Peace\" project represents the ambitious physical manifestation of Dr. Narendra Singh Khurana's overarching \"Peace with Prosperity\" vision, bringing our trillion-dollar economic paradigm into the real world.",
    sections: [
      {
        label: "Digital Twin Real Estate",
        body: "To accomplish this seamless transition from the blockchain to the physical world, we are pioneering the concept of Digital Twin Real Estate. These are physical urban developments and infrastructure hubs that are directly mapped to and managed by our decentralized network.\n\n• **The $1 Utility Economy**: Within these urban hubs, residents and community members will utilize our frictionless $1 transaction model to seamlessly pay for, govern, and manage everyday utility services. This eliminates the need for legacy banking friction and creates a self-sustaining local economy powered entirely by the community."
      },
      {
        label: "DAO 3.0 Civic Governance",
        body: "The City of Peace will not be managed by traditional, centralized bureaucratic authorities, but rather by the Googolplex Decentralized Autonomous Organization (DAO).\n\n• **Transparent City Management**: By leveraging our advanced DAO 3.0 architecture, civic decisions—ranging from infrastructure upgrades to community funding—will be managed through cryptographic law and transparent smart contracts.\n• **Equitable Voting**: Utilizing Quadratic Voting and our AI-guided governance engine, every resident is guaranteed an equitable voice in how their city operates, completely protecting the community from the inefficiencies and inequalities of legacy \"corpo-feudal\" hierarchies."
      },
      {
        label: "Establishing India as the Global DeFi Epicenter",
        body: "This physical expansion carries a profound global strategy. The City of Peace project is explicitly designed to establish India as the undisputed global capital for decentralized finance (DeFi), technological entrepreneurship, and international peace. By anchoring our Web3 ecosystem in physical Indian urban hubs, we are creating a beacon for global developers, creators, and investors to converge and build the future of the digital economy."
      },
      {
        label: "The 'Har Maidan Fateh' Mandate",
        body: "Ultimately, the City of Peace is the tangible embodiment of the \"Har Maidan Fateh\" vision—a mandate for universal victory, where prosperity is shared by all. Inspired by Dr. Khurana’s prayer visits and the historical teachings of inter-faith unity and compassion, these physical hubs will serve as a sanctuary for humanity. They will stand as physical proof that a world guided by spiritual peace, technological sovereignty, and shared abundance is not just a digital dream, but a living reality."
      }
    ],
    image: "https://i.ibb.co/wFxq4f9H/4.jpg",
    video: VIDEOS.featured,
    placeholder: "placeholder-video-2"
  },
  {
    slug: "ai-powered-ventures",
    tag: "Create",
    title: "AI-Powered Ventures",
    body: "We equip every user to launch and fund their vision through AI-guided tokenization, global community pitching, and decentralized micro-investing.",
    intro: "At GoogolPlex, we are fundamentally redefining the global Creator Economy, a sector projected to reach $407 billion by 2030. In the legacy digital world, the vast majority of people are relegated to being passive consumers, while centralized platforms extract the value. In the Googolplex ecosystem, every user is a creator. We democratize entrepreneurship and venture building so that anyone, regardless of their background or geography, can turn their ideas into a verifiable, funded reality.\n\nHere is an in-depth breakdown of how our AI-Powered Ventures ecosystem empowers the individual:",
    sections: [
      {
        label: "1. AI-Guided Tokenization: The Genesis of Your Digital Equity",
        body: "The journey of a creator begins with a frictionless, highly accessible $1 onboarding investment. This is not a fee, but an investment that instantly transforms you into an active stakeholder.\n\n• **The AI Interview**: When you join the community, our AI Assistant conducts an interactive setup wizard to deeply understand your specific project, product, talent, or overarching vision.\n• **Minting Your Brand**: Based on this understanding, the AI instantly generates 10 Billion personalized tokens in your name. This establishes your personal brand and your digital ecosystem stake.\n• **The Strategic Distribution**: To ensure that prosperity is shared and the ecosystem remains sustainable, these tokens are strictly allocated: 6 Billion flow into the global community pool to reward loyalty and collaboration, 2 Billion belong entirely to you (1 Billion tradeable/promotable and 1 Billion permanently locked to support future members), and 2 Billion are held in platform reserves for operational expansion."
      },
      {
        label: "2. Global Community Pitching: A Borderless Stage",
        body: "Once your personalized tokens are minted, you are equipped to present your vision to the world through our Project Sharing Platform.\n\n• **Unprecedented Reach**: Every member has the ability to present their business idea, product, or service directly to a massive global community spanning 200 countries.\n• **AI-Assisted Validation**: To ensure that the most impactful and viable ideas receive visibility, the platform utilizes AI-assisted community voting. The community evaluates and votes on initiatives, ensuring that the best ideas organically rise to the top to receive ecosystem support. You no longer need geographic proximity to Silicon Valley to get your pitch heard; you simply need a compelling vision and community trust."
      },
      {
        label: "3. Decentralized Micro-Investing: Bypassing Traditional Gatekeepers",
        body: "We eliminate the reliance on traditional, highly exclusive venture capital by enabling decentralized micro-investing directly from your peers.\n\n• **Project Backing**: Through the platform's features, fellow community members can utilize their own tokens to act as micro-investors.\n• **Ecosystem Support**: Members back the ideas they believe in most, creating a self-sustaining incubator. This means that if your global pitch is successful, your project is funded and supported directly by the people who see its value, creating immediate market validation and liquidity."
      },
      {
        label: "4. The Billionaire Scenario & Cross-Member Wealth",
        body: "The ultimate proof of our \"Community Capitalism\" model is the economic engine that drives shared success, highlighted by what we call the Billionaire Scenario.\n\n• **The Path to $1 Billion**: Of your 10 billion personalized tokens, you hold 1 billion that are freely tradeable. If your project gains traction, community adoption, and ecosystem growth driving the value of your personal token to just $1, you effectively hold assets worth **$1 billion**.\n• **The Ripple Effect**: Crucially, success in the Googolplex AI Power Box is never zero-sum. Because 6 billion of your tokens continuously circulate in the global community pool, your rise in value simultaneously benefits the wallets of all other community members holding those tokens.\n\nWhen one member succeeds, the entire network benefits. This creates a mathematical certainty of shared global wealth, proving that civilizational prosperity can be achieved through mutual collaboration rather than extraction. Through AI-Powered Ventures, we are not just helping users build businesses; we are helping humanity build a collective future."
      }
    ],
    image: "https://i.ibb.co/whbv4z3j/5.jpg",
    video: VIDEOS.serviceCare,
    placeholder: "placeholder-video"
  }
];

export function getService(slug: string): Service | undefined {
  return SERVICES.find((s) => s.slug === slug);
}

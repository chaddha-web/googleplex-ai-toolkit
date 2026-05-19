import type { Metadata, Viewport } from "next";
import { CookieConsent } from "@/components/cookie-consent";
import "./globals.css";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://ggakingclub.com";
const SITE_NAME = "GoogolPlex";
const TITLE = "GoogolPlex — Web3, Social & AI Studio";
const DESCRIPTION =
  "GoogolPlex is a calm, premium ecosystem for builders — multi-chain wallet, social-first governance, and an AI studio that ships a brand and a deployable site in under five minutes.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · GoogolPlex"
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: "Fit Tech Collectives" }],
  creator: "Fit Tech Collectives",
  publisher: "Fit Tech Collectives",
  category: "technology",
  keywords: [
    "Web3 platform",
    "multi-chain wallet",
    "DAO governance",
    "AI brand generator",
    "AI site builder",
    "crypto onboarding",
    "USDT wallet",
    "USDC wallet",
    "Tron",
    "Ethereum",
    "BSC",
    "decentralized projects",
    "creator collective",
    "GoogolPlex"
  ],
  alternates: {
    canonical: SITE_URL
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "en_US",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "GoogolPlex — Web3, Social & AI Studio"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    site: "@googolplex",
    creator: "@googolplex",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og.png"]
  },
  icons: {
    icon: [{ url: "/icon.png" }],
    apple: [{ url: "/icon.png" }]
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1
    }
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false
  }
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5
};

// JSON-LD Organization schema — gets crawled and rendered as a knowledge panel.
const orgJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/icon.png`,
  description: DESCRIPTION,
  founder: { "@type": "Organization", name: "Fit Tech Collectives" },
  sameAs: [
    // TODO: replace with real social handles when live
    "https://twitter.com/googolplex",
    "https://instagram.com/googolplex",
    "https://youtube.com/@googolplex"
  ]
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  potentialAction: {
    "@type": "SearchAction",
    target: `${SITE_URL}/?q={search_term_string}`,
    "query-input": "required name=search_term_string"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        {/* eslint-disable-next-line react/no-danger */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
        {/* eslint-disable-next-line react/no-danger */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body className="bg-black text-white">
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}

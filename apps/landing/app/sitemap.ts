import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ggakingclub.com";

const SERVICE_SLUGS = [
  "community-hub",
  "universal-finance",
  "shared-wealth",
  "city-of-peace",
  "ai-powered-ventures"
];

const STATIC_ROUTES = [
  "",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/report",
  "/signup",
  "/login"
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const base: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1.0 : 0.7
  }));
  const services: MetadataRoute.Sitemap = SERVICE_SLUGS.map((slug) => ({
    url: `${SITE_URL}/services/${slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.8
  }));
  return [...base, ...services];
}

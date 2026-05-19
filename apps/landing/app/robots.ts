import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ggakingclub.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Public marketing — let crawlers in
      { userAgent: "*", allow: ["/"], disallow: ["/app", "/app/*", "/api/"] }
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL
  };
}

import type { MetadataRoute } from "next";

import { siteOrigin } from "@/lib/site";

/**
 * /robots.txt — allows crawling, points crawlers at the sitemap, and keeps them out
 * of /preview (which also sends noindex, and needs a CMS token to show anything).
 */
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/preview/" },
    ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}),
  };
}

import type { MetadataRoute } from "next";

import { getPublishedPaths } from "@/lib/queries";
import { siteOrigin } from "@/lib/site";

/**
 * /sitemap.xml — every published Experience page, read from Optimizely Graph.
 *
 * Pages exist because editors publish them in the CMS, not because a file exists
 * here, so search engines cannot discover them by crawling routes. This lists them.
 *
 * Regenerated at most hourly. A Graph failure yields an empty sitemap (logged),
 * never a failed build or a 500: the site works without it.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  if (!origin) {
    console.warn("[sitemap] SITE_URL is not set to a valid https origin; serving an empty sitemap");
    return [];
  }

  try {
    const pages = await getPublishedPaths();
    return pages.map(({ path, published }) => ({
      url: `${origin}${path}`,
      ...(published ? { lastModified: published } : {}),
    }));
  } catch (error) {
    console.error("[sitemap] could not list published pages", error);
    return [];
  }
}

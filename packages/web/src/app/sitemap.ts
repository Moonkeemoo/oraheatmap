import type { MetadataRoute } from "next";

const SITE_URL = "https://oralab.xyz";

/**
 * Public sitemap. Just the indexable marketing pages for now —
 * /app, /account are excluded via robots.ts and don't belong here.
 *
 * lastModified is hardcoded to a recent reference date and bumped
 * whenever the corresponding page's content shifts meaningfully.
 * Per Google's guidance, we set higher priority for the root and
 * lower for legal pages so crawl budget skews toward the homepage.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-05-05");
  return [
    {
      url: `${SITE_URL}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}

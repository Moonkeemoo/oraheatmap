import type { MetadataRoute } from "next";

const SITE_URL = "https://oralab.xyz";

/**
 * Public crawler policy. The marketing surface (root, privacy, terms)
 * stays open. The dashboard at /app is excluded — it's dynamic SSE
 * content with no SEO value, and the same applies to /account and the
 * cross-origin-by-design /api/* surface.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: ["/app", "/account", "/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

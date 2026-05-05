import { FAQ_ITEMS } from "./faq-items";

const SITE_URL = "https://oralab.xyz";

/**
 * Schema.org structured data emitted as a JSON-LD <script> in the
 * landing page <head>. Three @graph entries:
 *   - WebSite (with SearchAction wired to the dashboard, harmless if
 *     Google never surfaces a sitelinks searchbox).
 *   - Organization (drives the brand panel + logo in SERP).
 *   - FAQPage built from the same FAQ_ITEMS the on-page Faq component
 *     renders, so the structured data and visible answers never drift.
 */
export function JsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: "oralab",
        description:
          "Real-time Polymarket whale tracker — smart-money signals across 9 prediction-market categories.",
        inLanguage: "en-US",
        publisher: { "@id": `${SITE_URL}/#org` },
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#org`,
        name: "oralab",
        url: SITE_URL,
        // logo / sameAs picked up by the brand SERP card.
        logo: { "@type": "ImageObject", url: `${SITE_URL}/favicon.svg` },
        sameAs: [
          // Add X/GitHub/Discord URLs here once they're live.
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq`,
        mainEntity: FAQ_ITEMS.map((qa) => ({
          "@type": "Question",
          name: qa.q,
          acceptedAnswer: { "@type": "Answer", text: qa.a },
        })),
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      // JSON.stringify is enough — schema.org JSON-LD doesn't need
      // HTML escaping (it lives inside a script tag, not regular HTML).
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

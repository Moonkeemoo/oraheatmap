import type { Metadata, Viewport } from "next";
import { SessionProvider } from "next-auth/react";
import "@fontsource/space-grotesk/700.css";
import "./globals.css";

const SITE_URL = "https://oralab.xyz";
const SITE_NAME = "oralab";
const SITE_TITLE = "oralab · Polymarket whale tracker · live PnL heatmap";
const SITE_DESCRIPTION =
  "Real-time Polymarket whale tracker. Smart-money signals across 9 prediction-market categories, drill from a hot cell to the markets driving it. PATTERN view, whale dossier with 90-day PnL. Free forever for the basic view.";

export const metadata: Metadata = {
  // metadataBase resolves all relative og:image / twitter:image URLs
  // against this origin so the social-preview links don't 404 in
  // Slack / X / Discord crawlers.
  metadataBase: new URL(SITE_URL),
  title: {
    // Each page sets its own title via `title.absolute` or via a slot;
    // anything else falls back to the default.
    template: `%s · ${SITE_NAME}`,
    default: SITE_TITLE,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // Concrete keyword set the landing should rank for. Modern Google
  // mostly ignores meta-keywords but Bing/Yandex/DuckDuckGo still
  // use it as a weak signal.
  keywords: [
    "polymarket",
    "polymarket whale tracker",
    "polymarket smart money",
    "polymarket signals",
    "polymarket dashboard",
    "polymarket pnl",
    "polymarket leaderboard",
    "prediction market whales",
    "smart money tracker",
    "onchain whale tracking",
    "real-time whale alerts",
  ],
  icons: { icon: "/favicon.svg" },
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  // Search-engine site-ownership tokens. Each key writes a single
  // <meta> in the document head; the engines read it once on
  // verification and never look at it again.
  verification: {
    other: {
      "msvalidate.01": "A893533E8252BFC576390F470266C4F3",
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d1117",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}

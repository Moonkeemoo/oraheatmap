import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import "@fontsource/space-grotesk/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "oralab · Polymarket Heatmap",
  description: "Real-time Polymarket whale activity heatmap",
  icons: {
    icon: "/favicon.svg",
  },
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

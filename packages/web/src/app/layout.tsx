import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Whale Signal Heatmap",
  description: "Real-time Polymarket whale activity heatmap",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

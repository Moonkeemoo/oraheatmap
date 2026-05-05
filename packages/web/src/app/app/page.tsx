import type { Metadata } from "next";

import { Heatmap } from "@/components/Heatmap";

export const metadata: Metadata = {
  title: "Heatmap",
  description:
    "Live Polymarket whale heatmap — every trade across 9 categories, drill into hot cells, see top whales and markets per slot.",
  // Dashboard is dynamic, gated behind sign-in for most features, and
  // SSE-driven — nothing useful for crawlers to index. Keep them on
  // the marketing page where the indexable copy lives.
  robots: { index: false, follow: true },
};

export default function Page() {
  return <Heatmap />;
}

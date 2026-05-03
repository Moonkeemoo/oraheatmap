import type { HeatmapRange, HeatmapResponse } from "./types";

const DEFAULT_BASE = "http://localhost:3001";

export function apiBase(): string {
  // NEXT_PUBLIC_API_URL is bundled at build time but readable at runtime too.
  if (typeof process !== "undefined" && process.env["NEXT_PUBLIC_API_URL"]) {
    return process.env["NEXT_PUBLIC_API_URL"];
  }
  return DEFAULT_BASE;
}

export async function fetchHeatmap(range: HeatmapRange): Promise<HeatmapResponse> {
  const res = await fetch(`${apiBase()}/api/heatmap?range=${range}`, {
    cache: "no-store",
    credentials: "omit",
  });
  if (!res.ok) {
    throw new Error(`heatmap fetch failed: ${res.status}`);
  }
  return (await res.json()) as HeatmapResponse;
}

export function streamUrl(): string {
  return `${apiBase()}/api/stream`;
}

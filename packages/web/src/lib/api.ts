import type { HeatmapResponse, LiveRange, Mode, PatternKind } from "./types";

const DEFAULT_BASE = "http://localhost:3001";

export function apiBase(): string {
  if (typeof process !== "undefined" && process.env["NEXT_PUBLIC_API_URL"]) {
    return process.env["NEXT_PUBLIC_API_URL"];
  }
  return DEFAULT_BASE;
}

export async function fetchHeatmap(args: {
  mode: Mode;
  range?: LiveRange;
  kind?: PatternKind;
  lookbackDays?: number;
}): Promise<HeatmapResponse> {
  const params = new URLSearchParams();
  params.set("mode", args.mode);
  if (args.mode === "live" && args.range) params.set("range", args.range);
  if (args.mode === "pattern") {
    if (args.kind) params.set("kind", args.kind);
    if (args.lookbackDays) params.set("lookbackDays", String(args.lookbackDays));
  }
  const res = await fetch(`${apiBase()}/api/heatmap?${params.toString()}`, {
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

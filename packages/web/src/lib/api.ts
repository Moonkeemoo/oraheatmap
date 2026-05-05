import type {
  Category,
  HeatmapResponse,
  LiveRange,
  Mode,
  PatternKind,
  WhaleProfile,
} from "./types";

/** API base URL.
 *
 * Order of resolution (first non-empty wins):
 *   1. `NEXT_PUBLIC_API_URL` env baked at build (used when web and api live
 *      on different origins or you're testing against a remote API from a
 *      local web).
 *   2. `window.location.origin` — works for the deploy where Caddy proxies
 *      /api/* to Elysia under the same host as the web app. Same-origin
 *      means no CORS, no preflight, no cookie-domain headaches.
 *   3. Local-dev fallback to localhost:3001.
 */
export function apiBase(): string {
  const envUrl = process.env["NEXT_PUBLIC_API_URL"];
  if (envUrl) return envUrl;
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "http://localhost:3001";
}

export async function fetchHeatmap(args: {
  mode: Mode;
  range?: LiveRange;
  kind?: PatternKind;
  lookbackDays?: number;
  drillCategory?: Category | null;
  drillSubcategory?: string | null;
}): Promise<HeatmapResponse> {
  const params = new URLSearchParams();
  params.set("mode", args.mode);
  if (args.mode === "live" && args.range) params.set("range", args.range);
  if (args.mode === "pattern") {
    if (args.kind) params.set("kind", args.kind);
    if (args.lookbackDays) params.set("lookbackDays", String(args.lookbackDays));
  }
  if (args.drillCategory) params.set("category", args.drillCategory);
  if (args.drillCategory && args.drillSubcategory) {
    params.set("subcategory", args.drillSubcategory);
  }
  const res = await fetch(`${apiBase()}/api/heatmap?${params.toString()}`, {
    // Lean on the browser HTTP cache — server returns short-lived
    // Cache-Control headers tuned per range (5s on 1h, 180s on 12w).
    // Tab switches that re-request the same params skip the network
    // entirely; SSE keeps the visible grid current via optimistic
    // updates in heatmap-apply.
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`heatmap fetch failed: ${res.status}`);
  }
  return (await res.json()) as HeatmapResponse;
}

export function streamUrl(): string {
  return `${apiBase()}/api/stream`;
}

export async function fetchAllRowOrders(): Promise<Record<string, string[]>> {
  const res = await fetch(`${apiBase()}/api/me/row-order`, {
    cache: "no-store",
    credentials: "include",
  });
  if (res.status === 401) return {};
  if (!res.ok) throw new Error(`row-order fetch failed: ${res.status}`);
  const body = (await res.json()) as { orders?: Record<string, string[]> };
  return body.orders ?? {};
}

export async function saveRowOrder(scope: string, orderedKeys: string[]): Promise<void> {
  const res = await fetch(`${apiBase()}/api/me/row-order`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ scope, orderedKeys }),
  });
  if (!res.ok && res.status !== 401) {
    throw new Error(`row-order save failed: ${res.status}`);
  }
}

export async function fetchWhaleProfile(args: {
  addr: string;
  range: LiveRange;
}): Promise<WhaleProfile> {
  const params = new URLSearchParams({ addr: args.addr, range: args.range });
  const res = await fetch(`${apiBase()}/api/whale?${params.toString()}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`whale profile fetch failed: ${res.status}`);
  }
  return (await res.json()) as WhaleProfile;
}

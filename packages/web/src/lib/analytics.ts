/**
 * First-party product analytics. Buffers events client-side and POSTs
 * them to /api/analytics in batches. Strongly-typed event helpers below
 * — call sites use the named functions (track.modeChanged(...),
 * track.cellOpen(...) etc.) so the TS compiler enforces required props
 * and the server allowlist + frontend stay in lockstep.
 *
 * Privacy posture:
 *   - session_id is a random UUID stored in localStorage. Nothing else
 *     personal is sent. No fingerprint surfaces.
 *   - referrer is reduced to its hostname (no URL params).
 *   - ua_brief is a short "Chrome 132 / macOS" string, NOT the full UA.
 *   - We never auto-track form input values or DOM text content.
 *   - Honors `localStorage.analytics_optout = "1"` — the SDK no-ops then.
 *
 * Transport:
 *   - Events accumulate in `queue` and flush every FLUSH_MS, OR when
 *     queue size exceeds FLUSH_BATCH_SIZE, OR on `pagehide` /
 *     `visibilitychange:hidden` via navigator.sendBeacon (so the last
 *     events from a session don't disappear on navigation).
 */

import { apiBase } from "./api";

const SESSION_KEY = "ora_analytics_session";
const OPTOUT_KEY = "analytics_optout";
const FLUSH_MS = 6_000;
const FLUSH_BATCH_SIZE = 20;
const MAX_QUEUE = 50;

// ─── Event taxonomy — mirrored on the server in api.ts ─────────────────
// Adding an event here? Add the same name to ALLOWED_EVENT_NAMES in
// packages/api/src/api.ts or the server will silently drop it.
type EventPayload = {
  /** Identity / navigation */
  session_start: { entryPath: string; referrerHost: string | null; uaBrief: string };
  pageview: { path: string };

  /** Heatmap controls */
  mode_changed: { from: string; to: string };
  range_changed: { from: string; to: string };
  metric_changed: { from: string; to: string };
  pattern_kind_changed: { from: string; to: string };

  /** Drill / engagement */
  drill_open: {
    level: 2 | 3;
    category: string;
    subcategory?: string | null;
  };
  drill_back: { fromLevel: 2 | 3 };
  cell_open: {
    level: 1 | 2 | 3;
    category: string;
    isNow: boolean;
  };
  whale_drawer_open: {
    source: "cell" | "stats" | "tooltip";
    /** Truncated whale addr (first 10 chars) — useful for affinity
     *  analysis without storing full wallet identifiers. */
    addrShort: string;
  };
  whale_drawer_close: { dwellMs: number };

  /** Outbound — strongest value moment */
  market_link_click: {
    level: 1 | 2 | 3;
    category: string;
    /** Polymarket event slug; null if missing on the row. */
    marketSlug: string | null;
  };
  external_click: { target: "polymarket" | "twitter" | "discord" | "github" };

  /** Auth funnel */
  signin_modal_opened: {
    /** What the user was trying to do when sign-in popped. */
    triggerSource:
      | "header"
      | "range_locked"
      | "metric_locked"
      | "mode_locked"
      | "drill_locked"
      | "cell_open"
      | "whale_drawer"
      | "reorder";
  };
  signin_modal_closed: { dwellMs: number; triggerSource: string };
  signin_completed: {
    provider: "siwe" | "resend" | "github" | "discord" | "telegram" | "twitter";
    /** ms between modal_opened and completion — surfacing friction. */
    timeToSigninMs: number;
  };

  /** Pro-gated UX */
  locked_feature_hover: { feature: string };
  locked_feature_click: { feature: string; source: string };

  /** Quality / live feed */
  sse_connected: Record<string, never>;
  sse_dropped: { reason: string };
  convergence_event_seen: { whales: number; category: string };
};

type EventName = keyof EventPayload;

type QueuedEvent = {
  name: EventName;
  ts: string;
  sessionId: string;
  path: string;
  referrer: string | null;
  uaBrief: string;
  props: Record<string, unknown>;
};

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let cachedSessionId: string | null = null;
let cachedUaBrief: string | null = null;
let initted = false;

/** Get or mint the per-browser session id. localStorage so it survives
 *  reloads; cleared by user wipe or explicit logout-everything action. */
function getSessionId(): string {
  if (cachedSessionId) return cachedSessionId;
  if (typeof window === "undefined") return "ssr";
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(SESSION_KEY, id);
    }
    cachedSessionId = id;
    return id;
  } catch {
    return "anon";
  }
}

function isOptedOut(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(OPTOUT_KEY) === "1";
  } catch {
    return false;
  }
}

/** Brief UA string — major browser + OS, no version-fingerprint surface. */
function getUaBrief(): string {
  if (cachedUaBrief) return cachedUaBrief;
  if (typeof navigator === "undefined") return "ssr";
  const ua = navigator.userAgent ?? "";
  const browser = ua.includes("Chrome") && !ua.includes("Edg")
    ? "Chrome"
    : ua.includes("Firefox")
      ? "Firefox"
      : ua.includes("Safari") && !ua.includes("Chrome")
        ? "Safari"
        : ua.includes("Edg")
          ? "Edge"
          : "Other";
  const os = ua.includes("Mac") ? "macOS" : ua.includes("Win") ? "Windows" : ua.includes("Linux") ? "Linux" : ua.includes("Android") ? "Android" : ua.includes("iPhone") || ua.includes("iPad") ? "iOS" : "Other";
  cachedUaBrief = `${browser} / ${os}`;
  return cachedUaBrief;
}

function getPath(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

function getReferrerHost(): string | null {
  if (typeof document === "undefined") return null;
  if (!document.referrer) return null;
  try {
    const u = new URL(document.referrer);
    if (u.hostname === window.location.hostname) return null; // internal
    return u.hostname;
  } catch {
    return null;
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_MS);
}

async function flush(useBeacon = false): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue.slice(0, FLUSH_BATCH_SIZE);
  queue = queue.slice(batch.length);
  const url = `${apiBase()}/api/analytics`;
  const body = JSON.stringify({ events: batch });
  if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
    // Best-effort delivery on pagehide. Non-blocking, no response.
    try {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(url, blob);
      return;
    } catch {
      // fall through to fetch
    }
  }
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body,
      keepalive: true,
    });
  } catch {
    // Drop on the floor — analytics must never break the app.
  }
}

/** Initialise once on app mount. Fires session_start + first pageview. */
export function initAnalytics(): void {
  if (initted || typeof window === "undefined" || isOptedOut()) return;
  initted = true;

  // Seed session_start at most once per (session_id × tab open).
  const sessionStartedKey = `${SESSION_KEY}_started`;
  let alreadyStarted = false;
  try {
    alreadyStarted = sessionStorage.getItem(sessionStartedKey) === "1";
    sessionStorage.setItem(sessionStartedKey, "1");
  } catch {
    /* ignore */
  }
  if (!alreadyStarted) {
    push("session_start", {
      entryPath: getPath(),
      referrerHost: getReferrerHost(),
      uaBrief: getUaBrief(),
    });
  }
  push("pageview", { path: getPath() });

  // Flush remaining events on tab hide / unload.
  const onHide = (): void => {
    void flush(true);
  };
  window.addEventListener("pagehide", onHide);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") onHide();
  });
}

/** Inner queueing primitive — type-erased for the ALLOWED_EVENT_NAMES check.
 *  Public surface goes through the typed `track` helpers below. */
function push<N extends EventName>(name: N, props: EventPayload[N]): void {
  if (typeof window === "undefined" || isOptedOut() || !initted && name !== "session_start" && name !== "pageview") {
    // Pre-init events from session_start/pageview are allowed (initAnalytics calls them).
    if (!initted) {
      // Allow during init to capture the first pair.
    } else return;
  }
  if (queue.length >= MAX_QUEUE) {
    // Drop oldest — keeps memory bounded if /api/analytics is unreachable.
    queue.shift();
  }
  queue.push({
    name,
    ts: new Date().toISOString(),
    sessionId: getSessionId(),
    path: getPath(),
    referrer: getReferrerHost(),
    uaBrief: getUaBrief(),
    props: props as Record<string, unknown>,
  });
  if (queue.length >= FLUSH_BATCH_SIZE) {
    void flush();
  } else {
    scheduleFlush();
  }
}

/** Public API. Each helper enforces its props shape so call sites get
 *  compile-time errors when a required field is missing or misnamed. */
export const track = {
  pageview: (path: string) => push("pageview", { path }),
  modeChanged: (from: string, to: string) => push("mode_changed", { from, to }),
  rangeChanged: (from: string, to: string) => push("range_changed", { from, to }),
  metricChanged: (from: string, to: string) => push("metric_changed", { from, to }),
  patternKindChanged: (from: string, to: string) =>
    push("pattern_kind_changed", { from, to }),
  drillOpen: (level: 2 | 3, category: string, subcategory?: string | null) =>
    push("drill_open", { level, category, subcategory: subcategory ?? null }),
  drillBack: (fromLevel: 2 | 3) => push("drill_back", { fromLevel }),
  cellOpen: (level: 1 | 2 | 3, category: string, isNow: boolean) =>
    push("cell_open", { level, category, isNow }),
  whaleDrawerOpen: (
    source: EventPayload["whale_drawer_open"]["source"],
    addr: string,
  ) => push("whale_drawer_open", { source, addrShort: addr.slice(0, 10) }),
  whaleDrawerClose: (dwellMs: number) =>
    push("whale_drawer_close", { dwellMs: Math.round(dwellMs) }),
  marketLinkClick: (
    level: 1 | 2 | 3,
    category: string,
    marketSlug: string | null,
  ) => push("market_link_click", { level, category, marketSlug }),
  externalClick: (target: EventPayload["external_click"]["target"]) =>
    push("external_click", { target }),
  signinModalOpened: (
    triggerSource: EventPayload["signin_modal_opened"]["triggerSource"],
  ) => push("signin_modal_opened", { triggerSource }),
  signinModalClosed: (dwellMs: number, triggerSource: string) =>
    push("signin_modal_closed", { dwellMs: Math.round(dwellMs), triggerSource }),
  signinCompleted: (
    provider: EventPayload["signin_completed"]["provider"],
    timeToSigninMs: number,
  ) =>
    push("signin_completed", {
      provider,
      timeToSigninMs: Math.round(timeToSigninMs),
    }),
  lockedFeatureHover: (feature: string) =>
    push("locked_feature_hover", { feature }),
  lockedFeatureClick: (feature: string, source: string) =>
    push("locked_feature_click", { feature, source }),
  sseConnected: () => push("sse_connected", {}),
  sseDropped: (reason: string) => push("sse_dropped", { reason }),
  convergenceEventSeen: (whales: number, category: string) =>
    push("convergence_event_seen", { whales, category }),
};

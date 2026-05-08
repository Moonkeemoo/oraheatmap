/**
 * Background cache warmer.
 *
 * Fires synthetic /api/heatmap requests against the local loopback at a
 * fixed cadence so the SWR cache always has a fresh entry for the
 * popular tab combinations. With this running, a real user clicking
 * LIVE/12w or MACRO/day-12w should never hit a cold cache miss — at
 * worst they get the stale value while a refresh runs in the
 * background, which is sub-100ms instead of 18-22s.
 *
 * Why HTTP loopback rather than calling the cache directly:
 *   - the heatmap handler already builds the cache key + compute closure
 *     inline; we'd have to refactor it to expose those, and any drift
 *     between handler params and warmer key-building would silently miss
 *   - loopback fetch is ~5-30ms overhead on a hit, negligible on a miss
 *     (the 18s compute dwarfs it)
 *   - the warmer is decoupled — adding a new combo is one line, no
 *     internal API changes
 */

import { log } from "./log";

/** Heatmap query strings to keep warm. Each is a relative URL — the warmer
 *  prepends `http://127.0.0.1:${port}` at request time. Order doesn't
 *  matter; we space the per-cycle requests with a small jitter so they
 *  don't all hit the DB at the same instant. */
const WARM_PATHS: ReadonlyArray<string> = [
  // LIVE — every range so tab switches between 1h/24h/12d/12w are warm.
  "/api/heatmap?mode=live&range=1h",
  "/api/heatmap?mode=live&range=24h",
  "/api/heatmap?mode=live&range=12d",
  "/api/heatmap?mode=live&range=12w",
  // PATTERN — both kinds.
  "/api/heatmap?mode=pattern&kind=hour-of-day",
  "/api/heatmap?mode=pattern&kind=day-of-week",
  // MACRO — both subkinds.
  "/api/heatmap?mode=macro&macroKind=hour-week",
  "/api/heatmap?mode=macro&macroKind=day-12w",
  // WHALES subject — top whales (default), live ranges that users hit most.
  "/api/heatmap?subject=whales&mode=live&range=1h&whaleSet=top",
  "/api/heatmap?subject=whales&mode=live&range=24h&whaleSet=top",
  "/api/heatmap?subject=whales&mode=macro&macroKind=hour-week&whaleSet=top",
];

/** Run once per cycle: fire every warm URL, log a one-line summary. Failures
 *  per-URL are swallowed — the warmer is best-effort. */
async function warmOnce(baseUrl: string): Promise<void> {
  const started = Date.now();
  let hits = 0;
  let stales = 0;
  let misses = 0;
  let errs = 0;
  await Promise.all(
    WARM_PATHS.map(async (path) => {
      try {
        const res = await fetch(`${baseUrl}${path}`, {
          headers: { "x-warmer": "1" },
        });
        if (!res.ok) {
          errs += 1;
          return;
        }
        const status = res.headers.get("x-cache");
        if (status === "hit") hits += 1;
        else if (status === "stale") stales += 1;
        else if (status === "miss") misses += 1;
        // Drain body so the connection can be reused.
        await res.arrayBuffer();
      } catch {
        errs += 1;
      }
    }),
  );
  log.info("cache warmer cycle", {
    elapsedMs: Date.now() - started,
    hits,
    stales,
    misses,
    errs,
    total: WARM_PATHS.length,
  });
}

/** Schedule the warmer. Returns a function that stops the timer.
 *
 *  We start with a 5-second delay so the API has time to finish booting
 *  (DB hydration, RTDS handshake) before we hit it. After that the
 *  cadence is `intervalMs` (30s by default). The first cycle's misses
 *  are expected — they prime the cache. Steady-state should be all
 *  hits/stales. */
export function startCacheWarmer(opts: {
  port: number;
  host?: string;
  intervalMs?: number;
  initialDelayMs?: number;
}): () => void {
  // 127.0.0.1 always works regardless of bind host (0.0.0.0 binds all).
  const baseUrl = `http://127.0.0.1:${opts.port}`;
  const intervalMs = opts.intervalMs ?? 30_000;
  const initialDelayMs = opts.initialDelayMs ?? 5_000;

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = (): void => {
    if (stopped) return;
    void warmOnce(baseUrl).catch((err) => {
      log.warn("cache warmer cycle threw", { err: (err as Error).message });
    });
    timer = setTimeout(tick, intervalMs);
    timer.unref?.();
  };

  timer = setTimeout(tick, initialDelayMs);
  timer.unref?.();
  log.info("cache warmer scheduled", {
    baseUrl,
    intervalMs,
    paths: WARM_PATHS.length,
  });

  return (): void => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

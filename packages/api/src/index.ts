import { createApi } from "./api";
import { createDb, createSignalBuffer } from "./db";
import { createScopeThresholds } from "./scope-thresholds";
import { loadEnv } from "./env";
import { createGammaCache } from "./gamma-cache";
import { createMarketHistoryFetcher } from "./market-history";
import { createIngestor } from "./ingestor";
import { log } from "./log";
import { createPositionTracker } from "./position-tracker";
import { createResolutionWatcher } from "./resolution-watcher";
import { createSignalHub } from "./signal-hub";
import { loadWhaleCorpus } from "./whale-corpus";
import { loadWhaleAliases, setWhaleAliases } from "./whale-display";

async function main(): Promise<void> {
  const env = loadEnv();
  log.info("boot", {
    rtdsUrl: env.RTDS_WS_URL,
    gammaUrl: env.GAMMA_API_URL,
    corpusPath: env.WHALE_CORPUS_PATH,
    batchIntervalMs: env.SIGNAL_BATCH_INTERVAL_MS,
    port: env.PORT,
    host: env.HOST,
  });

  const whales = await loadWhaleCorpus(env.WHALE_CORPUS_PATH);
  log.info("whale corpus loaded", { count: whales.size });

  // Aliases are best-effort: a missing/malformed file just means the UI
  // shows truncated 0x… everywhere instead of leaderboard usernames.
  try {
    const aliases = await loadWhaleAliases(env.WHALE_ALIASES_PATH);
    setWhaleAliases(aliases);
    log.info("whale aliases loaded", { count: aliases.size });
  } catch (err) {
    log.warn("whale aliases not loaded", {
      path: env.WHALE_ALIASES_PATH,
      err: (err as Error).message,
    });
  }

  const { db, sql } = createDb(env.DATABASE_URL);
  const buffer = createSignalBuffer(db, env.SIGNAL_BATCH_INTERVAL_MS);

  const positions = createPositionTracker({ db });
  await positions.hydrate();

  const gamma = createGammaCache({
    baseUrl: env.GAMMA_API_URL,
    ttlMs: env.GAMMA_CACHE_TTL_MS,
  });

  // Single in-process pub/sub: ingestor publishes once, DB buffer + every SSE client subscribe.
  const hub = createSignalHub();
  hub.subscribe((s) => buffer.push(s));

  const ingestor = createIngestor({
    url: env.RTDS_WS_URL,
    whales,
    gamma,
    positions,
    onSignal: (s) => hub.broadcast(s),
    pingIntervalMs: env.WS_PING_INTERVAL_MS,
    dataSilenceThresholdMs: env.WS_DATA_SILENCE_THRESHOLD_MS,
    fatalSilenceThresholdMs: env.WS_FATAL_SILENCE_THRESHOLD_MS,
  });

  const resolutionWatcher = createResolutionWatcher({
    db,
    baseUrl: env.GAMMA_API_URL,
    pollIntervalMs: env.RESOLUTION_POLL_INTERVAL_MS,
    positions,
    hub,
  });

  const fetchMarketHistory = createMarketHistoryFetcher({
    sql,
    gammaCache: gamma,
  });

  // Loads P95 / P99 USD thresholds per (category, subcat, conditionId) scope
  // from the signal_thresholds materialised view. Reloads in-memory map every
  // hour to pick up the cron's REFRESH MATERIALIZED VIEW. SSE pipeline reads
  // it to tag signals with magnitude="huge"|"big"|null for the frontend
  // animation layer.
  const scopeThresholds = await createScopeThresholds(sql);

  const api = createApi({
    sql,
    hub,
    ingestor,
    bufferSize: () => buffer.size(),
    gammaCacheSize: () => gamma.size(),
    whaleCount: () => whales.size,
    fetchMarketHistory,
    scopeThresholds,
  });

  // Periodic stats line so logs show liveness even when no whale matches happen.
  const statsTimer = setInterval(() => {
    log.info("stats", {
      ...ingestor.stats(),
      bufferSize: buffer.size(),
      gammaCacheSize: gamma.size(),
      sseSubscribers: hub.size(),
      openPositions: positions.size(),
    });
  }, 60_000);
  statsTimer.unref?.();

  ingestor.start();
  resolutionWatcher.start();
  const server = api.listen({ port: env.PORT, hostname: env.HOST });
  log.info("api listening", { port: env.PORT, host: env.HOST });

  const shutdown = async (signal: string): Promise<void> => {
    log.info("shutdown", { signal });
    clearInterval(statsTimer);
    // Order: stop accepting new HTTP first, then stop signal sources (ingestor
    // + resolution watcher), then drain the DB buffer + position state, then
    // close pg pool.
    server.stop?.();
    await ingestor.stop();
    await resolutionWatcher.stop();
    await buffer.stop();
    await positions.stop();
    await sql.end({ timeout: 5 });
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  log.error("fatal boot error", { err: (err as Error).message, stack: (err as Error).stack });
  process.exit(1);
});

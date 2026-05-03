import { createDb, createSignalBuffer } from "./db";
import { loadEnv } from "./env";
import { createGammaCache } from "./gamma-cache";
import { createIngestor } from "./ingestor";
import { log } from "./log";
import { loadWhaleCorpus } from "./whale-corpus";

async function main(): Promise<void> {
  const env = loadEnv();
  log.info("boot", {
    rtdsUrl: env.RTDS_WS_URL,
    gammaUrl: env.GAMMA_API_URL,
    corpusPath: env.WHALE_CORPUS_PATH,
    batchIntervalMs: env.SIGNAL_BATCH_INTERVAL_MS,
  });

  const whales = await loadWhaleCorpus(env.WHALE_CORPUS_PATH);
  log.info("whale corpus loaded", { count: whales.size });

  const { db, sql } = createDb(env.DATABASE_URL);
  const buffer = createSignalBuffer(db, env.SIGNAL_BATCH_INTERVAL_MS);

  const gamma = createGammaCache({
    baseUrl: env.GAMMA_API_URL,
    ttlMs: env.GAMMA_CACHE_TTL_MS,
  });

  const ingestor = createIngestor({
    url: env.RTDS_WS_URL,
    whales,
    gamma,
    onSignal: (s) => buffer.push(s),
    pingIntervalMs: env.WS_PING_INTERVAL_MS,
    dataSilenceThresholdMs: env.WS_DATA_SILENCE_THRESHOLD_MS,
  });

  // Periodic stats line so logs show liveness even when no whale matches happen.
  const statsTimer = setInterval(() => {
    log.info("stats", { ...ingestor.stats(), bufferSize: buffer.size(), gammaCacheSize: gamma.size() });
  }, 60_000);
  statsTimer.unref?.();

  ingestor.start();

  const shutdown = async (signal: string): Promise<void> => {
    log.info("shutdown", { signal });
    clearInterval(statsTimer);
    await ingestor.stop();
    await buffer.stop();
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

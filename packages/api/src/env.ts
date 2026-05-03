export type Env = {
  DATABASE_URL: string;
  RTDS_WS_URL: string;
  GAMMA_API_URL: string;
  WS_PING_INTERVAL_MS: number;
  WS_PING_JITTER_MAX_MS: number;
  WS_HEARTBEAT_THRESHOLD_MS: number;
  WS_DATA_SILENCE_THRESHOLD_MS: number;
  WS_DEAD_BOOK_BID_THRESHOLD: number;
  GAMMA_CACHE_TTL_MS: number;
  WHALE_CORPUS_PATH: string;
  WHALE_ALIASES_PATH: string;
  PORT: number;
  HOST: string;
  SIGNAL_BATCH_INTERVAL_MS: number;
  RESOLUTION_POLL_INTERVAL_MS: number;
};

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) throw new Error(`env ${name} is required`);
  return v;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`env ${name} must be a finite number, got ${raw}`);
  return n;
}

function str(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export function loadEnv(): Env {
  return {
    DATABASE_URL: required("DATABASE_URL"),
    RTDS_WS_URL: str("RTDS_WS_URL", "wss://ws-live-data.polymarket.com"),
    GAMMA_API_URL: str("GAMMA_API_URL", "https://gamma-api.polymarket.com"),
    WS_PING_INTERVAL_MS: num("WS_PING_INTERVAL_MS", 20_000),
    WS_PING_JITTER_MAX_MS: num("WS_PING_JITTER_MAX_MS", 5_000),
    WS_HEARTBEAT_THRESHOLD_MS: num("WS_HEARTBEAT_THRESHOLD_MS", 30_000),
    WS_DATA_SILENCE_THRESHOLD_MS: num("WS_DATA_SILENCE_THRESHOLD_MS", 45_000),
    WS_DEAD_BOOK_BID_THRESHOLD: num("WS_DEAD_BOOK_BID_THRESHOLD", 0.02),
    GAMMA_CACHE_TTL_MS: num("GAMMA_CACHE_TTL_MS", 30_000),
    WHALE_CORPUS_PATH: str("WHALE_CORPUS_PATH", "data/whale_corpus.json"),
    WHALE_ALIASES_PATH: str("WHALE_ALIASES_PATH", "data/whale_aliases.json"),
    PORT: num("PORT", 3001),
    HOST: str("HOST", "0.0.0.0"),
    SIGNAL_BATCH_INTERVAL_MS: num("SIGNAL_BATCH_INTERVAL_MS", 5_000),
    RESOLUTION_POLL_INTERVAL_MS: num("RESOLUTION_POLL_INTERVAL_MS", 5 * 60_000),
  };
}

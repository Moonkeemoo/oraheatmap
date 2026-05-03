type Level = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const minLevel: Level = (process.env.LOG_LEVEL as Level) ?? "info";
const minRank = LEVEL_RANK[minLevel] ?? LEVEL_RANK.info;

function emit(level: Level, msg: string, fields?: Record<string, unknown>): void {
  if (LEVEL_RANK[level] < minRank) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...fields,
  };
  const out = level === "error" || level === "warn" ? process.stderr : process.stdout;
  out.write(JSON.stringify(line) + "\n");
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
};

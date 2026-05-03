// Mirror of backend api.ts /api/heatmap response. Keep in lockstep with
// packages/api/src/heatmap-query.ts:HeatmapResponse.

export type Category =
  | "Sports"
  | "Politics"
  | "Crypto"
  | "Finance"
  | "Tech"
  | "World"
  | "Culture"
  | "Climate"
  | "Other";

export type HeatmapRange = "1h" | "24h" | "12d" | "12w";
export type HeatmapMetric = "signals" | "volume" | "pnl" | "winrate";

export type MarketSummary = {
  conditionId: string;
  marketQuestion: string | null;
  count: number;
  volume: number;
  pnl: number;
  winRate: number | null;
};

export type HeatmapCell = {
  count: number;
  volume: number;
  pnl: number;
  winRate: number | null;
  uniqueWhales: number;
  /** Top-N markets in this cell, server-sorted by signal count. UI re-sorts
   *  client-side by the active metric and shows top-5. Empty for ranges
   *  whose source is not raw (24h/12d/12w). */
  markets: MarketSummary[];
};

export type HeatmapTotals = {
  signals: number;
  volume: number;
  pnl: number;
  winRate: number | null;
  uniqueWhales: number;
  activeWhales: number;
  topCategory: Category | null;
  topWhale: { addr: string; alias: string; color: string } | null;
};

export type HeatmapResponse = {
  generatedAt: string;
  range: HeatmapRange;
  windowStart: string;
  windowEnd: string;
  windowMinutes: number;
  bucketMinutes: number;
  /** Total whales currently in the watchlist (size of the loaded corpus Set). */
  trackedWhales: number;
  categories: ReadonlyArray<Category>;
  buckets: ReadonlyArray<{ ts: string; index: number }>;
  cells: Record<Category, ReadonlyArray<HeatmapCell>>;
  totals: HeatmapTotals;
  metric: HeatmapMetric;
};

// SSE wire shape mirrors api.ts:signalToWire().
export type SignalEvent = {
  ts: string;
  whaleAddr: string;
  whaleAlias: string;
  whaleColor: string;
  assetId: string;
  conditionId: string | null;
  marketQuestion: string | null;
  category: Category | string;
  side: "BUY" | "SELL" | "SETTLEMENT";
  price: number;
  size: number;
  sizeUsd: number;
  realizedPnl: number | null;
  exitKind: "SELL" | "RESOLUTION" | null;
  txHash: string | null;
};

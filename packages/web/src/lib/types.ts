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

export type HeatmapRange = "1h" | "24h" | "7d" | "30d";
export type HeatmapMetric = "signals" | "volume" | "pnl" | "winrate";

export type TradeSummary = {
  whaleAddr: string;
  whaleAlias: string;
  whaleColor: string;
  side: "BUY" | "SELL" | "SETTLEMENT";
  sizeUsd: number;
  realizedPnl: number | null;
  marketQuestion: string | null;
};

export type HeatmapCell = {
  count: number;
  volume: number;
  pnl: number;
  winRate: number | null;
  uniqueWhales: number;
  trades: TradeSummary[];
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

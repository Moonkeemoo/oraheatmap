// Mirror of backend api.ts /api/heatmap response.

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

export type Mode = "live" | "pattern";

export type LiveRange = "1h" | "24h" | "12d" | "12w";
export type PatternKind = "hour-of-day" | "day-of-week";
/** What the UI uses internally as the "active range" — either a live range or
 *  one of the two pattern kinds. */
export type HeatmapRange = LiveRange | PatternKind;

export type HeatmapMetric = "signals" | "volume" | "pnl" | "winrate";

export type MarketSummary = {
  conditionId: string;
  marketQuestion: string | null;
  /** Polymarket event slug — frontend builds the public URL from this.
   *  NULL for legacy rows that predate slug capture. */
  marketSlug: string | null;
  count: number;
  volume: number;
  pnl: number;
  winRate: number | null;
};

/** Cell shape unified across LIVE and PATTERN. PATTERN cells additionally
 *  carry `delta`, `sampleCount`, `min`, `max`. LIVE cells additionally
 *  carry `markets`. */
export type HeatmapCell = {
  count: number;
  volume: number;
  pnl: number;
  winRate: number | null;
  uniqueWhales: number;
  markets: MarketSummary[];
  delta?: { count: number; volume: number; pnl: number; winRate: number | null };
  sampleCount?: number;
  min?: { count: number; volume: number; pnl: number };
  max?: { count: number; volume: number; pnl: number };
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

export type HeatmapBucket = {
  /** Wall-clock ts in LIVE mode; absent in PATTERN mode (use `label`). */
  ts?: string;
  /** Display label — HH:MM / DD/MM in LIVE; "00:00".."23:00" or "Mon".."Sun" in PATTERN. */
  label?: string;
  index: number;
};

export type HeatmapResponse = {
  mode: Mode;
  generatedAt: string;
  // Live-only:
  range?: LiveRange;
  windowStart?: string;
  windowEnd?: string;
  windowMinutes?: number;
  bucketMinutes?: number;
  // Pattern-only:
  patternKind?: PatternKind;
  lookbackDays?: number;
  // Drill-down (LIVE only): non-null when the response is a per-subcategory
  // grid for the named Category. `categories` holds subcategory slugs;
  // `subcategoryLabels` maps slug → display label. Both `null` at top level.
  drillCategory: Category | null;
  subcategoryLabels: Record<string, string> | null;
  /** Top-N whales by BUY USD volume in the current window. NULL in PATTERN
   *  mode. In drill mode, restricted to the chosen category so the StatsBar
   *  hover popover matches what the user sees on the grid. */
  topWhales: ReadonlyArray<{
    addr: string;
    alias: string;
    color: string;
    signals: number;
    volume: number;
    pnl: number;
  }> | null;
  // Common:
  trackedWhales: number;
  /** Row keys: top-level Category names OR subcategory slugs in drill mode. */
  categories: ReadonlyArray<string>;
  buckets: ReadonlyArray<HeatmapBucket>;
  cells: Record<string, ReadonlyArray<HeatmapCell>>;
  totals: HeatmapTotals | null;
  metric: HeatmapMetric;
  dataSpan: { earliestTs: string | null; daysOfData: number };
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
  subcategory: string | null;
  marketSlug: string | null;
  side: "BUY" | "SELL" | "SETTLEMENT";
  price: number;
  size: number;
  sizeUsd: number;
  realizedPnl: number | null;
  exitKind: "SELL" | "RESOLUTION" | null;
  txHash: string | null;
};

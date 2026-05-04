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

export type HeatmapMetric = "signals" | "volume" | "pnl" | "winrate" | "whales";

export type MarketSummary = {
  conditionId: string;
  marketQuestion: string | null;
  /** Polymarket event slug — frontend builds the public URL from this.
   *  NULL for legacy rows that predate slug capture. */
  marketSlug: string | null;
  /** Polymarket-hosted thumbnail (~80×80). NULL on legacy rows. */
  marketIcon: string | null;
  count: number;
  volume: number;
  pnl: number;
  winRate: number | null;
  /** Unique top-corpus whales who traded this market in this bucket. */
  uniqueWhales: number;
};

/** Cell shape unified across LIVE and PATTERN. PATTERN cells additionally
 *  carry `delta`, `sampleCount`, `min`, `max`. LIVE cells additionally
 *  carry `markets` + `topWhales`. */
export type HeatmapCell = {
  count: number;
  volume: number;
  pnl: number;
  winRate: number | null;
  uniqueWhales: number;
  markets: MarketSummary[];
  /** Top whales (by USD volume desc) who traded in this cell. Empty in
   *  PATTERN mode and on heavy ranges (12d/12w at top level). */
  topWhales: WhaleCellSummary[];
  delta?: { count: number; volume: number; pnl: number; winRate: number | null; uniqueWhales?: number };
  /** Full-window AVG across both halves of the lookback (PATTERN only).
   *  Null-tolerant — falls back to whichever half has data. */
  full?: { count: number; volume: number; pnl: number; winRate: number | null; uniqueWhales?: number };
  sampleCount?: number;
  min?: { count: number; volume: number; pnl: number };
  max?: { count: number; volume: number; pnl: number };
};

export type WhaleCellSummary = {
  addr: string;
  alias: string;
  color: string;
  /** Polymarket-hosted avatar URL when the whale set one. NULL otherwise —
   *  UI falls back to the deterministic colored dot in `color`. */
  profileImage: string | null;
  signals: number;
  volume: number;
  pnl: number;
  /** wins / (wins+losses) for trades that closed in this cell. NULL when
   *  no exits — typical for live markets. */
  winRate: number | null;
  /** Raw wins/losses so the WIN RATE row can show sample size — "5/5
   *  100%" reads honestly, plain "100%" alongside "155× tr" was
   *  misleading because most of those 155 trades were unmatched BUYs. */
  wins: number;
  losses: number;
};

export type HeatmapTotals = {
  signals: number;
  volume: number;
  pnl: number;
  winRate: number | null;
  uniqueWhales: number;
  activeWhales: number;
  topCategory: Category | null;
  topWhale: { addr: string; alias: string; color: string; profileImage: string | null } | null;
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
  /** Non-null at L3 (drilled into a specific subcategory). When set, `categories`
   *  holds condition_ids of individual markets, not subcategory slugs. */
  drillSubcategory: string | null;
  /** Display name for the drilled subcategory (e.g. "NBA"). Carried separately
   *  so the breadcrumb has it even when subcategoryLabels holds market labels. */
  drillSubcategoryLabel: string | null;
  /** Row-key → display label map. At L2 it's slug → display name; at L3 it's
   *  conditionId → marketQuestion. NULL at L1. */
  subcategoryLabels: Record<string, string> | null;
  /** L3 only: conditionId → Polymarket event slug for building the public URL
   *  on the row label. NULL at L1/L2; individual entries may also be null
   *  when the slug wasn't captured at ingest time. */
  marketSlugs: Record<string, string | null> | null;
  marketIcons: Record<string, string | null> | null;
  /** Full original market questions at L3 — tooltip header uses these
   *  rather than the shortened row labels. NULL at L1/L2. */
  marketQuestions: Record<string, string | null> | null;
  /** L3 only: subset of row keys whose markets have already resolved.
   *  Frontend fades these rows. Empty at L1/L2. */
  resolvedRows: ReadonlyArray<string>;
  /** Top-N whales by BUY USD volume in the current window. NULL in PATTERN
   *  mode. In drill mode, restricted to the chosen category so the StatsBar
   *  hover popover matches what the user sees on the grid. */
  topWhales: ReadonlyArray<{
    addr: string;
    alias: string;
    color: string;
    profileImage: string | null;
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

// ─── /api/whale — whale profile drawer ──────────────────────────────────────

export type WhaleProfile = {
  addr: string;
  alias: string;
  xHandle: string | null;
  verified: boolean;
  profileImage: string | null;
  color: string;
  range: LiveRange;
  windowMinutes: number;
  stats: {
    signals: number;
    volume: number;
    pnl: number;
    winRate: number | null;
  };
  categoryMix: ReadonlyArray<{ category: string; volume: number; signals: number }>;
  openPositions: ReadonlyArray<{
    assetId: string;
    conditionId: string | null;
    marketQuestion: string | null;
    marketSlug: string | null;
    netShares: number;
    avgEntry: number;
    totalCost: number;
    openedAt: string;
    lastModifiedAt: string;
  }>;
  recentTrades: ReadonlyArray<{
    ts: string;
    side: "BUY" | "SELL" | "SETTLEMENT";
    category: string;
    subcategory: string | null;
    conditionId: string | null;
    marketQuestion: string | null;
    marketSlug: string | null;
    size: number;
    price: number;
    sizeUsd: number;
    realizedPnl: number | null;
    exitKind: "SELL" | "RESOLUTION" | null;
  }>;
  pnlHistory: ReadonlyArray<{ day: string; cumulativePnl: number }>;
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
  /** Server-tagged magnitude relative to the trade's scope distribution.
   *  "huge" = top 1% in (category, subcategory, conditionId) scope (P99+),
   *  "big"  = top 5% (P95–P99), null = ordinary or non-BUY. Drives the
   *  /app live animation layer (callout pop, convergence badge). */
  magnitude: "huge" | "big" | null;
};

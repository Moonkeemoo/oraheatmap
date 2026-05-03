/**
 * Raw RTDS trade payload. Polymarket's wire shape is loose — every field may be
 * absent or differently-named depending on the producer. The ingestor probes
 * multiple aliases (see `pickWallet` / `pickAssetId` / `pickConditionId`) so a
 * single rename upstream doesn't silently drop signals.
 */
export type RtdsTradePayload = {
  // Wallet aliases (proxyWallet is what arrives most often in production)
  proxyWallet?: string;
  proxy_wallet?: string;
  user?: string;
  maker?: string;
  taker?: string;
  address?: string;

  // Asset / market aliases (SIG-2)
  asset?: string;
  asset_id?: string;
  token_id?: string;
  market?: string;

  // Condition (market id)
  conditionId?: string;
  condition_id?: string;

  // Trade body
  size?: number | string;
  amount?: number | string;
  shares?: number | string;
  price?: number | string;
  executionPrice?: number | string;
  side?: string;
  action?: string;

  // Timestamp aliases
  timestamp?: number | string;
  ts?: number | string;

  // Tx hash aliases
  transactionHash?: string;
  transaction_hash?: string;
  txHash?: string;

  // Title / slug
  slug?: string;
  marketSlug?: string;
  title?: string;
  outcome?: string;
  outcomeName?: string;
};

/** Subset of Gamma /markets response we actually consume. */
export type GammaMarket = {
  question: string;
  category: string;
  /** Full Polymarket tags (slugs incl. canonical sub-tags like 'nba', 'bitcoin', 'trump'). */
  tags: Array<{ id?: string; label?: string; slug?: string }>;
  endDate: string | null;
  active: boolean;
  outcomes: string[];
  outcomePrices: number[];
  /** Polymarket event slug — used to build the public market URL. NULL when
   *  Gamma's response doesn't include one (legacy / unusual markets). */
  slug: string | null;
};

/** Row inserted into the `signals` hypertable. */
export type Signal = {
  ts: Date;
  whaleAddr: string;
  assetId: string;
  conditionId: string | null;
  marketQuestion: string | null;
  category: string;
  /** BUY/SELL come from RTDS; SETTLEMENT is synthesised by the resolution watcher. */
  side: "BUY" | "SELL" | "SETTLEMENT";
  price: number;
  size: number;
  txHash: string | null;
  /** USD PnL realised on this row. NULL for entries (BUY) and unmatched exits. */
  realizedPnl: number | null;
  /** NULL for entries; "SELL" for sell-back exits; "RESOLUTION" for settlements. */
  exitKind: "SELL" | "RESOLUTION" | null;
  /** Most-specific known sub-tag slug (e.g. 'nba', 'bitcoin', 'north-america'). NULL when nothing matched. */
  subcategory: string | null;
  /** Polymarket market/event slug — frontend builds the link from this.
   *  NULL when Gamma omitted it or for old rows from before this column existed. */
  marketSlug: string | null;
};

/** Discriminated union for ingestor lifecycle (used by /api/health later). */
export type IngestorStatus =
  | { kind: "connecting" }
  | { kind: "open"; openedAt: number }
  | { kind: "disconnected"; lastSeenAt: number };

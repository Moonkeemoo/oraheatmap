/**
 * Raw event from RTDS firehose. Polymarket's payload is loose; treat every field
 * as optional and validate per-handler. `asset_id` may be missing — fall back to
 * `market` (SIG-2 in CLAUDE.md).
 */
export type RtdsTradeEvent = {
  asset_id?: string;
  market?: string;
  condition_id?: string;
  size?: number | string;
  price?: number | string;
  side?: "BUY" | "SELL" | string;
  user?: string;
  timestamp?: number | string;
  transaction_hash?: string;
  title?: string;
};

/** Subset of Gamma /markets response we actually consume. */
export type GammaMarket = {
  question: string;
  category: string;
  endDate: string | null;
  active: boolean;
  outcomes: string[];
  outcomePrices: number[];
};

/** Row inserted into the `signals` hypertable. */
export type Signal = {
  ts: Date;
  whaleAddr: string;
  assetId: string;
  conditionId: string | null;
  marketQuestion: string | null;
  category: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  txHash: string | null;
};

/** Discriminated union for ingestor lifecycle status (used by API health probe later). */
export type IngestorStatus =
  | { kind: "connecting" }
  | { kind: "open"; openedAt: number }
  | { kind: "reconnecting"; attempt: number; nextDelayMs: number }
  | { kind: "closed"; reason: string };

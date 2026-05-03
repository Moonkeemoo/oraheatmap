# Whale Signal Heatmap — MVP Plan

> Перший прототип. Мінімум коду, максимум результату.
> Базується на handoff з `Moonkeemoo/oralab` (commit d6ea7b9).

---

## Що будуємо (scope MVP)

```
RTDS firehose ──▸ match 1505 whale wallets ──▸ enrich via Gamma ──▸ PostgreSQL ──▸ Heatmap UI
   (no auth)         (in-memory Set)           (category/question)    (TimescaleDB)    (1h window, 5min slots)
```

**Один екран.** Хітмапа як вкладка "Sports" в калібраторі OraLab:
- Рядки = категорії (Sports, Crypto, Politics, Culture, Science, Finance, Weather)
- Колонки = 12 слотів по 5 хвилин (остання година)
- Ячейка = PnL ($) або Win Rate (%) — перемикач
- Колір ячейки = зелений/червоний по значенню
- Дані оновлюються кожні 30 секунд
- Stats bar знизу: total signals, total PnL, win rate, top whale

**Що НЕ в MVP:** drill-down, mobile, trade modal, інші часові масштаби, whale profiles.

---

## Архітектура MVP

```
┌─────────────────────────────────────────────────┐
│                 Hetzner VPS                     │
│                                                 │
│  ┌────────────┐   ┌──────────────────────────┐  │
│  │  Ingestor  │──▸│  PostgreSQL + TimescaleDB │  │
│  │  (Bun)     │   └──────────┬───────────────┘  │
│  └────────────┘              │                  │
│                              │                  │
│  ┌────────────┐              │                  │
│  │  API + SSE │◂─────────────┘                  │
│  │  (Bun)     │                                 │
│  └─────┬──────┘                                 │
│        │                                        │
│  ┌─────┴──────┐                                 │
│  │  Static UI │  (single HTML + JS, served by   │
│  │  (Caddy)   │   Caddy, fetches from API)      │
│  └────────────┘                                 │
└─────────────────────────────────────────────────┘
```

**Спрощення для MVP:**
- UI = один статичний HTML файл (як прототип що вже є), не Next.js
- Realtime = Server-Sent Events (SSE), не WebSocket (простіше на клієнті)
- API = 2 ендпоінти, не 10
- Один Bun процес для ingestor + API (розділимо пізніше)

---

## Компоненти

### 1. Whale Corpus Loader

**Джерело:** `output/wallet_profiles.json` з v1 archive (`Moonkeemoo/ora-et-labora`)

```typescript
// whale-corpus.ts
interface WhaleProfile {
  address: string;           // lowercase
  classification: string;    // INFORMED | SNIPER | MARKET_MAKER | NOISE | ...
  confidence: number;        // 0..1 — canonical trust signal
  sm_score: number;
  trust_score: number;
}

// При старті: завантажити 1505 wallets в Map<string, WhaleProfile>
// Фільтр MVP: тільки INFORMED (11) + SNIPER (19) + MARKET_MAKER (11) = 41 wallet
// NOISE (1463) ігноруємо — вони шумлять, не сигналять
```

**Рішення для MVP:** Тягнемо тільки 41 non-NOISE кит. Це зменшує шум до мінімуму і дає чисту хітмапу.

### 2. RTDS Ingestor

**Endpoint:** `wss://ws-live-data.polymarket.com`
**Subscribe:** `{ "type": "trades" }`
**Ping:** порожній рядок кожні 20с + jitter 0-5с

```typescript
// ingestor.ts — псевдокод
import { WhaleCorpus } from './whale-corpus';
import { db } from './db';
import { enrichMarket } from './gamma-cache';

const ws = new WebSocket('wss://ws-live-data.polymarket.com');

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'trades' }));
  startPingLoop(20_000, 5_000);
  startHeartbeatWatchdogs(); // dual: HEARTBEAT_TRACKER + DATA_TRACKER
};

ws.onmessage = async (raw) => {
  heartbeatTracker.bump();
  
  const trade = JSON.parse(raw.data);
  if (!trade.user) return;
  
  dataTracker.bump(); // real data event
  
  // Match against whale corpus
  const whale = WhaleCorpus.get(trade.user.toLowerCase());
  if (!whale) return; // not a whale — drop
  
  // Enrich with market metadata (cached 30s)
  const market = await enrichMarket(trade.asset_id);
  
  // Determine PnL (simplified for MVP):
  // We don't know outcome yet, so track entry only
  // PnL = 0 until market resolves
  // For MVP: use implied PnL from price movement (mark-to-market)
  
  const signal = {
    ts: new Date(trade.timestamp * 1000),
    whale_addr: trade.user.toLowerCase(),
    whale_class: whale.classification,
    whale_confidence: whale.confidence,
    asset_id: trade.asset_id,
    condition_id: trade.condition_id,
    market_question: market?.question ?? trade.title ?? 'Unknown',
    category: market?.category ?? categorizeFromTitle(trade.title),
    side: trade.side,     // BUY | SELL
    price: trade.price,
    size: trade.size,     // USD
  };
  
  await db.insertSignal(signal);
  sseClients.broadcast(signal); // push to UI
};
```

**Watchdogs (з handoff):**
```
HEARTBEAT_TRACKER — будь-який frame → threshold 30s → reconnect
DATA_TRACKER      — тільки real trade events → threshold 45s → reconnect (zombie detection)
```

### 3. Gamma Cache (market enrichment)

```typescript
// gamma-cache.ts
const cache = new Map<string, { data: GammaMarket; ts: number }>();
const TTL = 30_000; // 30s як в handoff

async function enrichMarket(assetId: string): Promise<GammaMarket | null> {
  const cached = cache.get(assetId);
  if (cached && Date.now() - cached.ts < TTL) return cached.data;
  
  const res = await fetch(
    `https://gamma-api.polymarket.com/markets?clob_token_ids=${assetId}`
  );
  const markets = await res.json();
  if (!markets.length) return null;
  
  const m = markets[0];
  const data = {
    question: m.question,
    category: extractCategory(m.tags), // tags[].label → category
    endDate: m.endDate,
    active: m.active && m.acceptingOrders && !m.closed,
    gameId: m.gameId,
    negRisk: m.negRisk,
    // outcomes/outcomePrices are JSON-strings!
    outcomes: JSON.parse(m.outcomes || '[]'),
    outcomePrices: JSON.parse(m.outcomePrices || '[]'),
  };
  
  cache.set(assetId, { data, ts: Date.now() });
  return data;
}
```

**Категоризація з tags (Gamma API):**
```typescript
function extractCategory(tags: Array<{label: string}>): string {
  if (!tags?.length) return 'Other';
  const label = tags[0].label.toLowerCase();
  if (label.includes('sport') || label.includes('mlb') || label.includes('nba'))  return 'Sports';
  if (label.includes('politic') || label.includes('election'))                    return 'Politics';
  if (label.includes('crypto') || label.includes('bitcoin') || label.includes('eth')) return 'Crypto';
  if (label.includes('science') || label.includes('tech') || label.includes('ai'))    return 'Science';
  if (label.includes('finance') || label.includes('econ'))                        return 'Finance';
  if (label.includes('culture') || label.includes('entertainment'))               return 'Culture';
  return 'Other';
}
```

### 4. Database (PostgreSQL + TimescaleDB)

```sql
-- Мінімальна схема для MVP

CREATE TABLE signals (
  id          BIGSERIAL,
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  whale_addr  TEXT NOT NULL,
  whale_class TEXT NOT NULL,           -- INFORMED | SNIPER | MARKET_MAKER
  confidence  REAL NOT NULL,           -- 0..1
  asset_id    TEXT NOT NULL,
  market_question TEXT,
  category    TEXT NOT NULL DEFAULT 'Other',
  side        TEXT NOT NULL,            -- BUY | SELL
  price       REAL NOT NULL,
  size        REAL NOT NULL             -- USD
);

SELECT create_hypertable('signals', 'ts');

-- Індекс для хітмапи (category + time)
CREATE INDEX idx_signals_cat_ts ON signals (category, ts DESC);

-- Continuous aggregate: 5-minute buckets for 1h view
CREATE MATERIALIZED VIEW signals_5min
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('5 minutes', ts) AS bucket,
  category,
  COUNT(*) AS signal_count,
  SUM(size) AS total_volume,
  AVG(size) AS avg_size,
  -- Simplified "PnL" for MVP: BUY at price P means implied value = size/price
  -- If price > 0.5, buyer expects YES. Track net direction.
  SUM(CASE WHEN side = 'BUY' AND price > 0.5 THEN size
           WHEN side = 'SELL' AND price < 0.5 THEN size
           ELSE -size END) AS directional_pnl
FROM signals
GROUP BY bucket, category
WITH NO DATA;

SELECT add_continuous_aggregate_policy('signals_5min',
  start_offset => INTERVAL '2 hours',
  end_offset   => INTERVAL '30 seconds',
  schedule_interval => INTERVAL '30 seconds');

-- Whale corpus (static, loaded once)
CREATE TABLE whales (
  address     TEXT PRIMARY KEY,
  classification TEXT NOT NULL,
  confidence  REAL NOT NULL,
  sm_score    REAL,
  trust_score REAL
);
```

### 5. API (2 endpoints)

```typescript
// api.ts — Elysia

GET /api/heatmap?metric=pnl
// Returns: { rows: [...categories], cols: [...12 five-min slots], cells: { [cat]: { [slot]: { count, volume, pnl, winrate } } } }
// Query: SELECT from signals_5min WHERE bucket >= NOW() - INTERVAL '1 hour'

GET /api/stream  (SSE)
// Server-Sent Events: кожен новий сигнал від кита пушиться в реальному часі
// event: signal
// data: { whale_class, category, market_question, side, size, price, ts }
```

### 6. UI (статичний HTML)

Базово = те що ми вже побудували в `polymarket-heatmap-v2.html`, але:
- Замість mock даних → fetch з `/api/heatmap` кожні 30 секунд
- Замість setInterval → SSE для real-time cell flash
- Тільки 1 часовий масштаб: 1 година (12 слотів по 5хв)
- Тільки 2 метрики: PnL ($) і Signal Count
- Без drill-down (MVP)

---

## Структура проекту

```
whale-heatmap/
├── src/
│   ├── index.ts              — main: start ingestor + API
│   ├── ingestor.ts           — RTDS WS → match → enrich → DB
│   ├── whale-corpus.ts       — load 41 non-NOISE whales from JSON
│   ├── gamma-cache.ts        — market metadata с TTL cache
│   ├── db.ts                 — Drizzle + PostgreSQL connection
│   ├── schema.ts             — Drizzle schema (signals + whales)
│   ├── api.ts                — Elysia: /api/heatmap + /api/stream (SSE)
│   └── categorize.ts         — tag → category mapping
├── public/
│   └── index.html            — heatmap UI (static, fetches API)
├── data/
│   └── whale_corpus.json     — 41 classified wallets (from v1)
├── db/
│   └── migrate.sql           — TimescaleDB schema
├── docker-compose.yml
├── Dockerfile
├── Caddyfile
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Етапи побудови

### Day 1: Skeleton + DB + Ingestor
1. `bun init`, встановити залежності (elysia, drizzle-orm, ws, pg)
2. PostgreSQL + TimescaleDB через Docker
3. Schema + міграція
4. Whale corpus loader (завантажити 41 wallet з JSON)
5. RTDS WebSocket: connect → subscribe → parse → match → log to console
6. Перевірити що сигнали від китів приходять

### Day 2: Enrichment + Storage + API
1. Gamma cache: збагачувати кожен сигнал категорією + питанням
2. Batch insert в PostgreSQL (кожні 5 секунд)
3. Continuous aggregate `signals_5min`
4. API endpoint `/api/heatmap` — агрегація за останню годину
5. Тест: curl `/api/heatmap` повертає реальні дані

### Day 3: UI + SSE + Deploy
1. Адаптувати існуючий HTML прототип під реальний API
2. SSE endpoint `/api/stream` для live updates
3. Cell flash animation при новому сигналі
4. Docker Compose (db + app + caddy)
5. Deploy на Hetzner
6. Перевірити: відкрити в браузері → бачити реальні whale signals

---

## Залежності (package.json)

```json
{
  "dependencies": {
    "elysia": "^1.2",
    "drizzle-orm": "^0.36",
    "postgres": "^3.4",
    "ws": "^8.18"
  },
  "devDependencies": {
    "@types/ws": "^8",
    "drizzle-kit": "^0.30",
    "typescript": "^5.5"
  }
}
```

Bun runtime — `ws` пакет для RTDS (Bun native WS = client only для connect, `ws` дає більше контролю для heartbeats).

---

## Ключові рішення MVP

| Рішення | Чому |
|---------|------|
| Тільки 41 whale (non-NOISE) | NOISE = 1463 wallets, забʼє хітмапу шумом. INFORMED+SNIPER+MM = чистий сигнал |
| RTDS а не chain polling | Sub-second push, no RPC cost (з handoff) |
| SSE а не WS для UI | Простіше імплементувати, auto-reconnect в браузері, достатньо для 1-way push |
| Static HTML а не Next.js | Один файл, zero build step, швидше ітерувати |
| 1 годинне вікно | Достатньо для перевірки концепту, менше даних для агрегації |
| TimescaleDB continuous aggregates | Автоматичні rollups, не треба писати cron |
| Directional PnL (не реальний) | Реальний PnL вимагає трекінгу resolution — це складно. Directional = "якщо whale купив YES при price 0.7, він bullish на $size" |

---

## Що далі після MVP

Якщо MVP працює і дає цікаві патерни:
1. Додати часові масштаби (24h, 7d)
2. Drill-down (category → subcategory → market)
3. Whale profiles (клік на кита → його історія)
4. Real PnL tracking (market resolution)
5. Telegram alerts для великих сигналів
6. Mobile responsive
7. Trade execution через CLOB v2 API

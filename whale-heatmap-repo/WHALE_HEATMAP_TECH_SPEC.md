# Whale Signal Heatmap — Technical Architecture

> Реалтайм дашборд для трекінгу сигналів від топ-гаманців Polymarket.
> Drill-down: Категорії → Підкатегорії → Маркети. Гнучкі часові масштаби. Вхід у позицію з хітмапи.

---

## Архітектура системи

```
┌─────────────────────────────────────────────────────────────┐
│                      HETZNER VPS                            │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │  WS Ingestor │───▸│  PostgreSQL  │◂───│  API Server   │  │
│  │  (Bun worker)│    │ + TimescaleDB│    │  (Bun+Elysia) │  │
│  └──────┬───────┘    └──────────────┘    └───────┬───────┘  │
│         │                                        │          │
│         │  raw signals                   REST + WS          │
│         ▼                                        │          │
│  ┌──────────────┐                                │          │
│  │  Aggregator  │ precomputed rollups            │          │
│  │  (cron 30s)  │───▸ materialized views         │          │
│  └──────────────┘                                │          │
│                                                  │          │
│  ┌──────────────┐                                │          │
│  │    Caddy     │ reverse proxy + auto SSL       │          │
│  │   (HTTPS)    │◂───────────────────────────────┘          │
│  └──────┬───────┘                                           │
└─────────┼───────────────────────────────────────────────────┘
          │
          ▼
   ┌──────────────┐
   │   Browser    │  Next.js (SSR + client WS)
   │  Desktop/Mob │  TanStack Table + D3 heatmap
   └──────────────┘
```

---

## Стек

| Шар | Технологія | Чому |
|-----|-----------|------|
| **Runtime** | **Bun** | Найшвидший JS runtime 2026. Нативний WebSocket client/server. 2-3x швидший за Node для I/O. Сумісний з npm пакетами. |
| **API Framework** | **Elysia** | Найшвидший HTTP фреймворк (>1M req/s в бенчмарках). Type-safe. Нативна WS підтримка. Ідеально під Bun. |
| **Frontend** | **Next.js 15 + React 19** | Найбільша екосистема компонентів. SSR для швидкого першого завантаження. App Router. Server Components для важких даних. |
| **UI Kit** | **Tailwind CSS + shadcn/ui** | Красивий, responsive, zero-runtime CSS. shadcn — copy-paste компоненти, не залежність. |
| **Heatmap render** | **Canvas API (custom)** | DOM-based heatmap гальмує при 500+ ячейок. Canvas рендерить тисячі ячейок за <16ms. Hover/click через hit detection. |
| **Tables** | **TanStack Table v8** | Віртуалізація для 10K+ рядків. Сортування, фільтри, pagination — все built-in. |
| **Realtime** | **Native WebSocket** | Bun WS server → браузер. Pub/sub по каналах (category, subcategory). Reconnect з backoff. |
| **Database** | **PostgreSQL 16 + TimescaleDB** | Time-series extension для сигналів. Continuous aggregates (авто-оновлювані materialized views). Compression для старих даних (10x менше місця). Гіпертаблиці партиціонуються автоматично по часу. |
| **ORM** | **Drizzle ORM** | Type-safe, zero overhead, SQL-like синтаксис. Міграції. Працює з Bun. |
| **Deploy** | **Docker Compose** | Один файл — весь стек. Caddy для auto-SSL. Volumes для PG data. |
| **Reverse Proxy** | **Caddy** | Auto HTTPS (Let's Encrypt), HTTP/2, WebSocket proxy. Zero config. |

---

## Data Pipeline

### 1. WS Ingestor (окремий Bun процес)

```
Polymarket CLOB WS ──▸ parse ──▸ enrich ──▸ batch insert ──▸ PostgreSQL
     (v1/v2 API)         │         │              │
                    validate    categorize     кожні 5 сек
                    schema     + match whale    bulk INSERT
```

**Що робить:**
- Підключається до Polymarket CLOB WebSocket (Gamma API / Validation Cloud)
- Фільтрує тільки транзакції від відслідковуваних гаманців (watchlist з лідерборду)
- Парсить: wallet, market_id, side (YES/NO), price, size, timestamp
- Збагачує: category, subcategory (маппінг market → category зберігається в БД)
- Батчить і вставляє в `signals` гіпертаблицю кожні 5 секунд
- Heartbeat + auto-reconnect при обриві WS

**Watchlist refresh:**
- Кожні 6 годин парсить лідерборд Polymarket (REST API або scrape)
- Оновлює таблицю `whales` (address, rank, alias, total_pnl, win_rate)

### 2. Aggregator (TimescaleDB continuous aggregates)

TimescaleDB автоматично підтримує materialized views які оновлюються при нових даних:

```sql
-- Агрегація по категоріях × годинах (для 24h view)
CREATE MATERIALIZED VIEW signals_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', ts) AS bucket,
  category,
  subcategory,
  market_slug,
  SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS wins,
  COUNT(*) AS total,
  SUM(pnl) AS total_pnl,
  SUM(size) AS total_volume,
  AVG(size) AS avg_size
FROM signals
GROUP BY bucket, category, subcategory, market_slug
WITH NO DATA;

-- Refresh policy: оновлювати кожні 30 секунд
SELECT add_continuous_aggregate_policy('signals_hourly',
  start_offset => INTERVAL '2 days',
  end_offset => INTERVAL '30 seconds',
  schedule_interval => INTERVAL '30 seconds');
```

Аналогічні views для `signals_5min` (1h view) і `signals_daily` (7d/14d view).

### 3. API Server (Elysia)

```
GET  /api/heatmap?timeScale=24h&metric=pnl&level=root
GET  /api/heatmap?timeScale=24h&metric=pnl&level=category&category=Sports
GET  /api/heatmap?timeScale=24h&metric=pnl&level=subcategory&category=Sports&sub=NBA
GET  /api/whales                    — список китів з лідерборду
GET  /api/markets/:slug             — деталі маркету
POST /api/trade                     — записати/виконати трейд

WS   /ws/signals                    — realtime stream нових сигналів
```

**Heatmap endpoint** читає з відповідного continuous aggregate (5min/hourly/daily) і повертає готову матрицю для рендерінгу.

### 4. WebSocket Server → Browser

```
Server WS broadcast:
{
  type: "signal",
  data: {
    whale: "0xD4a9...3fE2",
    category: "Sports",
    subcategory: "NBA",
    market: "Celtics repeat?",
    side: "YES",
    size: 450,
    price: 0.62,
    ts: 1746288000000
  }
}
```

Клієнт отримує і:
1. Оновлює відповідну ячейку хітмапи (flash animation)
2. Оновлює stats bar
3. Показує toast notification для великих сигналів ($500+)

---

## Database Schema

```sql
-- Гіпертаблиця сигналів (partitioned by time)
CREATE TABLE signals (
  id          BIGSERIAL,
  ts          TIMESTAMPTZ NOT NULL,
  whale_addr  TEXT NOT NULL,
  market_slug TEXT NOT NULL,
  category    TEXT NOT NULL,
  subcategory TEXT NOT NULL,
  side        TEXT NOT NULL,           -- 'YES' | 'NO'
  price       DECIMAL(10,4) NOT NULL,
  size        DECIMAL(12,2) NOT NULL,  -- in USD
  pnl         DECIMAL(12,2),           -- NULL until resolved
  won         BOOLEAN,                 -- NULL until resolved
  raw_data    JSONB                    -- original WS payload
);
SELECT create_hypertable('signals', 'ts');

-- Compression для даних старше 7 днів (10x менше місця)
ALTER TABLE signals SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'category,whale_addr'
);
SELECT add_compression_policy('signals', INTERVAL '7 days');

-- Retention: видаляти дані старше 90 днів
SELECT add_retention_policy('signals', INTERVAL '90 days');

-- Кити з лідерборду
CREATE TABLE whales (
  address     TEXT PRIMARY KEY,
  alias       TEXT,
  rank        INT,
  total_pnl   DECIMAL(14,2),
  win_rate    DECIMAL(5,2),
  total_trades INT,
  first_seen  TIMESTAMPTZ DEFAULT NOW(),
  last_active TIMESTAMPTZ,
  is_active   BOOLEAN DEFAULT true
);

-- Маппінг маркетів на категорії
CREATE TABLE market_categories (
  market_slug TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  category    TEXT NOT NULL,
  subcategory TEXT NOT NULL,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Індекси
CREATE INDEX idx_signals_category_ts ON signals (category, ts DESC);
CREATE INDEX idx_signals_whale_ts ON signals (whale_addr, ts DESC);
CREATE INDEX idx_signals_market_ts ON signals (market_slug, ts DESC);
```

---

## Frontend Architecture

```
src/
├── app/
│   ├── layout.tsx              — root layout, providers
│   ├── page.tsx                — main heatmap dashboard
│   └── api/                    — Next.js API routes (optional proxy)
├── components/
│   ├── heatmap/
│   │   ├── HeatmapCanvas.tsx   — Canvas-based heatmap renderer
│   │   ├── HeatmapControls.tsx — time scale + metric toggles
│   │   ├── HeatmapTooltip.tsx  — hover tooltip
│   │   └── HeatmapCell.ts     — cell data types + color logic
│   ├── breadcrumb/
│   │   └── DrillBreadcrumb.tsx
│   ├── stats/
│   │   └── StatsBar.tsx
│   ├── trade/
│   │   └── TradeModal.tsx
│   └── ui/                     — shadcn components
├── hooks/
│   ├── useHeatmapData.ts       — fetch + cache heatmap data
│   ├── useWebSocket.ts         — WS connection + reconnect
│   └── useDrill.ts             — drill-down state machine
├── lib/
│   ├── api.ts                  — API client
│   ├── colors.ts               — color scales per metric
│   ├── canvas-renderer.ts      — Canvas 2D heatmap drawing
│   └── types.ts                — shared types
└── stores/
    └── heatmap-store.ts        — Zustand store for realtime state
```

### Canvas Renderer (ключова оптимізація)

Чому Canvas а не DOM:
- 7 категорій × 24 години = 168 ячейок (root level) — DOM ОК
- Але при drill-down в маркети: 50+ маркетів × 24 години = 1200+ ячейок
- Canvas рендерить все за один прохід, <16ms навіть при 5000 ячейках
- Hover detection через `canvas.getBoundingClientRect()` + математика координат

```typescript
// Псевдокод Canvas renderer
function renderHeatmap(ctx: CanvasRenderingContext2D, grid: HeatmapGrid) {
  const { rows, cols, cellWidth, cellHeight } = calculateLayout(grid);

  // Single pass — все за один frame
  for (const row of rows) {
    for (const col of cols) {
      const cell = grid[row.key][col.index];
      ctx.fillStyle = getCellColor(cell, currentMetric);
      ctx.fillRect(col.x, row.y, cellWidth, cellHeight);

      if (cell.count > 0) {
        ctx.fillStyle = '#fff';
        ctx.fillText(formatValue(cell, currentMetric), col.x + cellWidth/2, row.y + cellHeight/2);
      }
    }
  }
}
```

### Responsive / Mobile

- Desktop: повна хітмапа з hover tooltips
- Mobile (<768px): горизонтальний скрол, tap замість hover, bottom sheet замість tooltip
- Shared codebase через responsive hooks, не окремий мобільний додаток

---

## Deploy (Docker Compose)

```yaml
# docker-compose.yml
version: '3.8'

services:
  db:
    image: timescale/timescaledb:latest-pg16
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: whale_heatmap
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports:
      - "5432:5432"

  ingestor:
    build:
      context: .
      dockerfile: Dockerfile.ingestor
    depends_on: [db]
    environment:
      DATABASE_URL: postgres://postgres:${DB_PASSWORD}@db:5432/whale_heatmap
      POLYMARKET_WS_URL: ${PM_WS_URL}
    restart: always

  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    depends_on: [db]
    environment:
      DATABASE_URL: postgres://postgres:${DB_PASSWORD}@db:5432/whale_heatmap
      PORT: 3001
    ports:
      - "3001:3001"
    restart: always

  web:
    build:
      context: .
      dockerfile: Dockerfile.web
    depends_on: [api]
    environment:
      NEXT_PUBLIC_API_URL: http://api:3001
      NEXT_PUBLIC_WS_URL: ws://api:3001/ws
    ports:
      - "3000:3000"
    restart: always

  caddy:
    image: caddy:2
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    depends_on: [web, api]

volumes:
  pgdata:
  caddy_data:
```

**Caddyfile:**
```
heatmap.yourdomain.com {
  handle /api/* {
    reverse_proxy api:3001
  }
  handle /ws/* {
    reverse_proxy api:3001
  }
  handle {
    reverse_proxy web:3000
  }
}
```

---

## Git Repository Structure

```
whale-signal-heatmap/
├── packages/
│   ├── ingestor/          — WS ingestor (Bun worker)
│   │   ├── src/
│   │   │   ├── ws-client.ts
│   │   │   ├── parser.ts
│   │   │   ├── enricher.ts
│   │   │   └── db.ts
│   │   └── Dockerfile
│   ├── api/               — API + WS server (Elysia)
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── ws/
│   │   │   └── db/
│   │   └── Dockerfile
│   └── web/               — Frontend (Next.js)
│       ├── src/
│       └── Dockerfile
├── db/
│   └── migrations/        — Drizzle migrations
├── docker-compose.yml
├── Caddyfile
└── .env.example
```

Monorepo через Bun workspaces — shared types між пакетами.

---

## Roadmap Імплементації

### Спринт 1 (тиждень 1): Foundation
- [ ] Ініт monorepo (Bun workspaces)
- [ ] PostgreSQL + TimescaleDB schema + міграції
- [ ] WS Ingestor MVP: підключення до Polymarket CLOB, парсинг, збереження в БД
- [ ] Базовий API: `/api/heatmap` endpoint з mock даними

### Спринт 2 (тиждень 2): Heatmap UI
- [ ] Next.js проект + Tailwind + shadcn
- [ ] Canvas heatmap renderer (root level)
- [ ] Time scale selector (1h/24h/7d/14d)
- [ ] Metric toggle (PnL/WinRate/Count/Size)
- [ ] Stats bar

### Спринт 3 (тиждень 3): Drill-down + Realtime
- [ ] Drill-down навігація (категорії → під → маркети)
- [ ] Breadcrumb
- [ ] WebSocket server (Elysia WS)
- [ ] Live cell updates з анімацією
- [ ] Tooltip з деталями сигналу

### Спринт 4 (тиждень 4): Polish + Deploy
- [ ] Trade modal (з можливістю підключення CLOB API)
- [ ] Mobile responsive layout
- [ ] Docker Compose + Caddy
- [ ] Deploy на Hetzner
- [ ] Whale leaderboard parser (cron 6h)
- [ ] Toast notifications для великих сигналів

### Post-MVP
- [ ] Whale profiles (клік на кита → його історія)
- [ ] Market detail page
- [ ] PnL tracking (resolution checker — відслідковувати як маркети резолвляться)
- [ ] Telegram alerts для патернів
- [ ] Auto-copy trading через CLOB API

---

## Системні вимоги (Hetzner)

| Ресурс | Мінімум | Рекомендовано |
|--------|---------|---------------|
| CPU | 2 vCPU | 4 vCPU (для TimescaleDB aggregates) |
| RAM | 4 GB | 8 GB |
| Disk | 40 GB SSD | 80 GB NVMe (для БД growth) |
| OS | Ubuntu 22.04 | Ubuntu 24.04 |
| Ціна | ~€7/міс (CX22) | ~€14/міс (CX32) |

При 42 китах і ~100-300 сигналах/день:
- ~10K записів/місяць
- З TimescaleDB compression: ~1 MB/місяць
- Навіть через рік: <100 MB даних
- Continuous aggregates: мінімальне навантаження на read queries

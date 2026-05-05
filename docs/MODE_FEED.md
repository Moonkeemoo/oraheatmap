# Mode: FEED

> Чергування significant moments як list поряд з heatmap. Live, sync з матрицею.
> Status: planning. Not yet implemented.
> Locked: 2026-05-05.

---

## Goal (JTBD)

*"Streami мені actionable моменти як вони формуються."*

Аналог Telegram-бота whale-tracker за $25-50/міс. Користувач не хоче scan-ити сітку — він хоче читати feed, як Twitter timeline, де кожен entry = trade-able момент. Heatmap при цьому стає "географічною мапою" feed-у: дивишся на entry → одразу бачиш де він стався.

---

## Definition: що потрапляє у feed

Feed entries — це significant individual events, не aggregations. Три типи:

### 1. Convergence moments

N+ unique elite/smart whales зайшли в один напрямок (BUY або SELL) на одному маркеті за rolling 12-min window.

```
×9 · 14:23 · BUY YES · Trump-UN-summit
9 elite whales bought YES in 8min · +4.2σ vs baseline
Theo4, CroupierMoney, +7
```

### 2. Big single trades

Single trade від elite whale (≥+30% PnL за 30d) розміром ≥P99 для цієї категорії за останні 30 days.

```
WHALE BUY · 14:18 · $24k YES @ $0.42
Theo4 · BTC above $145k Jul · +3.1σ size
```

### 3. Anti-consensus signals

Elite whale робить трейд проти forming consensus (≥3 elite whales went one way; цей кит — інший).

```
×7 SPLIT · 13:48 · contrarian divergence
3 elite long, 4 elite short on Russia ceasefire Q3
First divergence у 2 тижні
```

---

## Update frequency: проблема об'єму

Це твоє питання було ключове. Розв'язую так:

### Ставлення до drill level

Кількість events scales з drill level:

| Level | Events at peak hours (per min) | Show threshold |
|---|---|---|
| L1 (top categories) | 30-50 candidate events | ≥P99 (top 1%) |
| L2 (subcategories) | 5-15 candidates | ≥P95 (top 5%) |
| L3 (individual market) | 1-3 candidates | ≥P75 (top 25%) |

Threshold filter використовує існуючий `signal_thresholds` materialized view (per-scope per-metric P50/P75/P95/P99/P99.9 з parked highlights backend).

Формула на L1: показати тільки events де magnitude ≥ scope_threshold.P99. Для L3 — нижчий поріг бо подій in scope менше.

Effective rate після filtering:

| Level | New cards in feed (per min) |
|---|---|
| L1 | 1-3 (зрозуміло, читабельно) |
| L2 | 1-2 |
| L3 | 0-1 |

### Rate limit на UI side

Навіть з threshold filter може прийти burst: 5 events за 2 секунди → feed жбурляється. Solution:

- **Queue + paced animation** — нові events стають у queue, з'являються у feed з мінімальним spacing 1.5s між cards.
- Якщо queue росте швидше ніж UI відображає — показуємо badge на top of feed: "**3 new ↑**" — click щоб flush queue.

### Pause on hover

Коли користувач hover-ить feed — нові cards не push-ять existing вниз. Накопичуються у queue. Як тільки cursor leave — flush з paced animation.

### Lifetime card

- Card з'являється з SSE event
- Видима у feed протягом 10 minutes (configurable)
- Після 10 min — fade out і remove
- Старі cards доступні через "history" toggle (Pro feature?)

---

## UI behavior

### Layout

Two-pane: heatmap left ~62%, feed pane right ~38% (240px на typical 1280px screen).

### Heatmap у FEED mode

Стандартна heatmap з усіма colors. Cells з активними feed entries отримують:

- Невеликий circle marker `4-5px` у corner cell
- Color marker = type:
  - `#f0b429` amber = convergence
  - `#3fb950` green = big buy
  - `#f85149` red = big sell  
  - `#5dd5cf` cyan = anti-consensus

Multiple types per cell — stacked dots (`●●` two markers).

### Feed pane

```
┌─────────────────────────────┐
│  LIVE FEED        ⏸ 3 new ↑ │
│  ─────────────────────────  │
│  ╔═══════════════════════╗  │
│  ║ ×9 · 14:23      [+4σ] ║  │
│  ║ Trump-UN-summit       ║  │
│  ║ Politics · row1 col11 ║  │
│  ║ ●●● Theo4 +7 whales   ║  │
│  ╚═══════════════════════╝  │
│  ┌───────────────────────┐  │
│  │ ×7 · 14:18      [+3σ] │  │
│  │ Russia ceasefire      │  │
│  │ Politics · row1 col10 │  │
│  └───────────────────────┘  │
│   ...                       │
└─────────────────────────────┘
```

Card structure:
- Top-left: convergence/buy/sell badge з count
- Top-right: sigma badge
- Title: market name (bold)
- Sub-line: cell coordinate `[category] · row·col`
- Bottom: whale identifiers (avatars or names, max 3 visible + "+N")

### Sync behavior

- Hover card у feed → cell на heatmap отримує pulse outline (CSS keyframe).
- Hover cell на heatmap → перший card з цією cell в feed scrolls into view + active border.
- Click card → focuses cell + drill-down to L3 на market mentioned.
- Click cell → filter feed до events з цієї cell.

### Filter pills

Header у feed pane:

```
ALL | CONV | BIG | SPLIT      ≥P95 ≥P99 ≥P99.9
```

Two pill groups:
- **Type filter** — show only convergence, only big trades, etc.
- **Magnitude filter** — глобальний threshold

---

## Data requirements

### SSE wire shape

Existing SSE channel розширюється feed events. Magnitude tags вже є у parked highlights backend:

```ts
type FeedEvent =
  | { type: "convergence"; cell: CellId; whales: Whale[]; sigma: number; market: string; ts: number }
  | { type: "big-trade"; cell: CellId; whale: Whale; size: number; sigma: number; side: "buy" | "sell"; market: string; ts: number }
  | { type: "anti-consensus"; cell: CellId; whales: { long: Whale[]; short: Whale[] }; market: string; ts: number };
```

### Backend computation

- Convergence detection — rolling 12-min window per (market, side). Trigger коли count ≥3 unique elite whales. `signal_thresholds` для magnitude.
- Big trade detection — trade-time check проти `signal_thresholds.P99` для (category, metric).
- Anti-consensus — 24h window per market. Trigger коли elite-split formed first time. Required after RECEIPTS data is available (потрібен elite filter).

Effort: medium. Convergence logic + signal_thresholds revival = частково з parked highlights, треба новий dispatch path.

---

## Open decisions

### 1. Hard limit для feed pane

Скільки cards максимум у DOM одночасно? Чи unlimited scroll з old → fade?

**Recommendation:** жорсткий limit 20 cards у DOM. Старіші — у history archive (Pro feature). На L1 при peak 1-3 new/min, 20 cards = ~10-20 минут window. Достатньо для context.

### 2. Convergence window — 12min чи tunable?

CLAUDE.md ideas backlog згадує "dedicated 12-minute timeline" — це і має стати window для convergence. Але для аналітика з різним workflow може треба 5min або 30min.

**Recommendation:** 12min default, не tunable у v1. Tune параметр під реальний user feedback. Експоновати в Pro settings later.

### 3. Mute/unmute per market

Якщо market дуже жвавий і flooding-ить feed — option mute його? Ускладнює state, але корисно для активних traders.

**Recommendation:** Defer до Pro tier. v1 без muting.

### 4. Cell marker conflict з drill-down arrow

Drill-down вже використовує corner badges? Перевірити. Якщо так — feed markers ставити в інший corner (top-right замість default top-left).

**Action item:** перевірити поточний `Cell.tsx` для конфлікту markers.

---

## Out of scope (v1)

- Push notifications (web push, Telegram). Це v2.0+.
- Historical feed archive (scroll back ≥10min). Pro feature later.
- User-saved markets watchlist у feed. Defer.
- Sound notifications. Defer.

---

## Implementation notes

- Frontend: новий `<FeedPane/>` component, mounted при `mode === "feed"`. Subscribes to SSE з filter.
- SSE: extend existing channel, add `event-type: feed-event` tagging.
- Queue logic: `useFeedQueue()` hook що manage-ить incoming events + paced flush.
- Cell markers: extend existing `Cell.tsx` with `markers={[{type, color}]}` prop.
- Sync layer: shared `useModeSync(cellId)` hook (same as ANOMALY mode).

Effort estimate: 5-7 days. Найбільший з трьох mode-фіч бо складна update-frequency logic + revival highlights backend.

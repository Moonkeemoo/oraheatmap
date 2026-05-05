# Mode: ANOMALY

> Прибрати з матриці все звичайне і залишити тільки те що statisticly відхиляється від норми.
> Status: planning. Not yet implemented.
> Locked: 2026-05-05.

---

## Goal (JTBD)

*"Скажи мені на що ВЗАГАЛІ варто подивитись прямо зараз."*

Користувач відкриває дашборд з обмеженою увагою (≤30s). У режимі ANOMALY він має за 2-3 секунди побачити чи є зараз щось varto уваги. Якщо нема — порожня сітка, користувач закриває вкладку зі спокоєм. Якщо є — кричить тільки те що дійсно ненормальне.

---

## Definition: що таке "аномалія"

Аномалія — cell де поточне значення статистично відхиляється від rolling 30d baseline. Базис — той самий PATTERN baseline що вже існує (`signals_hourly` continuous aggregate, normalized по hour-of-day і day-of-week).

Формула:

```
z = (current_value - mean_30d) / stddev_30d
anomaly = |z| >= threshold
```

Default threshold: `|z| >= 2σ` (top ~5% хвостових подій). Користувач може змінити на 3σ (top ~0.3%) або 4σ (extremely rare).

### Чотири осі аномалій

Cell може бути аномальним по різних метриках одночасно:

1. **Volume** — кількість trades (поточна метрика)
2. **Whale-count** — кількість унікальних whales у cell
3. **Win-rate** — середній win-rate involved whales (тільки якщо є realized resolutions)
4. **Convergence** — N+ whales в одному напрямку (BUY/SELL) у cell

Кожна вісь має свій z-score. Cell вважається "anomaly" якщо хоча б одна вісь перевищує threshold.

### Що показуємо

- **Cell color** — primary axis (з найбільшим |z|). Knapsack дає одне число на cell.
- **Tooltip on hover** — список ВСІХ axes що в anomaly + їх z-scores
- **Right panel** — той самий список що і tooltip, але post-click і persistent

---

## UI behavior

### Heatmap

- Cells без аномалії — `background: #0d1117` (зливаються з фоном). Дуже тихо.
- Cells з аномалією — звичайний metric color + outline `#f0b429` + sigma badge у corner (`+4σ`, `−3σ`).
- Cells multiple-axis anomaly — той самий outline, але tooltip показує всі осі.

### Tooltip (on hover)

Пример — Politics 14:25 cell з кількома аномаліями:

```
POLITICS · 14:25
─────────────────
volume      +4.2σ  $840k vs typical $190k
whales      +3.1σ  9 unique vs typical 3
convergence +5.0σ  9/9 BUY direction
─────────────────
top market: Trump-UN-summit
```

Tooltip відкривається на hover, закривається при leave. Click на cell → відкриває right panel.

### Right panel (on click cell or open by default)

Width: ~240px, slide-in справа. Список ВСІХ active anomalies, sorted by max(|z|) descending.

Card structure:

```
┌─────────────────────────────────┐
│ Politics · 14:25       [+4.2σ]  │
│ ─────────────────────────────── │
│ volume      +4.2σ  $840k        │
│ whales      +3.1σ  9 unique     │
│ convergence +5.0σ  9 BUY        │
│ ─────────────────────────────── │
│ top market: Trump-UN-summit     │
└─────────────────────────────────┘
```

Click на card → corresponding cell на heatmap pulse-blinks і центрується якщо drilled.

### Bidirectional sync

- Hover cell → відповідна card у panel highlight-иться (border-color #f0b429).
- Hover card у panel → cell на heatmap pulse-blinks (CSS keyframe outline animation).
- Click card → focuses cell, scrolls into view if drilled.
- Click cell → panel scrolls to its card and highlights.

### Threshold control

User-facing pill у header (поряд з mode tabs):

```
ANOMALY  [≥2σ] [≥3σ] [≥4σ]
```

Default `≥2σ`. Higher threshold = менше cells лишається на сітці. Налаштування persist через localStorage.

---

## Data requirements

### Backend changes

Потрібен новий endpoint або extension до існуючого:

```
GET /api/heatmap?mode=anomaly&range=24h&filter=smart&sigma=2

Response:
{
  cells: [
    { row: "Politics", col: "14:25", primary: "volume", primaryZ: 4.2,
      anomalies: [
        { axis: "volume", z: 4.2, current: 840000, baseline: 190000 },
        { axis: "whales", z: 3.1, current: 9, baseline: 3 },
        { axis: "convergence", z: 5.0, current: 9, baseline: 1.5 }
      ],
      topMarket: "Trump-UN-summit"
    },
    ...
  ]
}
```

### Materialized view

Залежить від існуючого `signal_thresholds` materialized view (відмічено у CLAUDE.md як вже стоїть з parked highlights). Розширити щоб включати mean+stddev по чотирьох axes per (category, hour-of-day, day-of-week) bucket.

Refresh cadence: hourly cron (як уже є для signal_thresholds).

### Performance

Anomaly computation per request — O(rows × cols × axes). При 9 categories × 12 cols × 4 axes = 432 z-scores. Розрахунок з materialized view — sub-100ms.

---

## Open decisions

### 1. Single threshold чи per-axis threshold?

Зараз propose один global `≥Nσ` що applies до всіх axes. Альтернатива: окремі thresholds per axis (volume sensitive, win-rate strict). Ускладнює UI але precision вища.

**Recommendation:** single threshold для v1, per-axis для Pro user expansion later.

### 2. Що показувати при z=0 / null baseline?

Нова categorie яка зʼявилась нещодавно не має 30d baseline → can't compute z-score. Опції:
- (A) приховати такі cells взагалі
- (B) показати з special "new" badge без z-score
- (C) використовувати menshchee window (7d) поки не build-up 30d

**Recommendation:** (B). Показуємо cell з "NEW" badge замість sigma value, без anomaly outline. Користувач бачить що тут є активність, але не може judge anomaly.

### 3. Negative anomalies (тиша)

`−3σ Crypto 03:30` = unusually quiet. Це теж аномалія? Інтуітивно так, але візуально quiet cells вже dim by default.

**Recommendation:** Так, показуємо negative anomalies теж, але з різним outline color (`#5dd5cf` cyan для unusual quiet vs `#f0b429` amber для unusual active). Дві опції в legend.

---

## Out of scope (v1)

- ML-based anomaly detection (isolation forest, LSTM autoencoder). Z-score = baseline.
- Custom user-defined anomaly rules ("alert me if my saved whales converge").
- Anomaly history view ("показуй аномалії останніх 24h"). Тільки CURRENT anomalies для v1.
- Cross-cell anomalies (e.g., correlation between Politics і Crypto). Single-cell only.

---

## Implementation notes

- Frontend: окремий `<AnomalyOverlay/>` component поверх існуючого heatmap. Reads `?mode=anomaly` query.
- Backend: новий route `/api/heatmap/anomaly` або `?mode=anomaly` query на existing endpoint.
- Right panel: shared component `<ModeFeedPanel/>` — same shell для ANOMALY/FEED/RECEIPTS, only data source differs.
- Sync layer: shared `useModeSync(cellId)` hook що управляє hover/click cross-pane state.

Effort estimate: 4-5 days включно з materialized view changes, frontend pane, sync logic, threshold control, tooltip.

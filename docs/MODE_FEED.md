# Mode: FEED

> Хронологічний потік significant moments як список поряд з матрицею.
> Status: planning, idea-level. UI design — окремий пас.

---

## Idea

Замість того щоб користувач сам шукав сигнали у сітці — ми розповідаємо йому що відбувається у вигляді живого feed. Як Telegram-канал whale-tracker за $25-50/міс. Кожен entry = trade-able момент. Heatmap при цьому стає мапою для feed: дивишся на entry — одразу видно ДЕ він стався.

Job-to-be-done: *"streami мені actionable моменти як вони формуються — не змушуй мене їх шукати"*.

---

## Що потрапляє у feed

Не всі трейди. Тільки significant individual events трьох типів:

### Convergence

N+ unique whales зайшли в один напрямок (BUY або SELL) на одному маркеті за короткий window (12 хвилин). Це найцінніший сигнал — синхронна одностайна дія багатьох незалежних elite-traders.

### Big single trades

Single trade від elite whale розміром що sam-по-sobe вибивається з норми (≥P99 magnitude для цієї категорії за 30d).

### Anti-consensus

Elite whale робить трейд проти forming consensus. Контрсигнал — коли ринок формує одну думку, але один з кращих traders іде проти.

---

## Проблема об'єму

При 10K whales і peak hours candidate events можуть йти десятками за хвилину на L1. Якщо все це лити у feed — це буде Bloomberg-шум, не actionable список. Треба filter.

Концептуальний підхід: **feed threshold scales з drill level**.

- На L1 (top categories) — тільки top 1% magnitude events. ≥P99.
- На L2 (subcategories) — top 5%. ≥P95.
- На L3 (individual market) — top 25%. ≥P75.

Чим глибше drill — тим менше об'єм взагалі, тим нижчий поріг. Користувач який зайшов у конкретний market хоче бачити більше деталей. На overview level — тільки extreme events.

Поріг використовує існуючий `signal_thresholds` materialized view (P50/P75/P95/P99/P99.9 per scope per metric).

---

## Чому це сильно

Дашборд перестає бути "log of activity" і стає "stream of attention". Користувач не сканує клітинки — він читає stream. Кожен entry самодостатній: що сталось + з якою впевненістю + хто зробив. Plus geographic anchor через heatmap-mapping.

Це і є тип продукту що TG-канали whale-tracker'и продають за $25-50/міс. Полегшує копіювати — користувач бачить event і одразу знає чи варто реагувати.

---

## Open conceptual questions

### Чи завжди 12-хвилинне convergence window, чи tunable?

CLAUDE.md ideas backlog згадує "dedicated 12-minute timeline" як правильний window для convergence. Але різні traders мають різний horizon — для intraday 5min актуально, для swing 30min достатньо.

### Як старіємо feed entries?

Entry зʼявляється з SSE event. Видимий N хвилин (10? 30?), потім fade out. Після — чи зникає взагалі, чи доступний у history archive (Pro feature)?

### "Big trade" — це окремий тип entry, чи частина convergence count = 1?

Concept-level: чи single $50k trade від elite whale = "convergence ×1" чи окремий event-type "big-trade"? Якщо окремий — то це ще одна категорія для filter pills у UI пізніше. Якщо частина convergence — простіше data model.

### Anti-consensus вимагає realized-PnL leaderboard

Без знання хто elite-trader на rolling 30d ми не можемо сказати "цей кит проти тих китів". Тому anti-consensus depends on smart-money filter (A) being shipped first.

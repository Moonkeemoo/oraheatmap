# Mode: RECEIPTS

> Resolved markets з whale outcomes. Ретроспектива — хто був прав, хто ні.
> Status: planning, idea-level. UI design — окремий пас.

---

## Idea

Маркетингово-критичний режим. Користувач який ще нам не довіряє приходить, відкриває RECEIPTS — і бачить факти: whale Theo4 зайшов long YES @ $0.42, ринок resolved YES @ $1.00, він зробив +$84k. Це не feature, це доказ. Прозорість працює сильніше ніж копірайтинг.

Per CLAUDE.md monetization plan — ця сторінка завжди-free бо це conversion lever, gating її kills credibility.

Job-to-be-done: *"чому я маю вам взагалі вірити?"*

---

## Що таке "receipt"

Receipt = resolved market де хоча б один tracked whale мав активну позицію на момент resolution. Несе:

- Що за market і коли resolved (з яким outcome)
- Який whale, з якою стороною (BUY/SELL), за якою ціною entry
- Розмір позиції
- Realized PnL з результату resolution
- Чи був whale "правий" — buy YES + resolved YES = correct, інакше wrong

Один resolved market може мати кілька receipts (якщо багато whales мали позиції). Але cell на матриці один — це cell де whale зайшов у позицію (не resolution).

---

## Найважливіший нюанс: cell entry, не resolution

Receipt відноситься до cell **WHEN whale entered position**, не WHEN resolved. Бо матриця показує whale activity у часі, і нас цікавить "у цей момент Theo4 зайшов на YES — а як це закінчилось?".

Користувач дивиться на cell з зеленим dot-marker → знає "тут хтось зайшов і виграв". Click → бачить ХТО і скільки.

---

## Time range tension

Receipts ретроспективні — markets resolve через дні-тижні. Heatmap range типово 1h/24h. Ці scale-и не співпадають.

Концептуальний підхід: **RECEIPTS mode перемикає range до timescale resolution-ів**. У RECEIPTS режимі ranges 1h і 24h disabled — вони безглузді бо resolved markets рідко були active за останню годину. Default 7d (тиждень resolution-ів = достатня вибірка для довіри).

---

## Чому це сильно

- **Trust-hook для cold visitors** — найкоротший шлях довести цінність продукту. Не "ось кліткова сітка з кольорами" а "ось ці люди заробили / втратили реальні гроші використовуючи дані що ми трекаємо".
- **Always-free → top-of-funnel content** — посилання на receipts шарується на X/Reddit. "Look at this whale's track record on Polymarket" — readable від кожного.
- **Sets expectations**: 64% хіт-rate на ~50 signals/тиждень — це чесна цифра, не маркетинг. Користувач знає до чого готуватись.
- **Foundation для inших фіч** — anti-consensus у FEED, smart-money filter у whales — все потребує realized-PnL даних які receipts експонують.

---

## Open conceptual questions

### Realized vs unrealized PnL

Деякі positions частково closed pre-resolution. Концептуально `realized PnL` чистіший narrative бо це factual closing money. Але якщо whale тримав до самого резолвена — `total return = realized`. Тільки часткові closes ускладнюють.

### Whale identity exposure для anonymous users

Показуємо `Theo4` (Polymarket leaderboard alias) anonymous відвідувачам? Ці aliases вже публічні через Polymarket leaderboard API, тому експозиція не leakує нічого нового. Але ставити "Whale #1234" робить receipt безособистісним і слабшим narrative-wise.

### Що таке "correct" для майже-50/50 resolution?

Whale long YES @ $0.40, market resolved $0.42 — він "виграв" по price logic, але PnL непомітний. Технічно correct. Але якщо ми сортуємо receipts by impact для trust-hook — слабкі wins зникають у noise.

### Multiple whales на одному market — як подати?

5 whales мали різні entry-prices і різні розміри позицій на одному resolved market. Один receipt-card з усіма? Один на whale (5 cards)? Перший — компактніший, другий — повніший narrative.

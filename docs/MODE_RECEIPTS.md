# Mode: RECEIPTS

> Resolved markets з whale outcomes — підсвічуємо cell entry і списуємо у panel.
> Status: planning. Not yet implemented.
> Locked: 2026-05-05.

---

## Goal (JTBD)

*"Чому я маю вам вірити?"*

Потужний trust-hook для конверсії новачків. Завжди-free (per CLAUDE.md monetization plan: "Receipts page · trust hook for Pro conversion; gating it kills credibility").

Користувач бачить: ось whale Theo4 зайшов long YES @ $0.42 у Politics 2 тижні тому, ринок resolved YES @ $1.00 — він зробив +$84k. Це не feature, це доказ. Особливо потужно для аудиторії що ще не довіряє продукту.

---

## Definition: що таке "receipt"

Receipt = resolved market де хоча б один tracked whale мав активну позицію на момент resolution.

```
{
  market: "Trump-EO-Mar-15",
  category: "Politics",
  resolved_at: "2026-05-03T18:00Z",
  resolution: "YES",  // or "NO"
  resolved_price: 1.00,
  whale_position: {
    whale: "Theo4",
    side: "buy",
    entry_price: 0.42,
    entry_ts: "2026-04-20T13:50Z",
    size_usd: 200000,
    realized_pnl: 84000,
    correct: true  // computed from side + resolution
  }
}
```

Один resolved market може мати **кілька** receipts — якщо багато whales мали позиції. У такому випадку cell де вони увійшли отримує count badge.

### Що важливо

- Receipt відноситься до cell **WHEN whale entered position**, не WHEN resolved. Бо це актуально для нашої матриці яка показує current activity. "Це сталось 14:23 → resolution 2 тижні пізніше → realized PnL = X."

---

## UI behavior

### Layout

Two-pane: heatmap left ~62%, receipts pane right ~38% (240px). Той самий shell що FEED.

### Heatmap у RECEIPTS mode

Cells з резолвом:

- Marker dot у corner: 4-5px, color = result.
  - `#3fb950` green = whale was right (correct prediction, positive realized PnL)
  - `#f85149` red = whale was wrong (incorrect prediction, negative realized PnL)
- Multiple receipts на cell — count badge `×3` поряд з dot.

Cell base color лишається той самий що у LIVE mode (volume або whatever current metric). Markers — додатковий шар.

### Receipts pane

```
┌─────────────────────────────────┐
│  RECEIPTS · 7d   [7d] 30d All-time │
│  47 signals · 64% хіт-rate         │
│  ───────────────────────────────│
│  ╔═══════════════════════════╗  │
│  ║ Trump-EO-Mar-15      [✓]  ║  │
│  ║ Politics · 13:50          ║  │
│  ║ Theo4 long @ $0.42        ║  │
│  ║ Resolved $1.00 (Apr 28)   ║  │
│  ║ +$84k realized            ║  │
│  ╚═══════════════════════════╝  │
│  ┌───────────────────────────┐  │
│  │ Lakers-finals-Q2     [✗]  │  │
│  │ Sports · 14:30            │  │
│  │ CroupierMoney long @ $0.38│  │
│  │ Resolved $0.00 (May 02)   │  │
│  │ −$22k realized            │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

Card structure:
- Top-left: market name (bold)
- Top-right: `[✓]` correct or `[✗]` wrong icon
- Cell coord: `Politics · 13:50` (где зайшов)
- Whale entry: `Theo4 long @ $0.42`
- Resolution line: `Resolved $X (date)`
- PnL bottom: `+$84k realized` (green/red bold)

### Sync behavior

Як user описав:
- Hover card у panel → відповідна cell pulses outline на heatmap.
- Hover cell на heatmap → перший receipt-card з цією cell scrolls into view + active border.
- Click card → cell focuses, drills to that specific market (L3).
- Click cell → panel filters до receipts з цієї cell.

### Filter pills (header у panel)

```
RANGE:  [7d] 30d  All-time
RESULT: All  [✓ Correct]  [✗ Wrong]
WHALE:  All  Top-10  Top-100
```

Default: 7d, All results, All whales. Adjustable через pills у header.

### Stats summary

Top of panel показує agg-stats для current filter:

```
47 signals · 64% хіт-rate · +$340k realized
```

Це і є trust-hook content. Користувач бачить що 64% сигналів правильні — за цим стоять 47 trackable bets за тиждень. Завжди-free.

---

## Time range tension

Receipts відноситься до **resolved** markets, які могли resolve тиждень-два назад. Heatmap range обмежений (1h/24h/12d/12w):

- На 1h матриці receipt у Politics 14:25 today → cell є, marker є, sync працює.
- На 1h матриці receipt 5 days ago → cell тут вже немає (out of range), card у panel є але marker нікуди.

### Розв'язок

**Receipt cards без cell** показуємо у panel зі special indicator:
- Card style same, але coord-line читає "Politics · Apr 20 13:50 (older)".
- Hover на таку card → sub-toast "Поза поточним часовим діапазоном — change to 30d to see cell on heatmap?"
- Click таку card → змінює range з 1h → відповідний interval що включає entry.

### Альтернатива (простіше)

При вмиканні RECEIPTS mode — auto-switch range до **30d default**. Користувач може звузити до 7d. Не дозволяємо 1h/24h у RECEIPTS бо марно.

**Recommendation:** Auto-switch до 7d default, mode-restricted ranges. Не дозволяємо 1h і 24h у RECEIPTS — pills disabled з tooltip "RECEIPTS works on resolution timescale (≥7d)".

---

## Data requirements

### Backend

Цей режим вже має backend з parked work:
- `processed_resolutions` table (existing)
- `signals` × `processed_resolutions` JOIN

Endpoint:

```
GET /api/receipts?range=7d&filter=smart

Response:
{
  receipts: [
    {
      market: "Trump-EO-Mar-15",
      category: "Politics",
      resolved_at: "2026-05-03T18:00Z",
      resolution: "YES",
      whale_positions: [
        { whale_addr, alias, side, entry_ts, entry_price, size_usd, realized_pnl, correct }
      ]
    }
  ],
  stats: {
    total: 47,
    correct_pct: 0.64,
    realized_pnl_total: 340000
  }
}
```

### Performance

Receipts — historical, можна aggressively cache. 7d query — 5 min cache TTL. 30d query — 30 min cache.

Не realtime. SSE для receipts не потрібний — receipts оновлюються коли market resolves (дискретні події, можна polling 1 min).

---

## Open decisions

### 1. Anonymous gate

CLAUDE.md monetization plan — "Receipts always-free". Підтверджуємо: anonymous users see receipts без auth.

### 2. Whale identity exposure

Anonymous users — показуємо whale alias (Theo4) і Polymarket profile link?
- Якщо так — whale_aliases.json data exposed publicly. OK бо leaderboard data.
- Якщо ні — show "Whale #1234" generic. Менше trust.

**Recommendation:** Public alias for anonymous (це ж публічний leaderboard data вже). Authentic feel important.

### 3. Realized vs unrealized PnL

Деякі positions partially closed pre-resolution. Показуємо realized тільки чи total return? Realized clearer for trust narrative.

**Recommendation:** Realized тільки для v1.

### 4. Show all whales або тільки top

Якщо 12 whales мали позицію в resolved market — показувати всіх?
- (A) Top 3 з "+9 more" link
- (B) All inline (large cards)

**Recommendation:** (A). Card stays compact, expansion on click to drill into all whales.

### 5. "Almost won" markets

Whale long YES @ $0.40, market resolved $0.42 — він "виграв" по price logic але PnL невеликий. Чи це correct? Технічно так (ставив YES, market resolved YES) але trust-narrative-wise weak.

**Recommendation:** Показуємо як `correct` бо technically прав. Але sort by PnL magnitude default — слабкі wins не на верху.

---

## Out of scope (v1)

- Receipt sharing (Twitter/X share card). Defer.
- Whale-specific receipt feed ("show me all of Theo4's resolved bets"). Defer to Whale Drawer integration.
- Receipt comments / discussion. No.
- Backtesting tool ("if I had copied this whale, what would my PnL be?"). v2.0+.
- Resolution price chart. Defer.

---

## Implementation notes

- Frontend: новий `<ReceiptsPane/>` component. Same shell as FEED.
- Backend: `/api/receipts` endpoint over `signals × processed_resolutions`. Separate from heatmap query.
- Markers on cells: same `<Cell markers={[]}/>` extension as FEED. Add receipt-marker type.
- Range auto-switch: при mode change → ensure range ≥7d, fallback to 7d if needed.
- Sync layer: same `useModeSync()` hook — pure UI logic, agnostic of mode.

Effort estimate: 3-4 days. Найшвидший з трьох mode-фіч бо backend в основному є (processed_resolutions готова), UI — варіація FEED layout.

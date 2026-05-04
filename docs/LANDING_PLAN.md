# Landing Page Plan

> Marketing landing для Polymarket Signal Heatmap. Пояснює продукт перш ніж пускати у грід.
> Status: planning (2026-05-04). Code: not started.
> Референси: polymarketanalytics.com, polymarketdata.co.

---

## Прийняті рішення

| # | Питання | Рішення |
|---|---------|---------|
| 1 | Маршрут | Лендинг на `/`, хітмапа переїжджає на `/app` |
| 2 | Секції MVP | Hero + live preview · How it works + Features |
| 3 | Стиль | Dark/неон, GitHub-dark палітра з `tokens.ts` (`#0d1117` bg, `#f0b429` accent, `#3fb950`/`#f85149` для cells) |
| 4 | Мова | English (відповідає правилу `Platform UI in English`) |

**Не в скоупі landing v1:** Stats live counters · FAQ · Pricing teaser · i18n switcher · footer-heavy навігація. Винесено у landing v1.1+ — повертаємось коли буде що показати в цифрах і коли v1.7 monetization підійде ближче.

---

## Routing migration

Поточний стан:

```
GET  /             → <Heatmap />          (packages/web/src/app/page.tsx)
```

Цільовий стан:

```
GET  /             → <Landing />          (новий)
GET  /app          → <Heatmap />          (переніс існуючий)
GET  /api/*        → без змін
```

**Що зробити:**
1. `mv packages/web/src/app/page.tsx packages/web/src/app/app/page.tsx`
2. Створити новий `packages/web/src/app/page.tsx` з `<Landing />`
3. Оновити внутрішні посилання у `Header.tsx` (logo → `/app`, не `/`)
4. CTA на лендингу: `Open heatmap` → `/app`
5. Перевірити що `next-auth` callbackUrl-и не зашиті на `/`

**SEO/redirect лежить на майбутнє:** existing-юзери з закладкою на `/` потраплять на лендинг — це OK, бо там CTA веде у `/app`. Якщо побачимо drop у retention — додамо cookie-flag що redirect-ить returning-юзера у `/app` (це опція 2 з clarification, відкладена).

---

## Page IA — порядок секцій

```
┌─────────────────────────────────────────────────────────┐
│  Header              [logo]  Features · How it works · Open heatmap →  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   HERO                                                  │
│   ───────                                               │
│   Headline                                              │
│   Subheadline                                           │
│   [Open heatmap →]  [How it works]                      │
│                                                         │
│   Live preview (real iframe of /app, frozen at first    │
│   meaningful paint, або animated screenshot loop)       │
│                                                         │
├─────────────────────────────────────────────────────────┤
│   HOW IT WORKS — 4 steps in a row                       │
│   ────────                                              │
│   [Listen]  [Match]  [Enrich]  [Visualize]              │
├─────────────────────────────────────────────────────────┤
│   FEATURES — 2x3 grid                                   │
│   ─────────                                             │
│   Live grid · LIVE+PATTERN · Drill-down                 │
│   Whale drawer · 5 metrics · Cell lock-on-click         │
├─────────────────────────────────────────────────────────┤
│   FINAL CTA                                             │
│   [Open heatmap →]                                      │
├─────────────────────────────────────────────────────────┤
│   Footer  © 2026 · GitHub · Twitter · Polymarket        │
└─────────────────────────────────────────────────────────┘
```

Висота лендингу: ~3-4 viewport-и на десктопі. Не лонгрід.

---

## Copy draft

### Hero

**Headline (два варіанти, обрати):**
- A. *See where smart money moves on Polymarket.*
- B. *A live heatmap of every Polymarket whale trade.*

Recommendation: **B** — конкретніше, менше hype-words. "Smart money" звучить як крипто-Telegram канал, "whale trade" — фактично.

**Subheadline:**
> Every trade made by the top ~600 Polymarket traders, aggregated into a real-time heatmap of categories × time. No charts, no commentary — just where the money actually goes.

**CTA primary:** `Open heatmap →` (links `/app`)
**CTA secondary:** `How it works` (smooth-scroll до секції)

**Microcopy under CTAs:** `Free. No signup required for the live grid.` — натяк що auth є, але не заважає (відповідає поточному soft-gate з v1.5).

### Live preview

Три варіанти, в порядку складності:

| Підхід | Pro | Con |
|--------|-----|-----|
| **Real iframe `/app` (поточна продакшен хітмапа, без хедера)** | Завжди свіжо, нуль роботи на оновлення | iframe SEO нижче, треба `?embed=1` режим у Heatmap.tsx що ховає Header/Login |
| **Animated WebM/MP4 loop (5-10s screen capture)** | Контрольована якість, fast LCP | Треба перезаписувати при візуальних змінах |
| **Static PNG + CSS shimmer** | Найшвидше, найменше jank | Виглядає мертво для продукту що рекламує "live" |

**Recommendation:** почати з варіанту 2 (animated loop). Iframe — v1.1 коли буде `?embed=1` режим.

### How it works (4 кроки)

Кожен крок — іконка + одне речення. Ніяких bullets всередині.

1. **Listen.** Connect to Polymarket's RTDS firehose — every trade on the platform, in real time.
2. **Match.** Filter against a watchlist of ~600 top traders, refreshed weekly from Polymarket's official leaderboards.
3. **Enrich.** Pull market category, outcome, and probability from the Gamma API.
4. **Visualize.** Aggregate into 5-minute buckets across 9 categories. Watch the grid light up as money moves.

Іконки: `radio-tower`, `filter`, `database`, `grid-3x3` (lucide-react — вже у залежностях через React-артефакти, перевірити чи додано в `web/package.json`).

### Features (2×3 grid)

Кожна — заголовок + 1-2 речення.

| Title | Body |
|-------|------|
| **Live grid** | SSE-powered, sub-second updates. The cell tints as trades land. |
| **LIVE & PATTERN modes** | Sliding window for "what's happening now"; cyclical overlay for "when does Crypto usually fire?". |
| **Category drill-down** | Click any cell to drop into subcategories, then individual markets. |
| **Whale drawer** | Click a trader to see open positions, recent trades, and per-category PnL. |
| **5 metrics** | Volume, trade count, unique whales (convergence), PnL, win rate — switch on the fly. |
| **Lock-on-click tooltip** | Pin two cells side-by-side to compare top markets and category breakdowns. |

### Final CTA

```
Ready to see the firehose?

[Open heatmap →]
```

### Footer

```
© 2026 oralab.xyz   ·   GitHub   ·   X   ·   Polymarket
                                              ↑
                       (referral link — пасує до v1.2 рішення про referral у market links)
```

---

## Visual treatment

### Палітра (з `tokens.ts`)

- Background: `#0d1117` (TOKENS.bg)
- Panel: `#161b22` (TOKENS.panel) — для feature-карток
- Border: `#21262d` (TOKENS.border) — 1px на всіх контейнерах
- Text primary: `#e6edf3` (TOKENS.text)
- Text secondary: `#7d8590` (TOKENS.textSec) — для subheadlines
- Accent (CTA, headline highlight): `#f0b429` (TOKENS.accent)
- Heat green: `#3fb950` (TOKENS.pos) — для "live" indicators, success states
- Heat red: `#f85149` (TOKENS.neg) — для accent-mosaic у hero, не для error

### Типографіка

- Headline: 56-72px, `font-weight: 700`, `letter-spacing: -0.02em`, system-font-stack з `tokens.ts`
- Subheadline: 18-20px, `TOKENS.textSec`, line-height 1.5
- Section H2: 32-40px
- Body: 16px
- Mono для метрик/ASCII: `tokens.mono`

### Layout

- Container: `max-width: 1200px`, центр, padding 24-48px по сторонах
- Hero: ~70vh, контент ліворуч 60%, preview праворуч 40% (на ≥1024px); стек на ≤1024px
- Sections: 96-128px вертикальний padding
- Mobile: повний стек, padding 16px (хоч mobile UI у v2.0 — landing ОБОВʼЯЗКОВО responsive bo SEO)

### Динаміка

- Hero — 1 субтильна анімація (живий cell-blink на превʼю), не carousel
- Scroll reveal на How it works — `opacity 0→1 + translateY(8px→0)` через `IntersectionObserver`, без сторонніх лібок
- Без parallax, без particle.js, без cursor-trail. Серйозний фінансовий тон.

---

## File plan

```
packages/web/src/
├── app/
│   ├── page.tsx                     ← НОВИЙ — Landing
│   ├── app/
│   │   └── page.tsx                 ← переніс зі старого app/page.tsx
│   └── layout.tsx                   ← оновити <title> якщо треба landing-specific metadata
├── components/landing/              ← НОВА папка
│   ├── LandingHeader.tsx            ← окремий від Heatmap header (без auth-pills)
│   ├── Hero.tsx
│   ├── LivePreview.tsx              ← варіант 2: <video> loop або варіант 3: <img>
│   ├── HowItWorks.tsx
│   ├── FeaturesGrid.tsx
│   ├── FinalCTA.tsx
│   └── LandingFooter.tsx
└── lib/
    └── landing-copy.ts              ← всі texti як константи, легше потім i18n-ити

public/landing/                       ← НОВА
├── preview-loop.webm                 ← screen capture хітмапи (~5MB cap)
├── preview-loop.mp4                  ← fallback для Safari
└── og-image.png                      ← 1200×630 для Twitter/OG share cards
```

### Чому окремий `LandingHeader`?

Поточний `Header.tsx` тісно звʼязаний з `Heatmap` props (mode, metric, range). На лендингу цих стейтів нема. Не натягуємо одне на інше — простіше форкнути 30-40 LOC компонент.

---

## Metadata + SEO

```tsx
// app/page.tsx (landing)
export const metadata: Metadata = {
  title: "Polymarket Whale Heatmap — Live trades from the top ~600 traders",
  description: "Real-time heatmap of every trade made by the top Polymarket whales. Categories × time, sub-second updates, no signup needed.",
  openGraph: {
    title: "Polymarket Whale Heatmap",
    description: "Real-time heatmap of where smart money moves on Polymarket.",
    images: ["/landing/og-image.png"],
    url: "https://oralab.xyz",
    type: "website",
  },
  twitter: { card: "summary_large_image", site: "@…" },
};

// app/app/page.tsx (existing heatmap, narrower meta)
export const metadata: Metadata = {
  title: "Heatmap · Polymarket Whale Signals",
};
```

OG image: 1200×630, темний фон, headline + frozen heatmap thumbnail. Можна згенерувати один раз через `next/og` route або просто експортнути з Figma.

---

## Open questions (відкласти до старту імплементації)

- **Бренд / логотип.** Зараз `Polymarket Signal Heatmap` у `<title>`, домен `oralab.xyz`. Лендинг — чудовий привід зафіксувати: чи це продукт під назвою `oralab`? `oralab Heatmap`? щось нове? Без цього не можна нормально намалювати logo + final CTA. Потрібне рішення перед стартом.
- **Live preview формат.** Animated loop vs iframe `?embed=1`. Я рекомендую loop спочатку, але якщо буде час на embed-режим у Heatmap — iframe виграє в актуальності. Залежить від того скільки годин кладемо у лендинг.
- **`/app/app/page.tsx` чи `/app/heatmap/page.tsx`?** Перший простіший і узгоджується з SaaS-патерном. Другий читабельніший в URL. Дрібниця, але треба обрати раз.
- **Скрін-капчура для preview-loop.** Який сценарій записуємо? Пропозиція: 7s loop = `[24h × volume L1] → click Crypto cell → drill L2 → click market cell → drill L3 з ProbabilityChart` — показує всю глибину за один прохід.

---

## Implementation order (коли стартанемо)

```
Day 1   Routing migration: app/page.tsx → app/app/page.tsx
        Smoke test: /app віддає поточну хітмапу 1:1, /api/* живе
Day 1   landing-copy.ts + LandingHeader + Hero (без preview asset)
Day 2   HowItWorks + FeaturesGrid + FinalCTA + LandingFooter
Day 2   Запис preview-loop, додавання у public/landing/
Day 3   metadata, OG image, scroll-reveal анімація, mobile responsive QA
Day 3   Lighthouse pass: LCP < 2.5s, no CLS, image dimensions wired
```

Бюджет: 2-3 робочі сесії. Якщо щось затягується — виносимо у v1.1 лендинга, не блокуємо приземлення.

---

## Out of scope для landing v1

- FAQ (повернемось коли будуть реальні питання з email/Discord)
- Pricing teaser (повернемось разом з v1.7 USDC monetization)
- Live stats counters (повернемось коли буде sustained traffic що дасть пристойні цифри)
- i18n / UA switcher
- Newsletter signup (без чіткої стратегії емейл-маркетингу не варто)
- Blog / changelog (поки нема що блогити)
- Customer logos / testimonials (нема юзерів-партнерів)

Все вище легко додається інкрементально — landing v1 тримаємо мінімальним.

# oraheatmap — Marketing Strategy v0.1

**Date:** 2026-05-06
**Author:** Claude (research) + Taras (review)
**Status:** Draft — built from competitive research + market data, not yet validated against real user/whale conversations.

---

## TL;DR

Простір переповнений (170+ tools, 20+ прямих конкурентів, 3 з них — теж heatmap-и).
ICE поклала $2B в Polymarket → **дані стали стратегічним активом**, не developer-сторонкою. Для нас це і добре (RTDS стабільніший), і небезпечно (Polymarket може будувати свій consumer-tier).

Перемогти "як ще один whale tracker" — неможливо. Тому позиціюємо не як whale tracker, а як **whale-filtered flow visualizer для prosumer-трейдерів**, з особистістю і чіткою POV. Wedge — щотижневий публічний звіт "що зробили топ-1000 whales" як дистрибуційний двигун, бо у нас немає базової аудиторії.

---

## 1. Reality check (що насправді показав research)

### Ринок — великий і росте
- **679–688K MAU** на Polymarket (Feb 2026), 3× за 6 місяців
- **$25.7B monthly volume** у березні 2026
- Single-day record: $425M (Feb 28, 2026)
- **r/Polymarket: 50K+ subs, Discord офіційний: 103K members**
- TAM реальний

### Конкуренція — пост-bubble, повністю commoditized
**Прямі тіл-on-tail конкуренти (whale trackers):**
- Polywhaler (#1 ranked, $10K threshold, freemium, "insider detection" як headline)
- **Unusual Predictions** (від Unusual Whales — 3M+ X followers!) — це найсерйозніший вхідний гравець, бо в них вбудована дистрибуція
- Kreo (Reddit-favorite all-in-one, TG/web/Chrome ext)
- PA Beacon (Polymarket-adjacent feel, 4 smart-money lists)
- PolymarketScan (**free forever** — це підлога ціни)
- Polysights, Polymarket Analytics, PolyAlertHub, OddAlerts, FirePolymarket, PolyInsider, PolyWallet, Whale Tracker Livid, Polytrackerbot, etc.

**Прямі heatmap-конкуренти (це шок):**
- **polyheatmap.xyz** — існує, але нульове обговорення в інтернеті (мертвий лонч)
- **Polytale** — heatmap, 5000+ markets
- **PolyHeat** (Chrome extension) — treemap-style, "no account, no paywall, no usage limits"

**Інституційний рівень закритий:**
- ICE × Polymarket Signals & Sentiment (Feb 2026) — нормалізовані дані для хедж-фондів. Туди не лізьмо. Але це validates: дані з Polymarket = реальна цінність.

### Що в просторі ВІДСУТНЄ (де можемо вибити позицію)
- Brand з характером — всі виглядають як generic SaaS dashboards
- **Whale-filtered** flow view (більшість heatmap-ів агрегують ВСІ трейди)
- **PATTERN / cyclical** аналіз ("коли whales зазвичай стріляють") — ніхто не рекламує
- **Convergence detection** як ВІЗУАЛЬНА фіча, не just notification
- Не-англомовні ринки (UA/RU/ESP) — повна порожнеча
- Цитація-ready public dataset / weekly reports — немає такого PM-equivalent-у "Glassnode Insights"

---

## 2. Diagnosis (що з цього випливає)

**(a) Ми не whale tracker.** "Whale tracker" — мертвий концепт через переповненість. Якщо позиціюємось так, нас з'їдять Unusual Predictions (3M followers) і Polywhaler (топ-1 brand recognition) без бою.

**(b) "Heatmap" саме по собі — теж недостатньо.** Три прямих heatmap-конкуренти, два з них безкоштовні. Треба додавати слово, яке РОЗВЕДЕ нас із ними. Кандидат: **whale-filtered**.

**(c) Free — це підлога.** PolymarketScan free forever. Платний tier у нас має сенс лише якщо free-features feel premium-tier у конкурентів.

**(d) Ми не маємо дистрибуції — це домінуюче обмеження.** Solo-builder без CT-аудиторії, без mailing list, без community. **Усі competitors з brand-traction (Polywhaler, Kreo, Unusual Whales) виграли або через крос-промо із cor product, або через рік+ founder-twitter.** Ми цього не маємо. Тому стратегія повинна бути дистрибуцієцентрична, не product-feature-центрична.

**(e) Полігон ризиків:**
- Polymarket × ICE будує consumer-tier analytics (24-month risk; зараз вони сфокусовані на institutional)
- Unusual Predictions додає heatmap (12-month risk; тривіально для них)
- RTDS закривають за TOS — risk LOW post-ICE (дані тепер стратегічно важливі для Polymarket)
- Whale-tracking категорія не конвертує retail (медіум — followerи історично програють. Mitigation: репозиція value на TIMING + ATTENTION, не "копіюй угоду")

---

## 3. Thesis

> **oraheatmap — це heatmap не маркетів, а конвенції 1,000 китів.
> Решта інструментів показує що робить натовп. Ми показуємо куди нахиляється кімната з найбільшими гаманцями.**

Це не product description. Це **позиціонування**, яке відрізняє нас від трьох прямих heatmap-конкурентів і від whale tracker-ів-без-візуалізації.

### Tagline-кандидати на A/B
1. *"The room of 1,000 whales, in one heatmap."*
2. *"See where the smart room is leaning."*
3. *"Polymarket flow, whale-filtered."*
4. *"All other heatmaps show you noise. We show you conviction."* ← найпровокаційніший, найбільше шансів on RT

---

## 4. The wedge

Single-prong: **щотижневий публічний звіт "What the top 1,000 whales did this week"** — Substack/Medium-style, безкоштовний, screenshot-heavy, SEO-tuned.

**Чому це wedge, а не просто "контент":**
- Зробити продукт-only стратегію без аудиторії = в порожнечу. Звіт створює AUDIENCE передовими циклами, поки продукт встигає визрівати.
- Звіт сам по собі — рідкісний об'єкт у PM-просторі. Аналог: Glassnode Insights для крипти. Поки нікого нема, зайняти позицію джерела даних → виграти earn-media і SEO long-tail.
- Кожен звіт = 1 screenshot який можна twit-нути → потенційний viral moment
- Звіт = матеріал для DM-стратегії: "ти потрапив у топ-10 нашого звіту цього тижня, ось скрін, можемо процитувати тебе?"
- Звіт = вічний SEO актив (на відміну від твітів, які гнуться через тиждень)

**Як виглядає Issue #1:**
- Заголовок: "What 1,000 Polymarket whales did the week of May X — and where retail missed it"
- Sections: Top 5 categories by whale flow / Convergence events (5+ whales same market) / Patterns by hour-of-day / Notable whale spotlight (з alias-у одного з топ-25 верифікованих)
- 4-6 heatmap screenshots з різних cuts
- Кінець: "see live → oralab.xyz · subscribe weekly"

---

## 5. 30-day plan

### Week 1 — Підготовка
- [ ] Repo cleanup: лендинг тепер веде на `/app`, але hero-copy оновлюємо під тезу ("Other heatmaps show what the crowd does…")
- [ ] Setup Substack або Ghost для weekly reports (Substack — дефолт, бо native subscriber growth)
- [ ] Налаштувати "Receipts" сторінку в продукті — last week's signals + how they resolved (трustbuilder для звітів)
- [ ] Запустити X-аккаунт продукту якщо ще нема, biо: "1,000-whale flow heatmap → oralab.xyz"

### Week 2 — Перший залп
- [ ] **Issue #1 weekly report** — публікація вівторок 14:00 UTC (peak crypto-twitter time)
- [ ] **r/Polymarket post** — value-first ("I tracked the top 1,000 whales for a week — here's what surprised me"), посилання на report у коментах не в тілі
- [ ] **Twitter thread** — 8-12 твітів, 1 фінальний з посиланням
- [ ] **DM-хвиля 1**: 5 топ-3 verified whales + 2 топ-non-verified (Domahhhh, Car, MrOzi, debased_PM, friendlyping). Pitch: "тебе процитували/протегали в звіті, ось скрін, можна процитувати?". Vanity hook замість utility hook.

### Week 3 — Цикл і перші уроки
- [ ] **Issue #2** — вибрати кут із Issue #1 що залетів найкраще, поглибити
- [ ] **PM newsletter outreach**: NewsPoly, news.polymarket.com — pitch як гостьовий контент
- [ ] **DM-хвиля 2**: ще 5 китів з list-у, тестуємо a/b-формулювання
- [ ] Метрики: subs growth, X follower growth, oralab.xyz unique visitors, signups

### Week 4 — Подвійна ставка на що залетіло
- [ ] **Issue #3** — поглиблюємо найкращий формат
- [ ] **Discord-стратегія**: вступаємо в офіційний Polymarket Discord (103K), у PolyZone/PolyToolz/PolyOdds, тільки value-add постимо (без promo) → перші органічні DM-и про наш продукт
- [ ] **Огляд першого місяця** — open-data dump: оприлюднюємо weekly aggregates у GitHub. Citation-bait, link-juice, builder-credibility.

**KPI на 30 днів (вистачить для go/no-go):**
- 200+ subs на Substack
- 100+ X followers
- 5,000+ unique visitors на /app
- 50+ signups (auth-tier)
- 1+ whale RT/quote (якщо 0 — стратегія DM-feature не працює, перепакуємо)

---

## 6. Anti-strategy (що ми НЕ робимо)

- **Не позиціонуємо як whale tracker** — Polywhaler / Unusual Predictions виграють по brand recognition. Ми = whale-filtered flow.
- **Не змагаємось на insider detection** — Polywhaler і UW займаються цим роками, у них ML моделі.
- **Не будуємо Telegram alert bot до того, як wedge почне працювати** — commodity feature, всі мають. Не моат.
- **Не платимо за рекламу в перші 90 днів** — без product-market fit signal це -ROI. Спочатку organic + earn-media.
- **Не цілимо інституційний рівень** — ICE Signals & Sentiment закрив цей шлях. Наш ринок — prosumer trader $1K-$50K positions.
- **Не пишемо generic content** ("5 ways to win on Polymarket") — без аудиторії = у порожнечу. Тільки proprietary-data-driven content (наші числа, наші screenshot-и).
- **Не запускаємо Pro tier до Issue #6** — спочатку треба free-tier що відчувається сильніше за конкурентів. Pro можна вмикати коли є 500+ авторизованих юзерів.

---

## 7. Open questions для Taras

1. **Готовність писати щотижневий звіт.** Це не AI auto-publish — потрібен POV + редактура. Я можу драфтити, ти редагуєш. Реалістично 2-3 години на тиждень. Згоден?
2. **DM-хвиля переробка.** Поточні драфти DM-ів треба переписати під vanity hook ("ти у звіті"). Чекаю go-ahead перш ніж переробляти.
3. **Бренд-голос.** Поточний tagline "Real-time whale activity heatmap" — generic. Ти готовий рухатись до більш opinionated формулювання ("All other heatmaps show noise. We show conviction.")?
4. **Substack vs Ghost vs власний blog на сайті.** Substack — швидше, native growth-loop, але робить тебе залежним. Власний blog = SEO-капітал залишається у нас. Я б ставив Substack для перших 3 issue (швидкість), потім міграція. Згоден?
5. **Оприлюднювати weekly raw data на GitHub** — це citation-magnet, але також give-away. Ризики: конкуренти крадуть. Користь: builder-credibility, link-juice. Я б оприлюднював aggregates (не raw trades), щоб не дати конкурентам drop-in dataset. Думка?

---

## 8. Risks і коли зупинятись

| Ризик | Сигнал | Що робимо |
|-------|--------|-----------|
| Polymarket native consumer analytics | Polymarket анонсує "Pulse" або similar consumer-tier | Pivot до Telegram-first або niche category |
| Unusual Predictions додає heatmap | UW Twitter announce | Switch wedge на PATTERN-mode (timing-tool) |
| 30 днів — нуль subscriber'ів | <50 Substack subs | Перевірити: чи це проблема бренду чи дистрибуції? Якщо бренд — переформатувати позиціонування. Якщо дистрибуція — paid ads test. |
| 60 днів — нуль whale RT | Жоден з 25 DM-ів не дав public mention | Vanity-hook не працює; перейти на trade-execution утиліту або niche category |
| 90 днів — конверсія в Pro <1% (з auth-юзерів) | Free-tier надто сильний | Перерозподілити фічі: жорсткіший gate на L3/PATTERN |

---

## 9. References

Конкурентний краєвид (research May 2026):

- [Polywhaler](https://www.polywhaler.com/) — #1 ranked, $10K threshold, free + Pro
- [PolymarketScan](https://polymarketscan.org/whales) — free forever
- [Unusual Predictions / Unusual Whales](https://unusualwhales.com/predictions) — 3M+ X followers
- [PA Beacon](https://www.panewslab.com/en/articles/019d8aaa-fffe-73b2-b04f-fc1ac7a2fe27) — 4 smart money lists
- [Polysights](https://polymark.et/product/polysights) — AI-powered, 30+ metrics
- [Polyheatmap.xyz](https://polyheatmap.xyz/) — direct heatmap competitor (no traction)
- [Polytale](https://phemex.com/news/article/polytale-launches-realtime-heatmap-for-polymarket-traders-60138) — heatmap, 5000+ markets
- [PolyHeat Chrome extension](https://chromewebstore.google.com/detail/polyheat-%E2%80%94-polymarket-hea/jadpnhbdcoiobigopfbkakcdacomopcg) — treemap, free
- [pm.wiki tool ranking](https://pm.wiki/learn/best-polymarket-whale-trackers)
- [Awesome Prediction Market Tools (GitHub)](https://github.com/aarora4/Awesome-Prediction-Market-Tools)

Market data:
- [Polymarket 688K MAU (Feb 2026)](https://phemex.com/news/article/polymarket-achieves-record-688k-monthly-active-users-61052)
- [Polymarket $25.7B monthly volume Q1 2026](https://www.mexc.com/news/1062153)
- [ICE invests $2B in Polymarket](https://defirate.com/news/ice-posts-record-earnings-doubles-down-polymarket-data-onchain-markets/)
- [ICE Polymarket Signals & Sentiment launch](https://www.businesswire.com/news/home/20260211340324/en/ICE-Launches-Polymarket-Signals-and-Sentiment-Tool-Turning-Crowd-Sourced-Dynamic-Views-into-Market-Opportunities)

Community:
- [Polymarket Discord (103K members)](https://discord.com/invite/polymarket)
- r/Polymarket (50K+ subs)

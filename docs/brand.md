# oralab — Brand Guidelines v1.0

**Compiled:** 2026-05-06
**Source of truth for:** all marketing assets, social images, landing copy, partnership materials, ad creative.

> If this doc says one thing and the live product token files (`packages/web/src/lib/tokens.ts`, `tailwind.config.ts`) say another — **the token files win**. Update this doc to match, never the reverse.

---

## 0. Brand essence

> oralab is the heatmap of conviction for 10,000+ Polymarket whales. Every other tool shows you the noise. We show you where the room with the biggest wallets is leaning.

Не whale tracker. Не аналітичний дашборд. Це **візуалізація flow** — категорія/час/метрика, з drill-down до конкретної клітинки і кита. Все інше будуємо навколо цієї тези.

---

## 1. Naming

| Term | Use it for | Capitalization |
|------|-----------|---------------|
| **oralab** | Company / parent brand | always lowercase |
| **oraheatmap** | Product (this app) | always lowercase |
| **oralab.xyz** | The domain / public URL | always lowercase, never `https://www.` |
| **Polymarket Heatmap** | Plain-English descriptor for SEO/intros | Title Case |

**Never write:** Oralab, ORALAB, OraLab, OraHeatmap, ORAHeatmap, www.oralab.xyz.

When introducing on cold surfaces (cold DM, X bio, business cards): **`oralab — Polymarket whale flow heatmap`** is the canonical lockup.

---

## 2. Logo system

### Marks

| File | When to use |
|------|------------|
| `packages/web/public/logo/logo.svg` | Mark only (7-tile heatmap pattern). Use when space is tight (favicon, small avatar, mobile nav). |
| `packages/web/public/logo/logo-wordmark.svg` | Mark + "oralab" wordmark. Use as default lockup in headers and most touchpoints. |
| `packages/web/public/logo/logo-full.svg` | Mark + "oralab" + "POLYMARKET HEATMAP" subtitle. Use on landing hero, email signatures, when audience may not know what oralab is. |
| `packages/web/public/logo/avatar-dark.svg` (dark bg) and `avatar-light.svg` (light bg) | Social profile avatars (400×400 padded). |
| `packages/web/public/logo/twitter-banner.svg` (1500×500) | X header. |
| `packages/web/public/logo/ad-creative.svg` (1200×675) | Paid ad / OG-card template. |

### The mark itself

7 rounded-rect tiles (`rx=2`) arranged as an asymmetric 3×3 heatmap pattern (two cells empty), tiles in 4 brand colors. The shape **is** a tiny heatmap — that's the entire point. Don't redraw, don't recolor, don't reflow.

### Clear space + minimum size

- **Clear space:** at least one tile-width of empty space on every side of the mark.
- **Minimum size:** mark only ≥ 24px square; full lockup ≥ 120px wide. Below that the subtitle stops being legible — drop down to mark-only.

### Color modes

- **Dark surfaces** (default — our entire product): use `currentColor` text rendered as `#e6edf3` (TOKENS.text). The mark stays in its native colors.
- **Light surfaces** (rare — landing on white, partner co-mark): use `currentColor` text rendered as `#0d1117` (TOKENS.bg). Mark stays in native colors.

---

## 3. Color palette

Canonical source: `packages/web/src/lib/tokens.ts`. Reproduced here for designers without code access.

### Surfaces

| Token | Hex | Use |
|-------|------|-----|
| `bg` | `#0d1117` | Primary dark background. Default everywhere. |
| `panel` | `#161b22` | Card / panel surface, one step lighter than `bg`. |
| `panel2` | `#1c2128` | Slightly lighter still — popovers, drawers, hover-elevated panels. |
| `border` | `#21262d` | Default 1px border between panels. |
| `borderHi` | `#30363d` | Higher-emphasis border (focused state, hovered card). |

### Text

| Token | Hex | Use |
|-------|------|-----|
| `text` | `#e6edf3` | Primary text. All headlines, body. |
| `textSec` | `#7d8590` | Secondary (subtitles, meta, captions). |
| `textMuted` | `#8b949e` | Muted (placeholder, disabled). |

### Brand / data colors

| Token | Hex | Brand role | Data role |
|-------|------|------------|-----------|
| `pos` (primary green) | `#3fb950` | Brand primary. Mark tile color. CTA. PnL positive headline. | "PnL up" cells, success states |
| `posDim` | `#238636` | Mark tile (dimmer green). | Mid-PnL gradient stop |
| `posDeep` | `#2ea043` | Mark tile (medium green). | Lower-PnL gradient stop |
| `accent` (yellow) | `#f0b429` | Mark tile (yellow). Volume metric color. | Volume cells, "active" markers |
| `neg` (red) | `#f85149` | Mark tile (red). Loss / negative. | "PnL down" cells, error |
| `negDeep` | `#da3633` | Deep red, escalation. | Deeper-loss gradient stop |
| `link` | `#58a6ff` | Hyperlinks only. | Selectable text |

### Color usage rules

- **Background is always dark** (`bg`). We are not a light-mode brand. Light variants exist only for partner co-marks where light is unavoidable.
- **Yellow `accent` = VOLUME metric** in any heatmap rendering. Never use yellow for PnL.
- **Green `pos` = PnL positive**. Never use green for VOLUME.
- **Red `neg` = PnL negative**. Never use red for VOLUME or trade count.
- **Blue `link` is reserved for hyperlinks.** Don't use it for data.
- The 4 mark colors (`pos`, `posDim`, `accent`, `neg`) appearing together = brand signal. Don't break the set.

---

## 4. Typography

### Type stack

| Role | Font | Stack | Weight |
|------|------|-------|--------|
| Display / brand wordmark | **Space Grotesk** | `'Space Grotesk', 'Helvetica Neue', Arial, sans-serif` | 700 only |
| UI body | System sans | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | 400 / 500 / 600 / 700 |
| Numbers, code, labels | System mono | `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace` | 400 / 500 / 600 / 700 |

Marketing assets (tweet images, OG cards, ad creatives) use **Space Grotesk** at 300/500/700 weights for both headline and body. The TTFs are checked into `marketing-assets/fonts/SpaceGrotesk-{300|400|500|600|700}.ttf`.

### Brand wordmark specifics

- "oralab" word: Space Grotesk **700**, letter-spacing **-1.9px** at 48px size (scales linearly: -9px at 200px).
- Heavy negative tracking is intentional. It's how the wordmark is recognised.
- Subtitle "POLYMARKET HEATMAP": Space Grotesk **700**, all caps, letter-spacing **-0.3px**, 50% opacity.

### Hierarchy in marketing assets

| Element | Size (at 2400px-wide canvas) | Weight | Color |
|---------|------------------------------|--------|-------|
| Hero number ("$2.2M") | 140-200pt | 700 | `pos` (green) |
| Headline | 80-120pt | 700 | `text` |
| Headline accent | 80-120pt | 700 | `pos` (highlight word) |
| Section label ("VOLUME", "PnL") | 60-70pt | 700 | metric color |
| Caption | 32-40pt | 500 | `textSec` |
| URL / CTA | 36-50pt | 700 | `pos` |
| Watermark / footer brand | 28-34pt | 500 | `textMuted` |

---

## 5. Voice & tone

The product talks like a **builder, not a marketer**. Concrete > hyped. Specific numbers > round claims. Provocative > polite when there's a real point.

### Voice principles (in order of priority)

1. **Specificity over generality.** "10,451 wallets" beats "1000+". "$2.2M in 2 hours" beats "huge volume".
2. **Provocation over politeness.** "All other heatmaps show you noise. We show you conviction." beats "A real-time visualization tool for prediction-market traders."
3. **Builder energy over marketer fluff.** "We turned on tracking 3 days ago" beats "Introducing oralab, the next generation of…"
4. **Numbers as drama.** Big numbers go in big type. Always. Lead with the number.
5. **Less is more.** No emoji-spam. Max one emoji per post if any. No exclamation marks.

### Vocabulary rules

| Use | Avoid |
|-----|-------|
| "whale-filtered flow" | "whale tracker" |
| "the room", "the room of 10,000+ wallets" | "smart money traders" |
| "conviction", "where size is leaning" | "alpha", "edge" (overused on CT) |
| "burst", "cell goes vertical" | "spike", "rally" |
| "cell", "row", "drill-down" | "data point", "visualization" |
| "Polymarket leaderboard wallets" | "top traders" |

### Tagline canon

Primary: **"All other heatmaps show you noise. We show you conviction."**

Backup variants:
- *"Every wallet on Polymarket's leaderboards, in one heatmap."*
- *"Polymarket whale flow, real-time."*
- *"See where the smart room is leaning."*

### What we never say

- "Game-changer", "disrupt", "alpha unlocked"
- "Best-in-class", "world-class"
- Anything followed by 🚀 / 💎 / 🐋 / 🔥 emoji-spam
- "The Bloomberg terminal of X" (every product says this)
- Vague claims with no number to back them up

---

## 6. Imagery & marketing-asset style

All marketing images (X tweets, OG cards, ads, landing screenshots) follow one visual recipe.

### Recipe (canvas)

- **Aspect ratio:** 16:10 (~1.6) for X horizontal, square 1:1 for OG, 4:5 (~0.8) for IG. **Never go portrait** — Twitter butchers it.
- **Background:** solid `bg` (`#0d1117`). No gradients, no noise textures.
- **Padding:** ≥ 80px on every edge at 2400px-wide canvas.
- **Logo:** `logo-full.svg` (dark variant) top-left, height 100-130px at 2400px-wide. Subtitle below in `textSec`.

### Recipe (data viz)

- Heatmaps screenshot the actual product UI when possible. Don't fake the data.
- **Categories column** sits in the middle when comparing two metrics (volume vs PnL), or on the left for single-metric views.
- **Highlights** = green rectangle outline (`pos` at full opacity), glow blur 8-12px. Never circles.
- **Callouts** = thin 2px line + small label in `text` color, font Space Grotesk 500 at 28-32pt.

### Recipe (text overlay)

- Hero number always in metric color (green for PnL, yellow for volume, red for loss).
- Headlines use mixed white + green emphasis word ("Whale activity is steady. **Whale alpha isn't.**")
- No drop shadows. No outer glows on text. No 3D effects.
- Captions in `textSec` (`#7d8590`) at 32-36pt, never below 28pt.

### What to never include in marketing images

- Watermarks at the bottom (the product name should be top-left only)
- Stock photography of "traders looking at screens"
- Bull/bear/whale emoji art (we are *the* whale tool — don't be derivative)
- Mockup of phones/laptops with our app inside (cliché)
- "Coming soon" badges (just ship)

---

## 7. Asset library

All canonical assets live in the repo. Don't copy them into Figma or Notion — link to GitHub raw URLs.

### Logos

```
packages/web/public/logo/
├── logo.svg              ← mark only (7 tiles)
├── logo-wordmark.svg     ← mark + "oralab"
├── logo-full.svg         ← mark + "oralab" + "POLYMARKET HEATMAP"
├── logo-{64,128,256,512,1024}.png  ← mark only PNG fallbacks
├── avatar-dark.svg       ← 400×400 social avatar (dark bg)
├── avatar-light.svg      ← 400×400 social avatar (light bg)
├── twitter-banner.svg    ← 1500×500 X header
└── ad-creative.svg       ← 1200×675 ad / OG card template
```

### Marketing asset workspace

```
marketing-assets/
├── raw/                  ← raw screenshots dropped by Taras (gitignored)
├── fonts/                ← Space Grotesk TTFs (300-700) + dark logo PNG
│   ├── SpaceGrotesk-{300,400,500,600,700}.ttf
│   ├── logo-full-dark.svg     ← brand-doc-recommended dark variant
│   └── logo-content-hires.png ← 2000px-wide rendered, content-cropped
└── output/               ← generated tweet images, banners, etc
```

### Render the dark-theme logo (one-liner)

```bash
sed 's/fill="currentColor"/fill="#e6edf3"/g' \
  packages/web/public/logo/logo-full.svg \
  | python3 -c "import sys, cairosvg; cairosvg.svg2png(bytestring=sys.stdin.read(), write_to='/tmp/logo-dark.png', output_width=2000)"
```

---

## 8. Social profile setup

| Platform | Field | Value |
|----------|-------|-------|
| X (Twitter) | Handle | (TBD — likely `@oralab_xyz` or `@oraheatmap`, check availability) |
| X | Display name | `oralab` |
| X | Bio | `whale-filtered Polymarket flow heatmap → oralab.xyz` |
| X | Header image | `twitter-banner.svg` rendered to PNG 1500×500 |
| X | Avatar | `avatar-dark.svg` rendered to PNG 400×400 |
| X | Pinned tweet | Issue #1 thread (rotates weekly) |
| Discord | Avatar | `avatar-dark.svg` |
| Telegram (when launched) | Avatar | `avatar-dark.svg` |
| GitHub org avatar | | `avatar-dark.svg` |

---

## 9. Marketing copy templates

### Tweet thread opener (template)

```
[hook line — 1 sentence with a number]

[setup — 1-2 sentences contextualizing]

[reveal/punchline — 1 sentence]

[image]
```

### DM-to-whale (vanity hook)

```
hey {alias} — featured your wallet in our Polymarket whale-flow launch
thread today. {N trades, +$Xk PnL on Y-Z window}. screenshot ↓

built oralab.xyz to catch these bursts. would love your read on it
```

### Pitch to PM newsletter / journalist

```
Subject: oralab — heatmap of Polymarket whale flow (10,451 wallets, real-time)

Hi {name}, we built a real-time heatmap that filters Polymarket trade
flow to the top 10,000+ leaderboard wallets, then shows where size is
concentrating across categories and time. It surfaced a $2.2M-in-2-hours
event last week — a Chelsea match — that didn't show up on any other
PM tracker.

Curious if it'd interest your readers. Happy to share a guest report
or just give you a walk-through. Live: oralab.xyz
```

---

## 10. Do / Don't

### Do

- Use `oralab` lowercase, every time
- Lead with specific numbers ("10,451", "$2.2M", "2 hours")
- Pair every claim with a screenshot from the product
- Use Space Grotesk 700 for any heading
- Pull colors from `tokens.ts`, never hex-eyeball them
- Show the product itself — heatmap-shaped imagery > stock photography

### Don't

- Use generic "real-time analytics dashboard" copy
- Capitalize the brand name
- Use emoji clusters or "🚀" energy
- Position as "another whale tracker"
- Promise things the product doesn't yet do (PATTERN, alerts, etc — until shipped)
- Add a watermark at the bottom of marketing images (the logo top-left does that job)
- Use light-mode backgrounds (`bg` is always `#0d1117` unless partner-coupled)

---

## 11. Updating this doc

This doc is canon **for marketing**. The tech canon is `tokens.ts`. When the two diverge, update *this* doc, never the code.

Triggers for revisiting:
- New social channel goes live (TG, Discord launch, etc)
- New asset class ships (alerts banner, PATTERN-mode hero image)
- A copy approach validates strongly (one tagline outperforms others) → promote it to "primary"
- Brand color ever changes (it shouldn't, but if `tokens.ts` shifts a hex, mirror it)

Don't waste effort on bugfixes, font-weight tweaks, or per-asset adjustments — those go in the assets themselves.

# Mode: ANOMALY

> Статистичний радар. Прибираємо все звичайне, лишаємо тільки те що відхилилось.
> Status: planning, idea-level. UI design — окремий пас.

---

## Idea

Користувач відкриває дашборд з обмеженою увагою. У режимі ANOMALY вся сітка стає тихою, і видно тільки те що дійсно vyhodyt за нормальний коридор. Як медичний моніторинг: рівна лінія = все ок. Спайк = подивись.

---

## Що таке "аномалія"

Cell вважається аномальним коли поточне значення статистично відхилилось від його ж власного історичного норму. Не "more than threshold X" в абсолютних числах, а "out of pattern".

Базис — той самий PATTERN baseline що вже є (rolling 30-day, normalized по hour-of-day і day-of-week). Аномалія = z-score проти цього baseline ≥ певний поріг (default `|z| ≥ 2σ`).

Це означає що ми порівнюємо "Politics × вівторок 14:25 сьогодні" не з "Politics в середньому", а з "Politics × вівторок 14:25 за останні 30 days". Cell аномальний коли ВЛАСНА поведінка вибилась з власного звичайного паттерну.

---

## Чотири осі що можуть бути аномальними

Cell може відхилитись від норми по різних метриках одночасно:

1. **Volume** — кількість/розмір трейдів
2. **Whale-count** — скільки унікальних whales зайшли в цю cell
3. **Convergence** — наскільки whales одностайні (всі BUY чи всі SELL)
4. **Win-rate** — середній win-rate involved whales

Cell вважається anomaly якщо хоча б одна вісь перевищує threshold. Часто декілька осей одночасно — це нормально (high convergence + high whale-count + high volume часто корелюють).

---

## Чому це сильно

Усуває noise від "Politics завжди гарячий о 14:00" — це врахується у baseline. Лишається тільки те що is **truly unusual** для цього cell у цей час доби. Користувач не вгадує, статистика робить роботу за нього.

10K whales з активною торгівлею перетворюють звичайний heatmap на хаос. ANOMALY mode — це фільтр який каже "те що ти бачиш — насправді нове" замість "тут просто завжди жвавно".

---

## Open conceptual questions

### Що рахується "baseline" якщо cell — нова categorie без 30d історії?

Опції:
- Сховати такі cells з ANOMALY view взагалі.
- Використати коротший window (7d) поки набереться 30d.
- Показувати з special "new" tag замість sigma value.

### Чи рахуємо negative anomalies (unusual quiet)?

`−3σ Crypto 03:30` = аномально тихо. Це теж сигнал — щось пішло не так з активністю. Концептуально — так, але візуально quiet cells вже dim.

### Per-axis threshold чи single global?

Один global `≥2σ` для всіх 4 осей простіше для onboarding. Per-axis thresholds (наприклад convergence sensitive, win-rate strict) — точніше але складніше пояснити.

### Як обʼєднуємо multi-axis на одну cell?

Якщо cell аномальна по volume, convergence, whale-count одночасно — який вимір є "primary"? Найвищий |z|? Predefined hierarchy? Це впливає на те як cell читається при швидкому скані.

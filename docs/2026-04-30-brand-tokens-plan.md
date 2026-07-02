# Afina — внедрить бренд (тёплый dark + редкий жёлтый акцент)

## Context

`/impeccable critique` показал: продукт **компетентный, но анонимный** (24/40, AI-slop 6.5/10). Главная находка — `#FFEC00` отсутствует в коде целиком, нет токена `--brand`, нейтрали в `globals.css` это чистый greyscale (`oklch(... 0 0)` с хромой 0). Активные состояния (текущий шаг wizard, primary CTA «Запустить», selected scenario/trigger/segment, активный sidebar nav) везде используют белый-на-чёрном — продукт читается как «shadcn-default с русским текстом», а не как Afina.

PRODUCT.md фиксирует:
- Тёплая тёмная: нейтрали тинтятся в hue ≈102° (chroma 0.005–0.01)
- Брендовый жёлтый `#FFEC00` ≈ `oklch(0.943 0.196 102.85)`
- **Принцип 2:** жёлтый — редкий сигнал. Не больше одного жёлтого элемента на экране. Только: текущий шаг wizard / primary CTA / выбранный сегмент-триггер / маскот.

Пользователь зафиксировал scope:
- **Приоритет:** P0 цвет/токены (минимальными средствами максимальный сдвиг)
- **Тон:** узнаваемо-Afina (не громче, а характернее)
- **Off-limits:** welcome composition, step 2 структура — копирайтинг и активные состояния трогаем

Цель: за один проход превратить код из «анонимного» в узнаваемо-Afina, без структурных правок.

## Pre-flight: worktree (mandatory per AGENTS.md)

```bash
git worktree add .worktrees/brand-tokens -b feature/brand-tokens main
cd .worktrees/brand-tokens
npm install
```

Все правки внутри `.worktrees/brand-tokens`. В main не выливать — мерж по решению пользователя (или PR).

Если другой агент держит `next dev` на :3000, использовать `-p 3001` для локальной проверки.

---

## Step 1 — Расширить токены в `src/app/globals.css`

### Тёплая тьма: тинт нейтралей в hue 102°

Заменить в блоке `.dark { ... }` (lines 86–118):

```css
.dark {
  --background: oklch(0.155 0.005 102);          /* было: oklch(0.145 0 0) */
  --foreground: oklch(0.97 0.004 102);           /* было: oklch(0.985 0 0) */
  --card: oklch(0.205 0.006 102);                /* было: oklch(0.205 0 0) */
  --card-foreground: oklch(0.97 0.004 102);
  --popover: oklch(0.215 0.006 102);
  --popover-foreground: oklch(0.97 0.004 102);
  --primary: oklch(0.92 0.005 102);              /* было: oklch(0.922 0 0) — neutral primary, не жёлтый */
  --primary-foreground: oklch(0.205 0.006 102);
  --secondary: oklch(0.265 0.006 102);
  --secondary-foreground: oklch(0.97 0.004 102);
  --muted: oklch(0.265 0.006 102);
  --muted-foreground: oklch(0.7 0.005 102);
  --accent: oklch(0.265 0.006 102);
  --accent-foreground: oklch(0.97 0.004 102);
  --border: oklch(1 0.006 102 / 10%);
  --input: oklch(1 0.006 102 / 14%);
  --ring: oklch(0.55 0.005 102);
  --sidebar: oklch(0.205 0.006 102);
  --sidebar-foreground: oklch(0.97 0.004 102);
  --sidebar-accent: oklch(0.265 0.006 102);
  --sidebar-accent-foreground: oklch(0.97 0.004 102);
  --sidebar-border: oklch(1 0.006 102 / 10%);
  --sidebar-ring: oklch(0.55 0.005 102);
  /* остальное (destructive, chart-*, sidebar-primary) оставить как есть */
}
```

Хрома 0.004–0.006 — на грани ощутимого, но даёт подсознательную когезию с жёлтым акцентом. Не делает фон «грязным».

### Добавить бренд-токены

После `:root` блока (после line 84) добавить новый блок, плюс продублировать в `.dark` для чистоты:

```css
:root {
  /* …existing… */
  --brand: oklch(0.943 0.196 102.85);
  --brand-foreground: oklch(0.205 0.006 102);
  --brand-muted: oklch(0.943 0.196 102.85 / 14%);   /* для очень мягких подсветок */
}

.dark {
  /* …existing (warm)… */
  --brand: oklch(0.943 0.196 102.85);
  --brand-foreground: oklch(0.205 0.006 102);
  --brand-muted: oklch(0.943 0.196 102.85 / 14%);
}
```

### Зарегистрировать `bg-brand` / `text-brand` / `border-brand` для Tailwind v4

В `@theme inline` (lines 7–49) добавить:

```css
--color-brand: var(--brand);
--color-brand-foreground: var(--brand-foreground);
--color-brand-muted: var(--brand-muted);
```

Tailwind v4 после этого автоматически даст утилиты `bg-brand`, `text-brand`, `border-brand`, `ring-brand`, `bg-brand-muted` и т.д.

---

## Step 2 — Перенаправить активные состояния (минимальный, дисциплинированный набор)

**Правило:** один жёлтый элемент на экран. Иерархия выбора:
- **Wizard step screens (1, 2, 3, 4, 5):** жёлтое = stepper active circle. Selected карточки получают мягкий `border-brand/40` без насыщенного фона — ringless tint.
- **Step 6 Summary (commit money):** жёлтое = «Запустить» CTA. Stepper active при этом тоже жёлтый, но визуальная гравитация переходит к кнопке (peak-end момент важнее nav-маркера).
- **Step 8 Result:** жёлтое = большая цифра «найдено сигналов» (peak-end).
- **Welcome:** off-limits — composition не трогаем.

### 2.1 — Stepper active circle ✅ **ДА**
**File:** `src/sections/signals/campaign-stepper.tsx`
**Lines:** 50–57

Заменить:
```tsx
isActive &&
  "border-primary bg-background text-primary ring-2 ring-primary/20",
```
на:
```tsx
isActive &&
  "border-brand bg-brand text-brand-foreground ring-2 ring-brand/25",
```

Connector lines (lines 45, 71) и hover `hover:text-primary` (line 85) **не трогаем** — они должны оставаться нейтральными, иначе вся ось stepper'а станет жёлтой.

### 2.2 — Step 5 budget card: вытащить жёлтый из 4% в полноценную presence
**File:** `src/sections/signals/steps/step-5-limit.tsx`
**Lines:** 98, 137, 212

Заменить (строки 98 и 137 одинаковые — `replace_all`):
```tsx
"border-yellow-400/50 bg-yellow-400/[0.04]"
```
на:
```tsx
"border-brand/60 bg-brand-muted"
```

`RadioDot` active (line 212):
```tsx
"border-yellow-400 bg-yellow-400"
```
→
```tsx
"border-foreground bg-foreground"
```

Намеренно НЕ делаем dot жёлтой. Stepper уже несёт жёлтый сигнал как nav-маркер; саму карточку «Рекомендуемая» подсвечиваем тонким `border-brand/50 bg-brand-muted` (тинт, не saturated). Активная dot читается как «бинарный selected indicator» — нейтрально-светлая, чтобы не дублировать saturated жёлтый внутри content-зоны.

### 2.3 — Selected scenario card: subtle brand ring, не насыщенный
**File:** `src/sections/signals/steps/step-1-scenario.tsx`
**Line:** 69

Заменить:
```tsx
visualScenario === s.id
  ? "border-primary bg-accent ring-1 ring-primary"
  : "border-border bg-card hover:bg-accent hover:border-border"
```
на:
```tsx
visualScenario === s.id
  ? "border-brand/50 bg-brand-muted"
  : "border-border bg-card hover:bg-accent hover:border-border"
```

Убираем `ring` чтобы не было «лазерного» обводящего эффекта — мягкий тинт + бордер достаточно. Stepper при этом остаётся доминирующей жёлтой точкой.

### 2.4 — Selected interest chip + selected trigger card
**File:** `src/sections/signals/steps/step-2-interests.tsx`

`InterestChip` (lines 88–89):
```tsx
selected
  ? "border-primary bg-accent text-foreground ring-1 ring-primary"
  : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
```
→
```tsx
selected
  ? "border-brand/50 bg-brand-muted text-foreground"
  : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
```

`TriggerCard` (lines 169–172):
```tsx
selected
  ? "border-primary bg-accent/40 ring-1 ring-primary"
  : "border-border bg-card hover:border-primary/50",
isEditing && "ring-2 ring-primary/60",
highlight && "ring-2 ring-amber-400/70 transition-shadow"
```
→
```tsx
selected
  ? "border-brand/50 bg-brand-muted"
  : "border-border bg-card hover:border-brand/30",
isEditing && "ring-2 ring-brand/50",
highlight && "ring-2 ring-brand transition-shadow"
```

Trigger checkbox box (lines 184–187): чекбокс остаётся нейтральным `border-primary bg-primary text-primary-foreground` — это микро-элемент, его жёлтым не делаем (был бы 2-й жёлтый плюс-минус).

### 2.5 — Selected segment card
**File:** `src/sections/signals/steps/step-3-segments.tsx`
**Lines:** 62–63

```tsx
isSelected
  ? "border-primary bg-accent ring-1 ring-primary"
  : "border-border bg-card hover:bg-accent"
```
→
```tsx
isSelected
  ? "border-brand/50 bg-brand-muted"
  : "border-border bg-card hover:bg-accent"
```

Inner checkbox (lines 69–73) оставляем нейтральным (`border-primary bg-primary`).

### 2.6 — Step 6 Summary: жёлтая «Запустить» CTA (peak commitment)
**File:** `src/sections/signals/steps/step-6-summary.tsx`
**Lines:** 165–167

Заменить:
```tsx
<Button onClick={() => onNext({})}>
  {enoughBalance ? "Запустить" : "Пополнить и запустить"}
</Button>
```
на:
```tsx
<Button
  onClick={() => onNext({})}
  className="bg-brand text-brand-foreground hover:bg-brand/90"
>
  {enoughBalance ? "Запустить" : "Пополнить и запустить"}
</Button>
```

Это **единственная** brand-кнопка в продукте. На остальных wizard-шагах «Далее» и «Продолжить» остаются дефолтным `bg-primary` (нейтрально-белый) — иначе stepper-жёлтый + кнопка-жёлтая = визуальная дрязги на каждом шаге.

### 2.7 — Step 8 Result: brand на peak-end big number
**File:** `src/sections/signals/steps/step-8-result.tsx`

Большое число «N сигналов найдено» получает `text-brand` (или underline-rule в brand). Точная строка определится при правке — открыть файл и найти hero-цифру.

Доп. опционально: маскот (`<MascotIcon />` 32px) появляется рядом с цифрой через motion fade-in delay 600ms. Это уже scope `/delight`, не цвета — **в этот проход не делаем**, оставляем след в follow-up.

### 2.8 — Sidebar active nav: тёплый, не жёлтый
**File:** `src/sections/shell/app-sidebar.tsx`
**Lines:** 81–86

Текущий `bg-accent text-accent-foreground` после warm-tinted `--accent` уже выглядит правильно — сам по себе теплеет благодаря step 1. **Дополнительных правок не требуется**, кроме одного решения:

Notifications badge (line 93): `bg-amber-500` — **не трогаем**. amber здесь = «есть событие требующее внимания», семантически это не brand-сигнал, а уведомление. Остаётся желтоватым, но химически другим (amber, не brand).

---

## Step 3 — Cleanups «amber делает работу yellow»

Эти правки **не переводят amber в brand** (amber — семантический warning, оставляем как есть). Но проверяем что нигде yellow-* tailwind palette не остался смешанным с новыми brand-классами.

### 3.1 — Удалить `border-yellow-400` / `bg-yellow-400` хвосты

Поиск:
```bash
grep -rn "yellow-400" src/
```

Все попадания заменить на `brand` эквиваленты (после step 5 правок не должно остаться).

### 3.2 — Status sky/amber/grey badges — вне scope этого прохода
**File:** `src/sections/signals/signal-card.tsx` lines 105–106 (sky-blue для processing — анти-референс cyan, но это семантический статус, не brand-токен).

Помечаю как follow-up, не трогаю в текущем PR.

### 3.3 — Trigger highlight `amber-400/70` уже переведён в step 2.4 на `ring-brand`.

---

## Step 4 — Verification

Внутри `.worktrees/brand-tokens`:

```bash
# Type-check
npx next lint --max-warnings 0
npx tsc --noEmit

# Build
npm run build
```

### Визуальная проверка (golden path)

```bash
npm run dev -- -p 3001
```

Открыть `http://localhost:3001` и пройти весь wizard:

1. **Welcome** — bg тёплый, не «графитовый» (subtle, но заметно). Layout не должен сдвинуться.
2. **Cabinet → Сигналы** — sidebar-active warm tinted (не cyan/grey-cold), notifications dot остался amber.
3. **Step 1 Scenario** — stepper кружок текущего шага = жёлтый. Selected scenario card = тонкий brand-ring + brand-muted bg, **не яркий жёлтый**. На экране 1 saturated жёлтый (stepper).
4. **Step 2 Interests** — stepper = жёлтый. Selected interest chip и trigger card = brand-muted (тонкие). Чекбоксы внутри триггера остаются нейтрально-белыми. На экране 1 saturated жёлтый.
5. **Step 3 Segments** — то же.
6. **Step 4 Upload** — без изменений.
7. **Step 5 Limit** — `Рекомендуемая` карточка теперь читается как brand-ring + lightly-tinted bg. RadioDot полностью жёлтый. Stepper жёлтый. На экране 2 жёлтых (RadioDot — внутри content, stepper — в nav-зоне). **Если визуально перегружено** — оставить RadioDot нейтральным `bg-primary`.
8. **Step 6 Summary** — stepper жёлтый (правый margin, nav-зона), **«Запустить» жёлтая** (центр content, action-зона). По букве PRODUCT.md это два saturated жёлтых на экране, что нарушает «≤1 жёлтый». **Зафиксированный компромисс:** на peak-commitment экране смысловые зоны ортогональны (nav vs. action), и оба нужны — пользователь должен одновременно видеть «я на финальном шаге» и «вот кнопка чтобы коммитить». Если визуально это конфликтует — fallback: на step 6 приглушить stepper-current до `bg-brand/50 ring-brand/15` (полу-saturated). Сначала смотрим как читается «по правилу» — только если плохо, применяем fallback.
9. **Step 7 Processing** — без изменений.
10. **Step 8 Result** — большая цифра в `text-brand`. Один жёлтый элемент.

### Visual regression checks

- Контраст «Далее»/«Продолжить» нейтральных кнопок — должен остаться достаточным после warm tint фона.
- Hover-эффекты на selected карточках не «вспыхивают» — `border-brand/30` на trigger hover должен быть мягче чем `border-brand/50` selected.
- В свету (`:root`) бренд-токены тоже должны работать (если светлая тема когда-нибудь активируется). Текущий код `globals.css:120-129` всегда добавляет `dark` класс, так что светлая ветка не активна — но `--brand` в `:root` пусть будет, чтобы не было `unset` при потенциальном hot-toggle.

---

## Out of scope (намеренно)

| Что | Почему отложено |
|---|---|
| Welcome composition (3 конкурирующих CTA) | Off-limits по решению пользователя |
| Step 2 структура (accordion для триггеров) | Off-limits по решению пользователя |
| Voice fixes («сгенерили», «в афина», step 1/2 subtitles) | Отдельная команда `/clarify`, не относится к токенам |
| Step 8 mascot fade-in beat | Отдельная команда `/delight`, motion-задача |
| Sky-blue status badges в signal-card | Семантические status цвета, не brand-токены — отдельный проход |
| `Math.random()` recommended budget на step 5 | Логика, не дизайн |
| Type-scale unification (3 разных H1) | Отдельная команда `/typeset` |

---

## Critical files

- `src/app/globals.css` — токены (Step 1)
- `src/sections/signals/campaign-stepper.tsx` — stepper active (Step 2.1)
- `src/sections/signals/steps/step-5-limit.tsx` — yellow card → brand (Step 2.2)
- `src/sections/signals/steps/step-1-scenario.tsx` — selected scenario (Step 2.3)
- `src/sections/signals/steps/step-2-interests.tsx` — interest chip + trigger card (Step 2.4)
- `src/sections/signals/steps/step-3-segments.tsx` — selected segment (Step 2.5)
- `src/sections/signals/steps/step-6-summary.tsx` — Запустить CTA (Step 2.6)
- `src/sections/signals/steps/step-8-result.tsx` — big number (Step 2.7)
- `src/sections/shell/app-sidebar.tsx` — visual check only (Step 2.8)

---

## Definition of done

- [ ] Worktree `.worktrees/brand-tokens` создан
- [ ] `--brand`, `--brand-foreground`, `--brand-muted` зарегистрированы в `:root` и `.dark`, и в `@theme inline`
- [ ] `.dark` нейтрали тинтятся в hue 102° (chroma 0.004–0.006)
- [ ] Stepper active circle = жёлтый
- [ ] Selected scenario / interest / trigger / segment карточки = `border-brand/50 bg-brand-muted` (тонкий тинт, не насыщенный)
- [ ] Step 5 budget card вытащен из 4% в полноценный brand-muted
- [ ] Step 6 «Запустить» = `bg-brand text-brand-foreground`
- [ ] Step 8 hero-число = `text-brand`
- [ ] Никаких `yellow-400` / `yellow-500` хвостов в `src/`
- [ ] `npx tsc --noEmit` чистый, `npm run build` чистый
- [ ] Визуально пройден весь wizard в локальном dev-сервере
- [ ] Принцип PRODUCT.md выполнен: на каждом экране ≤1 saturated жёлтый
- [ ] В main не залито; коммиты в feature-branch, дальше — решение пользователя

## Follow-ups (после этого PR)

- `/clarify` — voice (subtitles step 1/2, «в Афину», CTA-копирайт)
- `/delight` — Afina-моменты на step 8 (mascot beat) и AI-fill notification на step 2
- `/typeset` — unify type-scale (3 H1 → 1 system)
- `/distill` — welcome / step 2 (когда пользователь снимет off-limits)
- Re-run `/impeccable critique` чтобы увидеть подъём score

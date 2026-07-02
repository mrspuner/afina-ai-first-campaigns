# A2 + A3 — Бюджет кампании и стоимость коммуникаций

**Дата:** 2026-06-10
**Ветка:** `claude/campaign-budget-cost-njuidw`
**Статус:** утверждённый спек, готов к плану реализации.

## Контекст

Единая формула стоимости коммуникаций, считаемая из реального workflow
кампании и показанная в трёх местах:

1. **Нода коммуникации** — средняя стоимость одной отправки по каналу.
2. **Шапка workflow** — суммарная расчётная стоимость кампании + иконка
   афины, по клику ассистент объясняет расчёт.
3. **Экран оплаты** — разбивка по нодам + строка буфера на повторные
   коммуникации + итог как «Рекомендуемая» сумма.

AS IS: стоимости в нодах и шапке нет; экран оплаты использует случайную
`recommendCampaignBudget` (`Math.random`) и единственную константу
`COST_PER_TOUCH = 5`. Канал не учитывается, разбивки нет.

## Решения по открытым вопросам (подтверждено)

- **Мок-константы** — как в спеке: SMS 5 ₽, Email 1 ₽, Push 0,5 ₽, IVR 8 ₽;
  `DYNAMIC_RATE = 0.30`.
- **Деление split** — **по долям сегментов**: при `by === "segment"` охват
  делится пропорционально размерам сегментов из `signal.segments`. При
  `by === "random"` (и как fallback, если доли недоступны) — поровну.
- **Разбивка бюджета сигнала по сегментам** — отдельная задача, в этот
  скоуп **не входит**.

## Модель расчёта

Новый модуль `src/sections/campaigns/campaign-cost.ts`.

### Константы

```ts
export const UNIT_COST: Record<"sms" | "email" | "push" | "ivr", number> = {
  sms: 5, email: 1, push: 0.5, ivr: 8,
};
export const DYNAMIC_RATE = 0.30;
```

`web`-ноды (`storefront`, `landing`) и логические/конечные ноды стоимости
не несут.

### Аудитория

`N = signal.count`. Сегменты для деления split берутся из params ноды
`signal` в самом графе (`{ max, high, mid, low }`).

### Охват `reach(node)`

Граф — DAG. Обход в топологическом порядке от ноды `signal`:

- `signal`: `reach = N`, `dynamic = false`.
- Вклад ребра `s → t` зависит от типа источника `s`:
  - `split`: `B = число исходящих рёбер`.
    - `by === "segment"` и доли доступны: рёбра в порядке массива получают
      доли `[max, high, mid, low].slice(0, B)`, нормированные на их сумму.
      Если сумма ≤ 0 или `B > 4` — поровну `reach(s) / B`.
    - иначе (`random`): `reach(s) / B`.
  - `condition`: каждое исходящее ребро (YES/NO) → `DYNAMIC_RATE × reach(s)`.
  - все прочие (`signal`, `wait`, `merge`, comm, web, `success`, `end`):
    передают полный `reach(s)` дальше.
- `reach(t) = Σ вкладов входящих рёбер` (`merge` суммирует естественно).
- Охват округляется до целого для отображения и расчёта.

### Флаг `dynamic(node)`

`dynamic(t) = OR по входящим рёбрам (s → t) от (dynamic(s) || s.kind === "condition")`.
То есть нода динамическая, если хотя бы один путь от `signal` к ней проходит
через `condition`.

- **первичная** комм-нода: `dynamic === false`;
- **повторная** комм-нода: `dynamic === true`.

### Стоимость

```ts
computeReach(nodes, edges, N) →
  { reach: Record<string, number>, dynamic: Record<string, boolean> }

computeCampaignCost(nodes, edges, N) → {
  primary: number;   // Σ unit × reach по первичным комм-нодам
  repeat: number;    // Σ unit × reach по повторным комм-нодам
  total: number;     // primary + repeat
  lines: Array<{
    nodeId: string;
    channel: "sms" | "email" | "push" | "ivr";
    label: string;   // подпись ноды (sublabel ?? label)
    unit: number;
    reach: number;
    sum: number;     // round(unit × reach)
    isDynamic: boolean;
  }>;
  hasDynamic: boolean; // есть ли хоть одна повторная комм-нода
}
```

`line.sum = Math.round(unit × reach)`; `primary`/`repeat`/`total` —
суммы округлённых `sum`. `hasDynamic = lines.some(l => l.isDynamic)`.

### Контрольный пример («Первая сделка», N = 4000)

`signal → sms → condition(opened) → [YES: landing] / [NO: push]`:

- `sms` первичная: reach 4000, sum `5 × 4000 = 20000`.
- `push` повторная (за condition): reach `0.30 × 4000 = 1200`,
  sum `0.5 × 1200 = 600`.
- `landing` — web, без стоимости.
- `primary = 20000`, `repeat = 600`, `total = 20600`, `hasDynamic = true`.

### `estimateTouches`

Переносится в `campaign-cost.ts` (прогноз касаний для «своей суммы»).
Опорная стоимость касания — `UNIT_COST.sms` (5 ₽), что сохраняет прежнее
поведение и числа в тестах. `COST_PER_TOUCH` и `recommendCampaignBudget`
удаляются вместе со старым `campaign-payment-math.ts`.

## Тексты интерфейса

**Нода коммуникации** (readonly-строка): `Стоимость` → `≈ {unit} ₽ за отправку`
(0,5 форматируется как `0,5`).

**Шапка workflow:**
- Лейбл `Расчётная стоимость`, значение `≈ {total} ₽`, рядом иконка
  `/mascot-icon.svg`.
- Клик по иконке → ассистент (через тот же пайплайн, что node-context
  подсказки): эхо-вопрос пользователя + pending → ответ:
  > «Стоимость складывается из первичных коммуникаций ({primary} ₽) и
  > буфера на повторные, динамические коммуникации (+30%, {repeat} ₽).
  > Итог зависит от числа сигналов, каналов и того, сколько коммуникаций
  > в сценарии повторные.»

**Экран оплаты** (блок «Из чего складывается стоимость» над карточками сумм):
- Строка коммуникации: `{Канал} · {подпись} — {unit} ₽ × ~{reach} = {sum} ₽`
  (Канал: SMS / Email / Push / Звонок).
- Если `hasDynamic`: `Повторные коммуникации (+30% буфер): {repeat} ₽`.
- Карточка `Рекомендуемая` = `≈ {total} ₽`, подпись
  `Первичные {primary} ₽ + повторные {repeat} ₽`.
- Карточка `Своя сумма` — без изменений.

## Маппинг компонентов

- **`campaign-cost.ts`** (новый): `UNIT_COST`, `DYNAMIC_RATE`, `CHANNEL_LABEL`,
  `computeReach`, `computeCampaignCost`, `estimateTouches`. Чистые функции.
- **`campaign-cost.test.ts`** (новый): покрытие reach/dynamic/split-по-долям/
  контрольного примера/`estimateTouches`.
- **Удаляются:** `campaign-payment-math.ts`, `campaign-payment-math.test.ts`.
- **`node-card-content.tsx`:** в `PARAM_RENDERERS` для `sms/email/push/ivr`
  добавить readonly-строку `Стоимость` (значение из `UNIT_COST`). Без записи
  в `node-field-editability` → рендерится как readonly (нет иконки/правки).
- **`canvas-header.tsx`:** новый блок «Расчётная стоимость ≈ {total} ₽» +
  кнопка-иконка афины (`onExplainCost`). Показывается в обоих режимах
  (`edit` и `read-only`). Новые пропсы: `cost: number | null`,
  `onExplainCost?: () => void`.
- **`workflow-section.tsx`:** считает `computeCampaignCost(graph, signal.count)`
  в `useMemo` по `graphTick`; передаёт `total` и `onExplainCost` в
  `CanvasHeader`. `onExplainCost` через `useChat`: `openSidebar()` + эхо
  пользователя + pending → ответ с {primary}/{repeat}. Пересчёт — на каждое
  изменение графа (уже есть `handleGraphChange` → `graphTick`).
- **`campaign-payment-screen.tsx`:** граф из
  `getCachedGraph(campaign.id) ?? createTemplate(signal.type, signal)`;
  `recommended = computeCampaignCost(...).total`; блок разбивки (`lines` +
  строка буфера при `hasDynamic`); подпись рекомендуемой карточки. «Своя
  сумма», `estimateTouches`, `TopUpModal` — без изменений по поведению.

## Критерии приёмки

- В карточке `sms/email/push/ivr` есть строка стоимости одной отправки;
  у логических/web/конечных нод её нет.
- В шапке workflow показана расчётная стоимость; иконка афины по клику
  объясняет расчёт.
- Стоимость в шапке пересчитывается при изменении сценария (добавление/
  удаление коммуникации, смена канала, числа веток сплита).
- На экране оплаты «Рекомендуемая» = `computeCampaignCost(...).total`;
  показана разбивка по нодам; строка «+30%» есть ⇔ есть коммуникация за
  `condition`.
- Итог = сумма первичных + повторных; контрольный пример воспроизводится.
- «Своя сумма» и пополнение баланса работают как раньше.
- `npm run lint`, `npm run test`, `npm run build` зелёные.

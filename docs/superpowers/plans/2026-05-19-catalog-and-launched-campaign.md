# Каталог сценариев и экран запущенной кампании — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить в прототип каталог сценариев с онбордингом (Блок 1) и экран запущенной кампании с провайдерами данных (Блок 2).

**Architecture:** Снизу вверх. Сначала данные (`scenarios.ts`, `providers.ts`) и reducer-слой с TDD-юнит-тестами, затем компоненты, затем проводка в `page.tsx`. Две фазы: Фаза 1 — Блок 1 (каталог/онбординг), Фаза 2 — Блок 2 (экран кампании). Каждая задача — атомарный коммит; после каждой — `npm test` и `npm run lint` зелёные.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, shadcn/ui на `@base-ui/react`, `motion/react`, `nanoid`, vitest (reducer/компонентные тесты).

**Spec:** `docs/superpowers/specs/2026-05-19-catalog-and-launched-campaign-design.md`
**Ветка/воркстри:** `feature/catalog-launched-campaign` / `.worktrees/catalog-launched-campaign`

---

## File Structure

**Create:**
- `src/data/scenarios.ts` — библиотека 24 сценариев + типы + хелперы
- `src/data/scenarios.test.ts` — тесты библиотеки
- `src/data/providers.ts` — 4 провайдера + тайминги анимации
- `src/sections/signals/scenario-catalog-modal.tsx` — модалка каталога
- `src/sections/signals/scenario-card.tsx` — карточка сценария (для шага 1 и каталога)
- `src/sections/campaigns/campaign-screen.tsx` — экран запущенной кампании (лента)
- `src/sections/campaigns/workflow-mini-preview.tsx` — мини-отрисовка графа
- `src/sections/campaigns/provider-list.tsx` — блок провайдеров + анимация
- `src/sections/survey/onboarding-interests-screen.tsx` — экран 2 онбординга
- `src/sections/survey/onboarding-scenarios-screen.tsx` — экран 3 онбординга

**Modify:**
- `src/state/app-state.ts` — `catalog`-стейт, `selectedScenarioId`, `campaign`-view, экшены
- `src/state/app-state.test.ts` — reducer-тесты
- `src/sections/signals/steps/step-1-scenario.tsx` — секции + кнопка каталога
- `src/sections/survey/survey-section.tsx` — оркестрация 3 экранов онбординга
- `src/sections/welcome/onboarding-step-cards.tsx` — дописка строки с N
- `src/sections/shell/launch-flyout.tsx` — кнопка «Все N сценариев»
- `src/sections/campaigns/workflow-section.tsx` / `workflow-view.tsx` — read-only режим
- `src/sections/campaigns/canvas-header.tsx` — кнопка «назад», read-only
- `src/app/page.tsx` — рендер `campaign`-view + глобальная модалка каталога

---

# ФАЗА 1 — Блок 1: каталог сценариев и онбординг

## Task 1: Библиотека сценариев `scenarios.ts`

**Files:**
- Create: `src/data/scenarios.ts`
- Create: `src/data/scenarios.test.ts`

- [ ] **Step 1: Написать failing-тесты `src/data/scenarios.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { SCENARIOS, SCENARIO_CATEGORIES, getScenario, baseScenarios, curatedScenarios, scenarioCount } from "./scenarios";

describe("scenarios library", () => {
  it("has 24 scenarios", () => {
    expect(SCENARIOS).toHaveLength(24);
    expect(scenarioCount).toBe(24);
  });
  it("has 6 base scenarios", () => {
    expect(baseScenarios()).toHaveLength(6);
    expect(baseScenarios().every((s) => s.isBase)).toBe(true);
  });
  it("has 4 curated scenarios, none of them base", () => {
    expect(curatedScenarios()).toHaveLength(4);
    expect(curatedScenarios().every((s) => s.isCurated && !s.isBase)).toBe(true);
  });
  it("every scenario has a unique id", () => {
    const ids = new Set(SCENARIOS.map((s) => s.id));
    expect(ids.size).toBe(24);
  });
  it("every scenario.signalType is a valid SignalType", () => {
    const valid = ["Регистрация", "Первая сделка", "Апсейл", "Реактивация", "Возврат", "Удержание"];
    expect(SCENARIOS.every((s) => valid.includes(s.signalType))).toBe(true);
  });
  it("every scenario.category is a known category", () => {
    expect(SCENARIOS.every((s) => SCENARIO_CATEGORIES.includes(s.category))).toBe(true);
  });
  it("getScenario returns by id, undefined for unknown", () => {
    expect(getScenario(SCENARIOS[0].id)?.id).toBe(SCENARIOS[0].id);
    expect(getScenario("nope")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Запустить тесты — падают**

Run: `npm test -- scenarios`
Expected: FAIL (модуль не существует).

- [ ] **Step 3: Создать `src/data/scenarios.ts`**

Реализовать по Приложению A спеки. `SignalType` импортируется из `@/state/app-state`.

```ts
import type { SignalType } from "@/state/app-state";

export const SCENARIO_CATEGORIES = [
  "Привлечение", "Онбординг", "Апсейл", "Удержание", "Возврат", "Реактивация",
] as const;
export type ScenarioCategory = (typeof SCENARIO_CATEGORIES)[number];

export interface Scenario {
  id: string;
  name: string;
  description: string;
  category: ScenarioCategory;
  signalType: SignalType;
  isBase: boolean;
  isCurated: boolean;
}

export const SCENARIOS: Scenario[] = [
  // 6 базовых (isBase: true)
  { id: "base-registration", name: "Регистрация", description: "Довести до конца брошенную регистрацию или оформление.", category: "Онбординг", signalType: "Регистрация", isBase: true, isCurated: false },
  { id: "base-first-deal", name: "Первая сделка", description: "Подтолкнуть нового клиента к первой покупке.", category: "Привлечение", signalType: "Первая сделка", isBase: true, isCurated: false },
  { id: "base-upsell", name: "Апсейл", description: "Поднять чек активного клиента релевантным предложением.", category: "Апсейл", signalType: "Апсейл", isBase: true, isCurated: false },
  { id: "base-retention", name: "Удержание", description: "Удержать клиента, поймав ранние признаки оттока.", category: "Удержание", signalType: "Удержание", isBase: true, isCurated: false },
  { id: "base-return", name: "Возврат", description: "Вернуть клиента в оптимальный момент повторного контакта.", category: "Возврат", signalType: "Возврат", isBase: true, isCurated: false },
  { id: "base-reactivation", name: "Реактивация", description: "Разбудить давно неактивного клиента.", category: "Реактивация", signalType: "Реактивация", isBase: true, isCurated: false },
  // 4 подобранных (isCurated: true)
  { id: "cur-abandoned-cart", name: "Брошенная корзина", description: "Вернуть тех, кто не завершил оформление заказа.", category: "Привлечение", signalType: "Регистрация", isBase: false, isCurated: true },
  { id: "cur-sleeping", name: "Спящий клиент", description: "Реактивировать клиентов без активности 90+ дней.", category: "Реактивация", signalType: "Реактивация", isBase: false, isCurated: true },
  { id: "cur-churn-signal", name: "Отток-сигнал", description: "Поймать интерес к конкурентам до того, как клиент уйдёт.", category: "Удержание", signalType: "Удержание", isBase: false, isCurated: true },
  { id: "cur-expired", name: "Истёк продукт", description: "Предложить продление к дате окончания продукта.", category: "Возврат", signalType: "Возврат", isBase: false, isCurated: true },
  // 14 каталожных
  { id: "cat-avg-check", name: "Рост чека", description: "Апсейл по росту активности и среднего чека клиента.", category: "Апсейл", signalType: "Апсейл", isBase: false, isCurated: false },
  { id: "cat-cross-sell", name: "Кросс-продажа", description: "Предложить смежный продукт под текущую потребность.", category: "Апсейл", signalType: "Апсейл", isBase: false, isCurated: false },
  { id: "cat-premium", name: "Премиум-апгрейд", description: "Перевести клиента на старший тариф или пакет.", category: "Апсейл", signalType: "Апсейл", isBase: false, isCurated: false },
  { id: "cat-incomplete-app", name: "Незавершённая заявка", description: "Дожать клиента, бросившего заявку на полпути.", category: "Онбординг", signalType: "Регистрация", isBase: false, isCurated: false },
  { id: "cat-first-login", name: "Первый вход", description: "Помочь новому клиенту пройти первый ценный сценарий.", category: "Онбординг", signalType: "Регистрация", isBase: false, isCurated: false },
  { id: "cat-cold-base", name: "Холодная база", description: "Прогреть давно собранную, но не активированную базу.", category: "Привлечение", signalType: "Первая сделка", isBase: false, isCurated: false },
  { id: "cat-seasonal", name: "Сезонный спрос", description: "Поймать клиента в пик сезонного интереса.", category: "Привлечение", signalType: "Первая сделка", isBase: false, isCurated: false },
  { id: "cat-competitor", name: "Конкурентный интерес", description: "Реакция на сравнение с конкурентами на сайте.", category: "Удержание", signalType: "Удержание", isBase: false, isCurated: false },
  { id: "cat-activity-drop", name: "Падение активности", description: "Удержать клиента при спаде вовлечённости.", category: "Удержание", signalType: "Удержание", isBase: false, isCurated: false },
  { id: "cat-subscription-end", name: "Окончание подписки", description: "Вернуть клиента к дате окончания подписки.", category: "Возврат", signalType: "Возврат", isBase: false, isCurated: false },
  { id: "cat-post-purchase", name: "Постпокупочный возврат", description: "Вернуть за повторной покупкой после первой сделки.", category: "Возврат", signalType: "Возврат", isBase: false, isCurated: false },
  { id: "cat-dormant", name: "Брошенный после оплаты", description: "Разбудить клиента, переставшего пользоваться продуктом.", category: "Реактивация", signalType: "Реактивация", isBase: false, isCurated: false },
  { id: "cat-anniversary", name: "Годовщина клиента", description: "Контакт к значимой дате отношений с клиентом.", category: "Реактивация", signalType: "Реактивация", isBase: false, isCurated: false },
  { id: "cat-referral", name: "Реферальный момент", description: "Поймать момент, когда клиент готов рекомендовать.", category: "Привлечение", signalType: "Первая сделка", isBase: false, isCurated: false },
];

export const scenarioCount = SCENARIOS.length;
export const getScenario = (id: string): Scenario | undefined => SCENARIOS.find((s) => s.id === id);
export const baseScenarios = (): Scenario[] => SCENARIOS.filter((s) => s.isBase);
export const curatedScenarios = (): Scenario[] => SCENARIOS.filter((s) => s.isCurated);
```

- [ ] **Step 4: Запустить тесты — проходят**

Run: `npm test -- scenarios`
Expected: 7 тестов PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/scenarios.ts src/data/scenarios.test.ts
git commit -m "feat(data): add scenario library (24 scenarios)"
```

---

## Task 2: Reducer — стейт и экшены каталога

Добавляем `catalog`-стейт, `selectedScenarioId` и три экшена. Каталог — глобальный оверлей,
поэтому его открытость и `returnTo` живут в `AppState`.

**Files:**
- Modify: `src/state/app-state.ts`
- Modify: `src/state/app-state.test.ts`

- [ ] **Step 1: Failing-тесты в `app-state.test.ts`**

```ts
describe("appReducer — scenario catalog", () => {
  it("catalog_open stores returnTo and closes the launch flyout", () => {
    const state = { ...initialState, launchFlyoutOpen: true };
    const next = appReducer(state, { type: "catalog_open", returnTo: "launcher" });
    expect(next.catalog).toEqual({ returnTo: "launcher" });
    expect(next.launchFlyoutOpen).toBe(false);
  });
  it("catalog_close clears the catalog", () => {
    const state = { ...initialState, catalog: { returnTo: "wizard-step-1" as const } };
    expect(appReducer(state, { type: "catalog_close" }).catalog).toBeNull();
  });
  it("catalog_select from wizard-step-1 stores scenario and stays on guided-signal", () => {
    const state = {
      ...initialState,
      view: { kind: "guided-signal" as const },
      catalog: { returnTo: "wizard-step-1" as const },
    };
    const next = appReducer(state, { type: "catalog_select", scenarioId: "cat-seasonal" });
    expect(next.catalog).toBeNull();
    expect(next.selectedScenarioId).toBe("cat-seasonal");
    expect(next.view.kind).toBe("guided-signal");
  });
  it("catalog_select from onboarding starts the signal flow on guided-signal", () => {
    const state = { ...initialState, catalog: { returnTo: "onboarding" as const } };
    const next = appReducer(state, { type: "catalog_select", scenarioId: "cat-seasonal" });
    expect(next.catalog).toBeNull();
    expect(next.selectedScenarioId).toBe("cat-seasonal");
    expect(next.view.kind).toBe("guided-signal");
  });
});
```

- [ ] **Step 2: Запустить — падают**

Run: `npm test -- "scenario catalog"`
Expected: FAIL.

- [ ] **Step 3: Реализовать в `app-state.ts`**

1. Тип:
```ts
export type CatalogReturnTo = "onboarding" | "wizard-step-1" | "launcher";
```
2. В `AppState` добавить поля:
```ts
catalog: { returnTo: CatalogReturnTo } | null;
selectedScenarioId: string | null;
```
3. В `initialState` — `catalog: null, selectedScenarioId: null`.
4. В union `Action` добавить (выше PARALLEL-WORKTREE-комментария):
```ts
| { type: "catalog_open"; returnTo: CatalogReturnTo }
| { type: "catalog_close" }
| { type: "catalog_select"; scenarioId: string }
```
5. Cases в `appReducer` (перед PARALLEL-WORKTREE-комментарием):
```ts
case "catalog_open":
  return { ...state, catalog: { returnTo: action.returnTo }, launchFlyoutOpen: false };

case "catalog_close":
  return { ...state, catalog: null };

case "catalog_select": {
  const returnTo = state.catalog?.returnTo;
  const base = { ...state, catalog: null, selectedScenarioId: action.scenarioId };
  if (returnTo === "wizard-step-1") return base;
  // onboarding / launcher → стартуем флоу создания сигнала
  return {
    ...base,
    view: { kind: "guided-signal" },
    activeSection: null,
    resumingSignalId: undefined,
    wizardSessionId: state.wizardSessionId + 1,
  };
}
```

- [ ] **Step 4: Запустить тесты — проходят**

Run: `npm test`
Expected: все PASS, включая 4 новых.

- [ ] **Step 5: Commit**

```bash
git add src/state/app-state.ts src/state/app-state.test.ts
git commit -m "feat(state): scenario catalog state and actions"
```

---

## Task 3: Карточка сценария `ScenarioCard`

Переиспользуемая карточка: название + одно предложение, без иконок. Используется на шаге 1 и в каталоге.

**Files:**
- Create: `src/sections/signals/scenario-card.tsx`

**Reference:** посмотреть стиль карточек в текущем `src/sections/signals/steps/step-1-scenario.tsx` (классы выбранного состояния `border-brand/50 bg-brand-muted`).

- [ ] **Step 1: Создать компонент**

Пропсы: `{ scenario: Scenario; selected?: boolean; onClick: (id: string) => void }`.
Разметка — `button`, левое выравнивание: название (`text-sm font-medium`) + описание (`text-xs text-muted-foreground`, одно предложение). Выбранное состояние — `border-brand/50 bg-brand-muted` (как сейчас в `step-1-scenario`). Без иконок. `aria-pressed={selected}`.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: без новых ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/sections/signals/scenario-card.tsx
git commit -m "feat(signals): add ScenarioCard component"
```

---

## Task 4: Модалка каталога `ScenarioCatalogModal`

**Files:**
- Create: `src/sections/signals/scenario-catalog-modal.tsx`

**Reference:** `src/components/ui/dialog.tsx` (base-ui Dialog: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`). Чипсы — стиль `CampaignFilterChips` / `InterestChip`.

- [ ] **Step 1: Создать компонент**

Пропсы: `{ open: boolean; onClose: () => void; onSelect: (scenarioId: string) => void }`.

Состав:
- `Dialog` + `DialogContent` (широкий, `max-w-3xl`), заголовок «Каталог сценариев» + закрытие.
- Поиск (`Input` + `Search` icon) — локальный `useState`, фильтр по `name` (case-insensitive, `toLocaleLowerCase("ru-RU")`).
- Чипсы категорий `SCENARIO_CATEGORIES` — мульти-селект, локальный `useState<Set<ScenarioCategory>>`. Пустой набор = все категории.
- Сетка карточек `ScenarioCard` (`grid grid-cols-3 gap-3`) по отфильтрованным `SCENARIOS`.
- Клик по карточке → `onSelect(id)`.
- Закрытие (×, Esc, клик по оверлею) → `onClose()`.
- Пустой результат — текст «Ничего не найдено».

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/sections/signals/scenario-catalog-modal.tsx
git commit -m "feat(signals): add ScenarioCatalogModal"
```

---

## Task 5: Глобальный монтаж модалки каталога в `page.tsx`

Модалка открывается с разных экранов — рендерим её на уровне шелла.

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Подключить модалку**

В `Home` рядом с `LaunchFlyout` отрендерить:
```tsx
<ScenarioCatalogModal
  open={catalog !== null}
  onClose={() => dispatch({ type: "catalog_close" })}
  onSelect={(scenarioId) => dispatch({ type: "catalog_select", scenarioId })}
/>
```
`catalog` достаётся из `useAppState()`. Импорт — `@/sections/signals/scenario-catalog-modal`.

- [ ] **Step 2: Lint + vitest**

Run: `npm run lint && npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(shell): mount ScenarioCatalogModal globally"
```

---

## Task 6: Переделка шага 1 визарда `Step1Scenario`

**Files:**
- Modify: `src/sections/signals/steps/step-1-scenario.tsx`

**Reference:** прочитать текущий `step-1-scenario.tsx` целиком (текущая сетка `grid grid-cols-3`, `visualScenario`, `StepProps`). Прочитать как шаг получает выбор и зовёт `onNext`.

- [ ] **Step 1: Переписать содержимое шага**

- Секция «Базовые сценарии» — `ScenarioCard` по `baseScenarios()` (6), `grid grid-cols-3 gap-3`.
- Секция «Подобрано для вас» — `ScenarioCard` по `curatedScenarios()` (4).
- Если в стейте есть `selectedScenarioId` сценария, которого нет ни в базовых, ни в подобранных — добавить его карточку первой в секцию «Подобрано для вас» и пометить выбранной.
- Кнопка «Все {scenarioCount} сценариев» → `dispatch({ type: "catalog_open", returnTo: "wizard-step-1" })`.
- Клик по карточке → выбор сценария → переход на шаг 2 (через текущий механизм `onNext` шага, с маппингом `scenario.signalType`). Поиска на шаге нет.
- Подписаться на `selectedScenarioId` из `useAppState()`: при его установке — карточка подсвечена.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: без ошибок.

- [ ] **Step 3: Визуальная проверка**

Открыть localhost:3000, зайти в создание сигнала: видны две секции + кнопка «Все 24 сценария».

- [ ] **Step 4: Commit**

```bash
git add src/sections/signals/steps/step-1-scenario.tsx
git commit -m "feat(signals): rework step 1 with base/curated sections + catalog button"
```

---

## Task 7: Визард открывается на шаге 2 при выбранном сценарии

Когда сценарий выбран в каталоге из онбординга/лаунчера (`selectedScenarioId` установлен,
а визард ещё не на шаге 2) — мастер открывается сразу на шаге 2.

**Files:**
- Modify: `src/sections/signals/campaign-workspace.tsx` (визард-оркестратор)

**Reference:** прочитать `campaign-workspace.tsx` — как считается стартовый `currentStep`, как используется `initialScenario` / `resumingSignalId`.

- [ ] **Step 1: Учесть `selectedScenarioId` при инициализации шага**

На маунте визарда: если `selectedScenarioId` задан — предзаполнить выбор сценария и стартовать с шага 2 (как сейчас делает `resumingSignalId` для своего шага). Шаг 2 предзаполняется по `getScenario(selectedScenarioId).signalType` (существующая seeded-логика интересов/триггеров).

- [ ] **Step 2: Lint + vitest**

Run: `npm run lint && npm test`
Expected: PASS.

- [ ] **Step 3: Визуальная проверка**

Из лаунчера открыть каталог → выбрать сценарий → визард на шаге 2, интересы предзаполнены.

- [ ] **Step 4: Commit**

```bash
git add src/sections/signals/campaign-workspace.tsx
git commit -m "feat(signals): open wizard at step 2 when scenario pre-selected"
```

---

## Task 8: Онбординг — экран 2 (подтверждение интересов)

**Files:**
- Create: `src/sections/survey/onboarding-interests-screen.tsx`

**Reference:** прочитать `src/sections/survey/` целиком (`survey-form.tsx`, `survey-awaiting.tsx`, `survey-section.tsx`, `@/types/survey`). Чипсы интересов — стиль `InterestChip` из `step-2-interests.tsx`.

- [ ] **Step 1: Создать экран**

Пропсы: `{ onContinue: () => void }`.
- Заголовок «Уточним детали», подзаголовок «Это направления, которые мы определили. Поправьте, если что-то не так.»
- Редактируемые чипсы интересов: предзаполнены (можно взять интересы по `clientDirection`, как делает шаг 2), каждый удаляется крестиком; кнопка «+ добавить» для своего интереса (минимальный inline-инпут).
- Кнопка «Продолжить →» → `onContinue()`.
- Локальный стейт списка интересов — для прототипа сохранять в `survey` необязательно.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/sections/survey/onboarding-interests-screen.tsx
git commit -m "feat(survey): add onboarding interests-confirmation screen"
```

---

## Task 9: Онбординг — экран 3 («Нашли N сценариев»)

**Files:**
- Create: `src/sections/survey/onboarding-scenarios-screen.tsx`

- [ ] **Step 1: Создать экран**

Пропсы: `{ onChooseScenario: () => void }`.
- Заголовок «Мы нашли {scenarioCount} сценариев специально для вас» (эмоциональный пик — крупная типографика, staggered reveal как на других экранах результата).
- Подзаголовок «Каждый сценарий — готовая связка сигнала и кампании, адаптированная под ваш бизнес.»
- Кнопка «Выбрать сценарий →» → `onChooseScenario()`.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/sections/survey/onboarding-scenarios-screen.tsx
git commit -m "feat(survey): add onboarding found-scenarios screen"
```

---

## Task 10: Оркестрация 3-экранного онбординга в `survey-section.tsx`

**Files:**
- Modify: `src/sections/survey/survey-section.tsx`

**Reference:** прочитать текущий `survey-section.tsx` — как он переключает `SurveyForm` → `SurveyAwaiting`, как зовёт `survey_completed` / `survey_skipped`.

- [ ] **Step 1: Ввести локальный шаг онбординга**

`useState<"site" | "enrich" | "interests" | "scenarios">("site")`.
- `site` — `SurveyForm` (экран 1). «Продолжить» → `enrich`. «Пропустить» → `dispatch survey_skipped` (→ «Добро пожаловать»).
- `enrich` — `SurveyAwaiting` (анимация «Обогащение данными»); по завершении → `interests`.
- `interests` — `OnboardingInterestsScreen`, `onContinue` → `scenarios`.
- `scenarios` — `OnboardingScenariosScreen`, `onChooseScenario` → `dispatch({ type: "survey_completed", survey })` затем `dispatch({ type: "catalog_open", returnTo: "onboarding" })`.
- На экранах 2 и 3 также доступен выход «Пропустить» → `survey_skipped`.

Чат-бот на онбординге скрыт — поведение текущей survey-секции (она не рендерит бар) сохраняется.

- [ ] **Step 2: Lint + vitest**

Run: `npm run lint && npm test`
Expected: PASS.

- [ ] **Step 3: Визуальная проверка**

`survey_reset` через дев-панель (или новый сеанс) → пройти 3 экрана → каталог поверх экрана 3 → закрытие каталога ведёт на «Добро пожаловать».

- [ ] **Step 4: Commit**

```bash
git add src/sections/survey/survey-section.tsx
git commit -m "feat(survey): orchestrate 3-screen onboarding"
```

---

## Task 11: Закрытие каталога из онбординга → «Добро пожаловать»

`catalog_close` сейчас просто убирает модалку. Когда `returnTo === "onboarding"` — после
закрытия нужно перейти на «Добро пожаловать» (`survey` уже завершён в Task 10).

**Files:**
- Modify: `src/state/app-state.ts`
- Modify: `src/state/app-state.test.ts`

- [ ] **Step 1: Failing-тест**

```ts
it("catalog_close from onboarding navigates to welcome", () => {
  const state = { ...initialState, catalog: { returnTo: "onboarding" as const } };
  const next = appReducer(state, { type: "catalog_close" });
  expect(next.catalog).toBeNull();
  expect(next.view.kind).toBe("welcome");
});
it("catalog_close from wizard-step-1 keeps the current view", () => {
  const state = {
    ...initialState,
    view: { kind: "guided-signal" as const },
    catalog: { returnTo: "wizard-step-1" as const },
  };
  expect(appReducer(state, { type: "catalog_close" }).view.kind).toBe("guided-signal");
});
```

- [ ] **Step 2: Запустить — падает первый**

Run: `npm test -- "catalog_close"`
Expected: FAIL на онбординг-кейсе.

- [ ] **Step 3: Обновить `catalog_close` case**

```ts
case "catalog_close": {
  if (state.catalog?.returnTo === "onboarding") {
    return { ...state, catalog: null, view: { kind: "welcome" }, activeSection: null };
  }
  return { ...state, catalog: null };
}
```

- [ ] **Step 4: Тесты проходят**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/app-state.ts src/state/app-state.test.ts
git commit -m "feat(state): catalog_close from onboarding routes to welcome"
```

---

## Task 12: Дописка на карточке «Создать сигнал» в «Добро пожаловать»

**Files:**
- Modify: `src/sections/welcome/onboarding-step-cards.tsx`

**Reference:** в файле — константа `STEPS`, шаг 1 «Получение сигнала», кнопка «Создать сигнал».

- [ ] **Step 1: Добавить строку с N**

На карточке шага 1, между описанием и кнопкой «Создать сигнал», добавить строку:
**«Под вашу компанию подобрано {scenarioCount} сценариев»** (выделенная — `font-medium text-foreground`). Импорт `scenarioCount` из `@/data/scenarios`. Структура трёх карточек не меняется.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/sections/welcome/onboarding-step-cards.tsx
git commit -m "feat(welcome): add scenario count line to create-signal card"
```

---

## Task 13: Точка входа в каталог из лаунчера

**Files:**
- Modify: `src/sections/shell/launch-flyout.tsx`

**Reference:** текущий `launch-flyout.tsx` (локальный `SIGNAL_TEMPLATES`, секция «Новый сигнал»).

- [ ] **Step 1: Добавить кнопку каталога + унифицировать данные**

- Локальный `SIGNAL_TEMPLATES` заменить на `baseScenarios()` из `@/data/scenarios` (6 базовых; рендерить `name` + `description`). Клик по строке базового сценария → `dispatch({ type: "catalog_select", scenarioId: scenario.id })` после `dispatch({ type: "catalog_open", returnTo: "launcher" })` — либо проще: сразу `flyout_signal_select`-эквивалент через `start_signal_flow` c `selectedScenarioId`. Для единообразия использовать новый путь: dispatch `catalog_open {returnTo:"launcher"}` не нужен для прямого клика — клик по базовой карточке должен сразу стартовать флоу. Реализовать через `catalog_select`-семантику: добавить хелпер-dispatch, который ставит `selectedScenarioId` и стартует guided-signal (то же, что `catalog_select` с returnTo launcher). Для прямого клика по базовому сценарию допустимо переиспользовать существующий `flyout_signal_select` если он уже стартует флоу.
- В конец секции «Новый сигнал» добавить кнопку **«Все {scenarioCount} сценариев →»** → `dispatch({ type: "catalog_open", returnTo: "launcher" })` (флайаут закроется — `catalog_open` уже сбрасывает `launchFlyoutOpen`).
- Поиск продолжает фильтровать секцию базовых сценариев.

> Примечание исполнителю: основная новая механика — кнопка «Все N сценариев». Клик по базовой карточке должен и дальше стартовать флоу создания сигнала; если текущий `flyout_signal_select` это делает — оставить его, дополнительно прокинув `selectedScenarioId` через `catalog_select` не требуется. Главное — единый источник данных (`baseScenarios()`) и кнопка каталога.

- [ ] **Step 2: Lint + vitest**

Run: `npm run lint && npm test`
Expected: PASS.

- [ ] **Step 3: Визуальная проверка**

Лаунчер → «Все 24 сценария» → каталог открыт; выбор сценария → визард создания сигнала.

- [ ] **Step 4: Commit**

```bash
git add src/sections/shell/launch-flyout.tsx
git commit -m "feat(shell): add scenario catalog entry point to launcher"
```

---

## Task 14: Фаза 1 — верификация

**Files:** —

- [ ] **Step 1: Полный прогон**

Run: `npm run lint && npm test`
Expected: всё зелёное.

- [ ] **Step 2: Визуальный чек-лист на localhost:3000**

- Новый сеанс / `survey_reset` → 3 экрана онбординга → каталог → «Добро пожаловать».
- «Пропустить» на онбординге → сразу «Добро пожаловать».
- На «Добро пожаловать» карточка «Создать сигнал» содержит «Под вашу компанию подобрано 24 сценария».
- Шаг 1 визарда: секции «Базовые» (6) и «Подобрано» (4) + кнопка «Все 24 сценария».
- Каталог из шага 1: поиск, чипсы категорий, выбор → возврат на шаг 1 с подсветкой.
- Лаунчер: кнопка «Все 24 сценария» открывает каталог.

- [ ] **Step 3: Commit (если были фиксы)**

```bash
git commit -am "fix: phase 1 review fixes" # только если что-то правилось
```

---

# ФАЗА 2 — Блок 2: экран запущенной кампании

## Task 15: Данные провайдеров `providers.ts`

**Files:**
- Create: `src/data/providers.ts`
- Create: `src/data/providers.test.ts`

- [ ] **Step 1: Failing-тест `providers.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { PROVIDERS } from "./providers";

describe("providers data", () => {
  it("has 4 providers", () => expect(PROVIDERS).toHaveLength(4));
  it("three providers connect on a timer, one is stuck", () => {
    expect(PROVIDERS.filter((p) => p.connectAfterMs !== null)).toHaveLength(3);
    expect(PROVIDERS.filter((p) => p.connectAfterMs === null)).toHaveLength(1);
  });
  it("Beeline connects fastest", () => {
    const bee = PROVIDERS.find((p) => p.name === "Билайн");
    expect(bee?.connectAfterMs).toBe(2000);
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `npm test -- providers`
Expected: FAIL.

- [ ] **Step 3: Создать `src/data/providers.ts`**

```ts
export interface Provider {
  id: string;
  name: string;
  /** ms до выхода на конечный статус; null — застревает */
  connectAfterMs: number | null;
  /** конечный объём (подключён) */
  finalSignalsPerDay: number;
  /** потенциал (в процессе подключения) */
  potentialSignalsPerDay: number;
  /** стадия, на которой застревает (для stuck-провайдера) */
  stuckStage?: "Подключение" | "Премодерация";
}

export const PROVIDERS: Provider[] = [
  { id: "beeline", name: "Билайн",  connectAfterMs: 2000, finalSignalsPerDay: 5,  potentialSignalsPerDay: 2000 },
  { id: "megafon", name: "Мегафон", connectAfterMs: 3000, finalSignalsPerDay: 12, potentialSignalsPerDay: 4000 },
  { id: "mts",     name: "МТС",     connectAfterMs: 5000, finalSignalsPerDay: 8,  potentialSignalsPerDay: 3000 },
  { id: "tele2",   name: "Tele2",   connectAfterMs: null, finalSignalsPerDay: 0,  potentialSignalsPerDay: 5000, stuckStage: "Премодерация" },
];

export const PROVIDER_STAGES = ["Подключение", "Премодерация", "Подключён"] as const;
export type ProviderStage = (typeof PROVIDER_STAGES)[number];
```

- [ ] **Step 4: Тесты проходят**

Run: `npm test -- providers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/providers.ts src/data/providers.test.ts
git commit -m "feat(data): add data-provider list"
```

---

## Task 16: Reducer — `campaign`-view, `campaign_launched`, `open_workflow`

**Files:**
- Modify: `src/state/app-state.ts`
- Modify: `src/state/app-state.test.ts`

- [ ] **Step 1: Failing-тесты**

```ts
describe("appReducer — launched campaign screen", () => {
  it("campaign_launched sets active + launchedAt and navigates to campaign view", () => {
    const c = makeCampaign({ id: "cmp_A", name: "C", status: "draft" });
    const state = { ...initialState, campaigns: [c] };
    const next = appReducer(state, { type: "campaign_launched", id: "cmp_A", timestamp: "2026-05-20T00:00:00.000Z" });
    const updated = next.campaigns.find((x) => x.id === "cmp_A")!;
    expect(updated.status).toBe("active");
    expect(updated.launchedAt).toBe("2026-05-20T00:00:00.000Z");
    expect(next.view).toEqual({ kind: "campaign", campaign: { id: "cmp_A", name: "C" } });
  });
  it("campaign_launched is a no-op for unknown id", () => {
    const state = { ...initialState, campaigns: [makeCampaign({ id: "cmp_A" })] };
    expect(appReducer(state, { type: "campaign_launched", id: "x", timestamp: "t" })).toBe(state);
  });
  it("campaign_opened routes an active campaign to the campaign view", () => {
    const c = makeCampaign({ id: "cmp_A", name: "C", status: "active" });
    const next = appReducer({ ...initialState, campaigns: [c] }, { type: "campaign_opened", id: "cmp_A" });
    expect(next.view.kind).toBe("campaign");
  });
  it("campaign_opened still routes a draft campaign to the workflow view", () => {
    const c = makeCampaign({ id: "cmp_A", name: "C", status: "draft" });
    const next = appReducer({ ...initialState, campaigns: [c] }, { type: "campaign_opened", id: "cmp_A" });
    expect(next.view.kind).toBe("workflow");
  });
  it("open_workflow switches from campaign view to a launched workflow", () => {
    const state = { ...initialState, view: { kind: "campaign" as const, campaign: { id: "cmp_A", name: "C" } } };
    const next = appReducer(state, { type: "open_workflow", campaign: { id: "cmp_A", name: "C" }, launched: true });
    expect(next.view).toEqual({ kind: "workflow", campaign: { id: "cmp_A", name: "C" }, launched: true });
  });
});
```

- [ ] **Step 2: Запустить — падают**

Run: `npm test -- "launched campaign screen"`
Expected: FAIL.

- [ ] **Step 3: Реализовать**

1. В `View` добавить вариант:
```ts
| { kind: "campaign"; campaign: { id: string; name: string } }
```
2. В `ViewAddress` добавить:
```ts
| { kind: "campaign"; campaignId: string }
```
   и обработать в `rebuildViewFromAddress` (active → campaign, иначе workflow — переиспользовать логику `campaign_opened`) и `viewToAddress`.
3. В union `Action`:
```ts
| { type: "campaign_launched"; id: string; timestamp: string }
| { type: "open_workflow"; campaign: { id: string; name: string }; launched: boolean }
```
4. Обновить `case "campaign_opened"` — для статуса `active`/`paused`/`completed` теперь
   возвращать `view: { kind: "campaign", campaign: { id, name } }` вместо `workflow`;
   для `draft`/`scheduled` — как сейчас (`workflow`, `launched: false`).
5. Новые cases:
```ts
case "campaign_launched": {
  const c = state.campaigns.find((cc) => cc.id === action.id);
  if (!c) return state;
  return {
    ...state,
    campaigns: state.campaigns.map((cc) =>
      cc.id === action.id
        ? { ...cc, status: "active", launchedAt: cc.launchedAt ?? action.timestamp }
        : cc
    ),
    view: { kind: "campaign", campaign: { id: c.id, name: c.name } },
    activeSection: null,
  };
}

case "open_workflow":
  return {
    ...state,
    view: { kind: "workflow", campaign: action.campaign, launched: action.launched },
  };
```

- [ ] **Step 4: Тесты проходят**

Run: `npm test`
Expected: все PASS. Будет ошибка типов в `page.tsx` (`renderMain` не покрывает `campaign`) — фиксится в Task 19.

- [ ] **Step 5: Commit**

```bash
git add src/state/app-state.ts src/state/app-state.test.ts
git commit -m "feat(state): campaign view kind, campaign_launched, open_workflow"
```

---

## Task 17: `WorkflowMiniPreview` — не интерактивная мини-отрисовка графа

**Files:**
- Create: `src/sections/campaigns/workflow-mini-preview.tsx`

**Reference:** прочитать `workflow-view.tsx` / `workflow-graph.tsx` — как граф строится из шаблона по типу сигнала (`workflow-templates.ts`, `createTemplate`).

- [ ] **Step 1: Создать компонент**

Пропсы: `{ signalType?: SignalType }`.
- Рендерит тот же граф (React Flow), что и `WorkflowView`, но: контейнер фиксированной малой высоты (~120–160px), `fitView`, без панелей/контролов, обёртка с `pointer-events: none` и `aria-hidden`.
- Если переиспользовать `WorkflowGraph` напрямую сложно из-за интерактивности — отрендерить упрощённый статичный SVG/HTML-предпросмотр из нод шаблона (узлы + рёбра), но предпочтителен реальный граф в масштабе.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/sections/campaigns/workflow-mini-preview.tsx
git commit -m "feat(campaigns): add non-interactive workflow mini-preview"
```

---

## Task 18: `ProviderList` — блок провайдеров с анимацией

**Files:**
- Create: `src/sections/campaigns/provider-list.tsx`

**Reference:** паттерн таймеров с cleanup — `workflow-view.tsx` (AI-цикл, `setTimeout` в `ref`).

- [ ] **Step 1: Создать компонент**

- Состояние: `Map<providerId, ProviderStage>`; старт — все на «Подключение».
- На маунте — для каждого провайдера с `connectAfterMs !== null` завести таймеры:
  переход «Подключение»→«Премодерация» на ~40% времени, «Премодерация»→«Подключён» на
  `connectAfterMs`. Stuck-провайдер (Tele2) встаёт на `stuckStage`.
- Все таймеры в `ref`, очистка на unmount.
- Рендер строки: точка (● подключён / ○ в процессе) · имя · статус.
  - Подключён: «Подключён · ~{finalSignalsPerDay} сигналов/день».
  - В процессе: «{stage} · до {potentialSignalsPerDay} сигналов/день после подключения».
- Меняется только текст статуса и точка.

- [ ] **Step 2: Failing-тест `provider-list.test.tsx`** (компонентный, vitest + jsdom, фейковые таймеры)

```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProviderList } from "./provider-list";

describe("ProviderList", () => {
  it("starts all providers on Подключение and connects them on their timers", () => {
    vi.useFakeTimers();
    render(<ProviderList />);
    expect(screen.getAllByText(/Подключение/).length).toBeGreaterThan(0);
    vi.advanceTimersByTime(6000);
    expect(screen.getByText(/Билайн/)).toBeInTheDocument();
    // три провайдера подключены, Tele2 — нет
    expect(screen.getAllByText(/Подключён/).length).toBe(3);
    vi.useRealTimers();
  });
});
```

> Если тест на таймерах окажется хрупким — допустимо ослабить до проверки «через 6с
> ровно 3 строки содержат "Подключён"». Косметику чиним после.

- [ ] **Step 3: Запустить тест**

Run: `npm test -- provider-list`
Expected: PASS (реализация из Step 1).

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: без ошибок.

- [ ] **Step 5: Commit**

```bash
git add src/sections/campaigns/provider-list.tsx src/sections/campaigns/provider-list.test.tsx
git commit -m "feat(campaigns): add animated data-provider list"
```

---

## Task 19: `CampaignScreen` — экран запущенной кампании

**Files:**
- Create: `src/sections/campaigns/campaign-screen.tsx`
- Modify: `src/app/page.tsx`

**Reference:** `campaign-card.tsx` (формат даты/типа), `Campaign` тип в `app-state.ts`.

- [ ] **Step 1: Создать `CampaignScreen`**

Берёт `view.campaign` + находит `Campaign` и его `Signal` в стейте. Вертикальная лента,
4 блока (`max-w-2xl`, скролл, `pb` под промпт-бар как в других секциях):
1. **Шапка** — название кампании; строка «Коммуникационная · запуск {launchedAt} · {budget}».
   Бюджета в модели `Campaign` нет — для прототипа показать фиксированное значение
   (напр. «150 000 ₽») или поле, если оно появится; не блокирующий момент.
2. **Workflow** — лейбл «Workflow», `WorkflowMiniPreview` (по типу сигнала кампании) +
   кнопка «Открыть workflow» → `dispatch({ type: "open_workflow", campaign: view.campaign, launched: true })`.
3. **Провайдеры данных** — лейбл + `ProviderList`.
4. **CTA** — кнопка «Перейти в статистику →», `disabled` (статистики ещё нет).

- [ ] **Step 2: Подключить в `page.tsx`**

В `renderMain`: `if (view.kind === "campaign") return <CampaignScreen />;`. Импорт добавить.

- [ ] **Step 3: Lint + vitest**

Run: `npm run lint && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/sections/campaigns/campaign-screen.tsx src/app/page.tsx
git commit -m "feat(campaigns): add launched-campaign screen"
```

---

## Task 20: Кнопка «Запустить» → `campaign_launched`

**Files:**
- Modify: `src/sections/campaigns/canvas-header.tsx` (или место, где сейчас кнопка «Запустить»)

**Reference:** прочитать `canvas-header.tsx` — текущая кнопка «Запустить» и валидация (`validateWorkflow`). Сейчас запуск шлёт `campaign_status_changed`/`campaign_created`.

- [ ] **Step 1: Перенаправить запуск на `campaign_launched`**

Кнопка «Запустить» при валидном графе → `dispatch({ type: "campaign_launched", id: campaignId, timestamp: new Date().toISOString() })`. Валидацию сохранить как есть. Мгновенный переход на `campaign`-view обеспечивает reducer.

- [ ] **Step 2: Lint + vitest + e2e happy-path**

Run: `npm run lint && npm test`
Expected: PASS. Прогнать `npm run test:e2e -- tests/e2e/happy-path.spec.ts` — если happy-path упирается в запуск, поправить ассерт под новый экран кампании.

- [ ] **Step 3: Визуальная проверка**

Создать кампанию → «Запустить» → мгновенно открывается экран кампании, провайдеры оживают.

- [ ] **Step 4: Commit**

```bash
git add src/sections/campaigns/canvas-header.tsx
git commit -m "feat(campaigns): launch button opens the launched-campaign screen"
```

---

## Task 21: Read-only workflow у запущенной кампании + кнопка «назад»

**Files:**
- Modify: `src/sections/campaigns/workflow-section.tsx`
- Modify: `src/sections/campaigns/canvas-header.tsx`
- Modify: `src/sections/campaigns/workflow-view.tsx`

**Reference:** `view.kind === "workflow"` несёт `launched: boolean`. Прочитать, как `launched` уже влияет на вёрстку (compact-режим).

- [ ] **Step 1: Read-only при `launched`**

Когда `view.launched === true`:
- В `canvas-header` — скрыть кнопку «Запустить» / «Сохранить черновик»; показать кнопку «← Назад» → `dispatch({ type: "campaign_opened", id: campaignId })` (вернёт на `campaign`-view, т.к. кампания active).
- В `workflow-view` — отключить выбор/правку нод (`elementsSelectable={false}`, не диспатчить `workflow_node_selected`), скрыть `NodeControlPanel`. Граф можно листать/зумить, но не менять.
- У незапущенной (`launched === false`) — поведение без изменений (редактируемый).

- [ ] **Step 2: Lint + vitest**

Run: `npm run lint && npm test`
Expected: PASS.

- [ ] **Step 3: Визуальная проверка**

Экран запущенной кампании → «Открыть workflow» → граф read-only, есть «Назад» → возврат на экран кампании. Незапущенная кампания (draft из дев-пресета) → workflow редактируемый.

- [ ] **Step 4: Commit**

```bash
git add src/sections/campaigns/workflow-section.tsx src/sections/campaigns/canvas-header.tsx src/sections/campaigns/workflow-view.tsx
git commit -m "feat(campaigns): read-only workflow for launched campaigns"
```

---

## Task 22: Фаза 2 — верификация

**Files:** —

- [ ] **Step 1: Полный прогон**

Run: `npm run lint && npm test`
Expected: всё зелёное. По возможности `npm run test:e2e`.

- [ ] **Step 2: Визуальный чек-лист**

- Дев-пресет с draft-кампанией → открыть → workflow редактируемый.
- Создать/открыть кампанию → «Запустить» → мгновенно экран кампании.
- Провайдеры: Билайн ~2с, Мегафон ~3с, МТС ~5с выходят на «Подключён», Tele2 застревает.
- «Открыть workflow» → read-only граф + «Назад».
- Клик по active-кампании в разделе «Кампании» → экран кампании.
- CTA «Перейти в статистику» — disabled.

- [ ] **Step 3: Обновить memory-роадмап**

В `MEMORY.md` добавить пункт про эту работу; при необходимости — отдельный memory-файл
о статусе фич каталога/экрана кампании.

- [ ] **Step 4: Финальная проверка дерева**

Run: `git status`
Expected: clean. Сообщить пользователю путь воркстри и имя ветки.

---

## Self-Review Notes

**Spec coverage:**
- §3 модель сценария — Task 1 (`scenarios.ts`, 24 шт., Приложение A).
- §4.1 онбординг 3 экрана — Tasks 8, 9, 10.
- §4.2 модалка каталога + `returnTo` — Tasks 2, 4, 5, 11.
- §4.3 шаг 1 (секции + кнопка) — Task 6; открытие на шаге 2 — Task 7.
- §4.4 дописка welcome — Task 12.
- §4.5 лаунчер — Task 13.
- §4.6 шаг 2 предзаполнение — Task 7 (по `signalType`).
- §5.1–5.3 экран кампании — Tasks 16, 17, 18, 19.
- §5.2 модель запуска — Task 20 (`campaign_launched`); Task 16 (`campaign_opened` routing).
- §5.4 провайдеры/анимация — Tasks 15, 18.
- §5.5 workflow read-only — Task 21.
- §6 изменения состояния — Tasks 2, 11, 16.
- §7 тесты — reducer-тесты в Tasks 1, 2, 11, 15, 16; компонентный — Task 18.

**Placeholder scan:** конкретных TBD нет. «Бюджет» в Task 19 и хрупкость таймер-теста в
Task 18 помечены как непринципиальные для прототипа с явным указанием fallback.

**Type consistency:** `CatalogReturnTo`, `Scenario`, `Provider`, `ProviderStage` —
определены в Tasks 1/2/15 и используются согласованно. `View` += `campaign` (Task 16)
покрыт в `renderMain` (Task 19). Экшены `catalog_*`, `campaign_launched`, `open_workflow`
имеют одинаковую форму union-вариантов.

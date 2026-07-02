# Сценарий — каталог на шаге 1 визарда (Блоки 2+3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перенести содержимое модалки `ScenarioCatalogModal` (поиск + 6 категорий + единый список) непосредственно в шаг 1 визарда, удалить модалку, перенаправить все её внешние вызовы на открытие визарда сразу на шаге 1.

**Architecture:**
Шаг 1 (`Step1Scenario`) становится единственным домом сущности «Сценарий»: заголовок остаётся, ниже — поле поиска и чипы 6 категорий, ниже — единый прокручиваемый список карточек (через `ScrollArea` из shadcn — у него уже кастомный тонкий скроллбар на `bg-border`). Деление на «Базовые / Подобрано для вас» и кнопка «Все N сценариев →» удаляются. Модалка `ScenarioCatalogModal` удаляется полностью; экшены `catalog_open`/`catalog_close`/`catalog_select`/`selected_scenario_consumed` и поле `catalog` в `AppState` удаляются. Существующие вызовы `catalog_open` из `LaunchFlyout` и `SurveySection` (Блоки 1 и 4) **остаются на месте как кнопки**, но дёргают `start_signal_flow` напрямую — визард откроется на шаге 1, где теперь и живёт каталог. Поле `selectedScenarioId` тоже удаляется — оно было нужно только для коммита выбора из модалки.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, shadcn/ui на base-ui, `motion/react`, vitest. Без новых зависимостей.

---

## File inventory

**Создаём:** ничего нового — нет новых компонентов; вся логика помещается в `Step1Scenario`, для скролла используем существующий `ScrollArea`.

**Модифицируем:**
- `src/sections/signals/steps/step-1-scenario.tsx` — переписать рендер: поиск + фильтры категорий + единый список в `ScrollArea`. Удалить ссылку на `selectedScenarioId`, кнопку «Все N сценариев →», секции «Базовые / Подобрано».
- `src/sections/shell/launch-flyout.tsx` — кнопка «Все N сценариев →» дёргает `start_signal_flow` вместо `catalog_open`.
- `src/sections/survey/survey-section.tsx` — `handleChooseScenario` дёргает `start_signal_flow` вместо `catalog_open` (и продолжает `survey_completed` + `onComplete`).
- `src/state/app-state.ts` — удалить из `Action` варианты `catalog_open`/`catalog_close`/`catalog_select`/`selected_scenario_consumed`; удалить поле `catalog` и `selectedScenarioId` из `AppState`/`initialState`; удалить ветки `case "catalog_*"` и `case "selected_scenario_consumed"` в редьюсере; удалить тип `CatalogReturnTo`.
- `src/state/app-state.test.ts` — удалить тесты на `catalog_*` (строки ~1062, 1080, 1087); убедиться что покрытие `start_signal_flow` остаётся.
- `src/app/page.tsx` — убрать импорт и рендер `<ScenarioCatalogModal>`; убрать чтение `catalog` из стора.
- `src/sections/signals/guided-signal-section.tsx` — удалить чтение и потребление `selectedScenarioId` (`selectedScenarioId`, `selected_scenario_consumed`).

**Удаляем:**
- `src/sections/signals/scenario-catalog-modal.tsx`

**Не трогаем (проверяем):**
- `src/data/scenarios.ts` — без изменений. Поля `isBase`/`isCurated` остаются в типе (используются `LaunchFlyout` для отбора `baseScenarios()`).
- `src/sections/signals/scenario-card.tsx` — без изменений (карточка только `name + description`).
- `src/sections/signals/steps/step-6-summary.tsx` — строка «Сценарий» уже есть (line 92-96), требование критерия №7 уже выполнено. Только верифицируем визуально.
- `src/data/scenarios.test.ts` — без изменений.

---

## Подразумеваемые UX-решения (зафиксированы)

1. **Сетка списка:** оставляем 3 колонки внутри шага. Текущий wizard уже использует `grid-cols-3 gap-3`, модалка — то же самое. С 24 сценариями × 3 колонки = 8 рядов; компактно, без чрезмерной прокрутки. Memory-правило про single column адресует список-секции (Сигналы, Кампании), а не пикеры визарда.
2. **Высота скроллящегося контейнера:** фиксированная `max-h` так, чтобы при разрешении ~1440×900 был виден ровно ≈3-4 ряда без отдельного scrollbar-аппендикса (значение подбирается в Task 3 — `max-h-[420px]` стартово, корректируем визуально на дев-сервере).
3. **Custom scrollbar:** через `ScrollArea` из `@/components/ui/scroll-area` (base-ui), thumb на `bg-border`, ширина 2.5 px — уже соответствует тёмной теме и брендовому хью.
4. **AND-семантика поиска и категорий:** если выбрано ≥1 категории и введён поисковый запрос — карточка должна удовлетворять обоим (так же, как в модалке сейчас).
5. **Чипы категорий:** мульти-выбор с `Set<ScenarioCategory>` (паттерн модалки), активные — `border-brand/50 bg-brand-muted`, неактивные — `border-border bg-card text-muted-foreground`.
6. **Пустое состояние:** одна центрированная строка-плейсхолдер по спеке. Текст: «Ничего не нашлось. Измените запрос или сбросьте фильтр.»
7. **Заголовок/подзаголовок:** остаются строго как сейчас: «Выберите сценарий» / «Готовая связка сигнала и кампании под бизнес-цель».

---

## Tasks

### Task 0: Подготовить worktree

**Files:** (внешние, без правок репозитория)

- [ ] **Step 1: Создать worktree off main**

Run:
```bash
git worktree add .worktrees/scenario-step-1 -b feature/scenario-step-1 main
cd .worktrees/scenario-step-1
npm install
```

- [ ] **Step 2: Зафиксировать рабочий каталог**

С этого момента все команды и правки — внутри `.worktrees/scenario-step-1/`. Не запускать `next dev` на порту 3000 одновременно с другим worktree. Если 3000 занят — `next dev -p 3001`.

- [ ] **Step 3: Sanity-проверка базы**

Run:
```bash
npm run lint
npm test
```
Expected: PASS (ноль ошибок до правок).

---

### Task 1: Удалить state-слой каталога

**Files:**
- Modify: `src/state/app-state.ts`
- Modify: `src/state/app-state.test.ts`

- [ ] **Step 1: Прочитать текущий `app-state.ts` (объёмные блоки 180-300, 760-795)**

Цель шага — увидеть точно те участки, что надо вычистить.

- [ ] **Step 2: Удалить из state-типа `catalog` и `selectedScenarioId`**

В `AppState`:
```ts
// УДАЛИТЬ:
selectedScenarioId: string | null;
catalog: { returnTo: CatalogReturnTo } | null;
```

В `initialState`:
```ts
// УДАЛИТЬ строки:
selectedScenarioId: null,
catalog: null,
```

В типе `Action`:
```ts
// УДАЛИТЬ варианты:
| { type: "catalog_open"; returnTo: CatalogReturnTo }
| { type: "catalog_close" }
| { type: "catalog_select"; scenarioId: string }
| { type: "selected_scenario_consumed" }
```

Удалить определение типа `CatalogReturnTo` (поискать через grep — обычно в том же файле).

- [ ] **Step 3: Удалить ветки в редьюсере**

В `appReducer` удалить `case "catalog_open":`, `case "catalog_close":`, `case "catalog_select":`, `case "selected_scenario_consumed":` целиком (строки ~769-794).

- [ ] **Step 4: Прогнать tsc/eslint, увидеть все красные точки**

Run:
```bash
npm run lint
```
Expected: FAIL с указанием всех мест, где `selectedScenarioId`, `catalog_open` и пр. ещё используются (это будут `app-state.test.ts`, `page.tsx`, `step-1-scenario.tsx`, `launch-flyout.tsx`, `survey-section.tsx`, `guided-signal-section.tsx`, `scenario-catalog-modal.tsx`). Ошибки временные — они закроются в следующих тасках.

- [ ] **Step 5: Удалить тесты каталога из `app-state.test.ts`**

Найти и удалить блок `it("catalog_open stores returnTo and closes the launch flyout", ...)` и любые соседние `it(...)` про `catalog_select`/`catalog_close`/`selected_scenario_consumed`. Если рядом есть `describe("catalog", ...)` — удалить его целиком.

Run:
```bash
npx vitest run src/state/app-state.test.ts
```
Expected: PASS (тесты, не относящиеся к каталогу, должны проходить).

- [ ] **Step 6: НЕ коммитить — есть зависящие файлы**

Этот таск оставляет красный lint в других файлах. Коммит делаем после Task 5, когда все потребители вычищены.

---

### Task 2: Удалить рендер модалки и её импорт из `page.tsx`

**Files:**
- Modify: `src/app/page.tsx`
- Delete: `src/sections/signals/scenario-catalog-modal.tsx`

- [ ] **Step 1: Убрать из `page.tsx`**

Удалить строку импорта:
```tsx
import { ScenarioCatalogModal } from "@/sections/signals/scenario-catalog-modal";
```

Удалить JSX-блок:
```tsx
<ScenarioCatalogModal
  open={catalog !== null}
  onClose={() => dispatch({ type: "catalog_close" })}
  onSelect={(scenarioId) => dispatch({ type: "catalog_select", scenarioId })}
/>
```

Удалить чтение `catalog` из useAppState (если такая деструктуризация есть в начале функции — проверить и убрать).

- [ ] **Step 2: Удалить файл модалки**

Run:
```bash
rm src/sections/signals/scenario-catalog-modal.tsx
```

- [ ] **Step 3: Verify**

Run:
```bash
grep -rn "ScenarioCatalogModal\|scenario-catalog-modal" src
```
Expected: пусто.

---

### Task 3: Переписать `Step1Scenario` под единый список + поиск + категории

**Files:**
- Modify: `src/sections/signals/steps/step-1-scenario.tsx`

- [ ] **Step 1: Полностью заменить содержимое файла**

```tsx
"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { StepContent } from "@/sections/signals/steps/step-content";
import { StepProps } from "@/types/campaign";
import { ScenarioCard } from "@/sections/signals/scenario-card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  SCENARIOS,
  SCENARIO_CATEGORIES,
  type Scenario,
  type ScenarioCategory,
} from "@/data/scenarios";

function matchesQuery(scenario: Scenario, q: string): boolean {
  if (!q) return true;
  return scenario.name.toLocaleLowerCase("ru-RU").includes(q);
}

export function Step1Scenario({ data, onNext }: StepProps) {
  const [query, setQuery] = useState("");
  const [activeCategories, setActiveCategories] = useState<Set<ScenarioCategory>>(new Set());

  const normalized = query.trim().toLocaleLowerCase("ru-RU");

  const filtered = useMemo(() => {
    return SCENARIOS.filter((s) => {
      if (!matchesQuery(s, normalized)) return false;
      if (activeCategories.size > 0 && !activeCategories.has(s.category)) return false;
      return true;
    });
  }, [normalized, activeCategories]);

  const selectedId =
    typeof data.scenario === "string" && data.scenario.length > 0 ? data.scenario : null;

  function toggleCategory(category: ScenarioCategory) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function handleSelect(id: string) {
    onNext({ scenario: id });
  }

  return (
    <StepContent
      title="Выберите сценарий"
      subtitle="Готовая связка сигнала и кампании под бизнес-цель"
    >
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по сценариям"
            aria-label="Поиск по сценариям"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {SCENARIO_CATEGORIES.map((category) => {
            const active = activeCategories.has(category);
            return (
              <button
                key={category}
                type="button"
                onClick={() => toggleCategory(category)}
                aria-pressed={active}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  active
                    ? "border-brand/50 bg-brand-muted text-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {category}
              </button>
            );
          })}
        </div>

        <ScrollArea className="max-h-[420px] pr-2">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Ничего не нашлось. Измените запрос или сбросьте фильтр.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {filtered.map((s) => (
                <ScenarioCard
                  key={s.id}
                  scenario={s}
                  selected={selectedId === s.id}
                  onClick={handleSelect}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </StepContent>
  );
}
```

- [ ] **Step 2: Проверить рендер визарда — открыть step-1 и пройтись глазами**

Run:
```bash
npm run dev -- -p 3001
```
(или 3000, если уже свободен)

Открыть `http://localhost:3001`, дойти до визарда (`+ Создать сигнал` → flyout → выбрать любой шаблон → шаг 1), убедиться:
- Заголовок «Выберите сценарий», подзаголовок «Готовая связка сигнала и кампании под бизнес-цель».
- Под подзаголовком — поле поиска с иконкой 🔍 и плейсхолдером «Поиск по сценариям».
- Под полем — 6 чипов (Привлечение · Онбординг · Апсейл · Удержание · Возврат · Реактивация).
- Под чипами — сетка карточек 3×N в прокручиваемой области с тонким скроллбаром.
- Нет секций «Базовые сценарии» / «Подобрано для вас», нет кнопки «Все 24 сценариев →».
- Клик по карточке — переход на шаг 2.

- [ ] **Step 3: Проверить поиск и фильтр**

В дев-сервере:
- Ввести «корзин» → остаётся только «Брошенная корзина».
- Очистить поиск, кликнуть на «Реактивация» → остаются только 3 карточки с категорией «Реактивация».
- Скомбинировать: «Реактивация» активен + ввести «годовщина» → видна только «Годовщина клиента».
- Ввести запрос с заведомо нулевым совпадением (например «xyzxyz») → виден empty state «Ничего не нашлось. Измените запрос или сбросьте фильтр.»

- [ ] **Step 4: Подобрать высоту скролл-области визуально**

Если на типичном разрешении в шаге 1 видно слишком мало карточек или, наоборот, нет скролла — подкрутить `max-h-[420px]` (например `max-h-[480px]` или `max-h-[360px]`). Готово, когда видно ~3 ряда и понятно, что внизу ещё есть карточки.

- [ ] **Step 5: Не коммитим, пока остальные потребители не вычищены**

---

### Task 4: Перенаправить кнопку Flyout на запуск визарда

**Files:**
- Modify: `src/sections/shell/launch-flyout.tsx`

- [ ] **Step 1: Заменить вызов `catalog_open` на `start_signal_flow`**

В `launch-flyout.tsx` найти блок (line ~162-168):
```tsx
<button
  type="button"
  onClick={() => dispatch({ type: "catalog_open", returnTo: "launcher" })}
  ...
>
  Все {scenarioCount} сценариев →
</button>
```

Заменить `onClick` на:
```tsx
onClick={() => {
  dispatch({ type: "start_signal_flow" });
  onClose();
}}
```

(Без `initialScenario` — пользователь выберет на шаге 1.)

- [ ] **Step 2: Проверить, что других вызовов `catalog_open` в файле нет**

Run:
```bash
grep -n "catalog_open\|catalog_close\|catalog_select" src/sections/shell/launch-flyout.tsx
```
Expected: пусто.

- [ ] **Step 3: Визуально проверить flyout**

Открыть Launch Flyout (кнопка `+` в сайдбаре или быстрый старт), нажать «Все 24 сценариев →». Ожидаем: flyout закрывается, открывается визард с шагом 1 (новый дизайн).

---

### Task 5: Перенаправить кнопку Survey на запуск визарда

**Files:**
- Modify: `src/sections/survey/survey-section.tsx`

- [ ] **Step 1: Заменить `catalog_open` в `handleChooseScenario`**

В `survey-section.tsx` найти (line ~77-82):
```tsx
function handleChooseScenario() {
  if (phase.kind !== "scenarios") return;
  dispatch({ type: "survey_completed", survey: phase.survey });
  dispatch({ type: "catalog_open", returnTo: "onboarding" });
  onComplete();
}
```

Заменить на:
```tsx
function handleChooseScenario() {
  if (phase.kind !== "scenarios") return;
  dispatch({ type: "survey_completed", survey: phase.survey });
  dispatch({ type: "start_signal_flow" });
  onComplete();
}
```

- [ ] **Step 2: Сверка — других вызовов нет**

Run:
```bash
grep -rn "catalog_open\|catalog_close\|catalog_select\|selected_scenario_consumed\|selectedScenarioId" src
```
Expected: пусто (включая `guided-signal-section.tsx` — её правим в Task 6).

Если в `guided-signal-section.tsx` всё ещё остаются упоминания — это нормально, чистим в следующем таске.

---

### Task 6: Вычистить `guided-signal-section.tsx`

**Files:**
- Modify: `src/sections/signals/guided-signal-section.tsx`

- [ ] **Step 1: Прочитать файл, найти все упоминания `selectedScenarioId` и `selected_scenario_consumed`**

Run:
```bash
grep -n "selectedScenarioId\|selected_scenario_consumed" src/sections/signals/guided-signal-section.tsx
```

- [ ] **Step 2: Удалить логику чтения и потребления**

Убрать `selectedScenarioId` из деструктуризации `useAppState()`. Удалить блоки `useMemo`/`useEffect`, которые читают `selectedScenarioId` и диспатчат `selected_scenario_consumed` (line ~45-62). Логика `initialScenario` остаётся — она приходит из `view: { kind: "guided-signal", initialScenario }` (через `start_signal_flow`).

Если `getScenario(selectedScenarioId)` использовался для пересчёта `initialScenario` — заменить на чтение из `view.initialScenario` напрямую (или удалить, если избыточно).

- [ ] **Step 3: Финальный sweep**

Run:
```bash
grep -rn "selectedScenarioId\|selected_scenario_consumed\|catalog_open\|catalog_close\|catalog_select\|CatalogReturnTo\|ScenarioCatalogModal" src
```
Expected: пусто.

---

### Task 7: Финальная верификация и коммит

**Files:** все вышеперечисленные

- [ ] **Step 1: Lint**

Run:
```bash
npm run lint
```
Expected: PASS, ноль предупреждений.

- [ ] **Step 2: Type-check (через build)**

Run:
```bash
npm run build
```
Expected: PASS. Если падает — читать ошибку, чинить, повторять.

- [ ] **Step 3: Юнит-тесты**

Run:
```bash
npm test
```
Expected: PASS. Особое внимание — `app-state.test.ts` и `scenarios.test.ts`.

- [ ] **Step 4: Манульный smoke в браузере**

Запустить дев-сервер (если ещё не запущен), пройти 9 критериев приёмки из спеки (см. ниже раздел «Acceptance checklist»). Для каждого пункта — провести действие, убедиться, что результат соответствует.

- [ ] **Step 5: Коммит**

Run:
```bash
git add -A
git status
```
Сверить список изменённых/удалённых файлов с File inventory. Затем:
```bash
git commit -m "$(cat <<'EOF'
feat(wizard): inline scenario catalog into step-1, drop modal

Step-1 теперь содержит полный каталог: поиск + 6 категорий +
прокручиваемый список всех сценариев. Модалка ScenarioCatalogModal
удалена; вызовы из LaunchFlyout и Survey перенаправлены на
start_signal_flow (открытие визарда на шаге 1). Удалены экшены
catalog_* и поля catalog/selectedScenarioId из AppState.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Отчёт пользователю**

Сообщить путь worktree (`.worktrees/scenario-step-1`) и имя ветки (`feature/scenario-step-1`). Не мерджить и не пушить — это решение пользователя.

---

## Acceptance checklist (из спеки)

При финальном ручном smoke (Task 7 Step 4) проверить каждое:

1. **AC#1** — Модалка каталога не открывается ни из шага 1, ни из Flyout, ни из Survey. (Откроем Flyout и Survey, нажмём кнопки → откроется визард с шагом 1.)
2. **AC#2** — На шаге 1 есть: заголовок «Выберите сценарий», поиск, 6 чипов категорий, полный список 24 сценариев.
3. **AC#3** — Нет секций «Базовые / Подобрано», нет кнопки «Все N сценариев →».
4. **AC#4** — Внутренний скролл списка работает, скроллбар тонкий и в стиле темы (через `ScrollArea`).
5. **AC#5** — Поиск + категории работают совместно (см. Task 3 Step 3).
6. **AC#6** — Карточка показывает только `name + description` — никаких новых полей.
7. **AC#7** — Шаг 6 «Проверьте настройки сигнала» содержит строку «Сценарий» с названием выбранного сценария (уже есть в коде; проверяем, что не сломали).
8. **AC#8** — Шаги 2–5, 7, 8 работают как раньше; при смене сценария downstream-шаги сбрасываются (логика в `handleNext` line 113-121 — не трогали).
9. **AC#9** — Тексты UI соответствуют разделу «Тексты интерфейса» спеки (плейсхолдер, чипы, кнопка «Выбрать», пустое состояние).

---

## Self-review

**Spec coverage:** все 9 критериев приёмки покрыты (см. чек-лист выше). AS-IS файлы и места, упомянутые в спеке (`step-1-scenario.tsx`, `scenario-catalog-modal.tsx`, `scenario-card.tsx`, `launch-flyout.tsx`, `campaign-workspace.tsx`/шаг 6, `scenarios.ts`) — пройдены каждый.

**Placeholder scan:** нет «TBD», «implement later» и т.п. Все шаги содержат конкретный код, конкретные команды, ожидаемые результаты.

**Type consistency:** `start_signal_flow` принимает опциональный `initialScenario` — без него визард открывается «чистым» на шаге 1 (поведение уже описано в `app-state.ts:296-304`). `ScenarioCategory`/`SCENARIO_CATEGORIES`/`Scenario` — те же типы, что в `src/data/scenarios.ts`. Высота `max-h-[420px]` — стартовое значение, корректируется визуально (зафиксировано в Step 4 Task 3).

**Не покрыто (намеренно):** иконки/жизненный цикл/счётчики на карточке — спека прямо требует «не меняем карточку».

# Анимация «Показать все» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить резкое («дерганое») мгновенное переключение между блоком «Подобрали для вас» и каталогом «все сценарии» на плавное вертикальное сжатие/разжатие через motion v12.

**Architecture:** В компоненте `Step1Scenario` обе ветки рендера (`showAll === false` → подборка; `showAll === true` → каталог) оборачиваются в `<AnimatePresence mode="wait" initial={false}>` с `motion.section`/`motion.div`, которые анимируют `height` (`0 ↔ "auto"`) и `opacity`. Easing — exponential ease-out-quart `[0.23, 1, 0.32, 1]` (то же, что `--ease-out` в `globals.css`, и то, что уже используется в `suggestion-bar.tsx`/`step-content.tsx`). `mode="wait"` гарантирует, что уходящий блок схлопывается до того, как появится новый — это и есть «сжать одно, разжать другое». Поведенческая логика (`showAll`, `onNext`, фильтры) не меняется — поэтому существующий тест-сьют `step-1-scenario.test.tsx` остаётся зелёным.

**Tech Stack:** Next.js 16, React, motion v12 (`import { motion, AnimatePresence } from "motion/react"`), Tailwind v4, Vitest + @testing-library/react (jsdom).

---

## Контекст (разведка — уже выполнена, не переделывать)

- **Целевой файл:** `src/sections/campaigns/wizard/steps/step-1-scenario.tsx` (компонент `Step1Scenario`, строки 58–214).
- **Toggle-стейт:** `const [showAll, setShowAll] = useState(false)` (строка 59).
- **Блок «Подобрали для вас»:** ветка `!showAll` — `<section>` со строки 108, заголовок «Подобрали для вас» (110), грид `CURATED_SCENARIOS` (112–122), кнопка `Показать все` (123–129, `onClick={() => setShowAll(true)}`).
- **Блок «все сценарии»:** ветка `else` (`<>` со строки 132) — кнопка `Свернуть` (133–139, `onClick={() => setShowAll(false)}`), поиск (141–153), чипсы категорий (155–175), секции групп (177–208).
- **Motion в репо:** `motion`/`AnimatePresence` импортируются из `motion/react` (например `src/sections/shell/suggestion-bar.tsx:3`). motion v12.38.0 ре-экспортит framer-motion и поддерживает `animate={{ height: "auto" }}` (motion сам измеряет авто-высоту, явный замер не нужен).
- **Easing-токены** (`src/app/globals.css:61–63`): `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` (quart), `--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1)`. В JS-коде easing задаётся массивом `[0.23, 1, 0.32, 1]` (см. `suggestion-bar.tsx:17`, `step-content.tsx:85`). **Переиспользуем `[0.23, 1, 0.32, 1]`.**
- **PRODUCT.md, принцип 8:** «Анимация — точно и редко. Exponential easing (ease-out-quart/quint), без bounce/elastic. Анимируем opacity и transform — не height/width/padding.» **Исключение:** пользователь явно просит вертикальное сжатие/разжатие → `height` анимируется намеренно (height + opacity, без width/padding). Это согласовано в правке.
- **Тест-раннер:** `npm test` (→ `vitest run`). Тест-файл соседствует: `src/sections/campaigns/wizard/steps/step-1-scenario.test.tsx`. `StepContent` в тесте замокан, рендерит детей синхронно.
- **Все UI-строки — только русские:** «Показать все» / «Свернуть» (не менять).

## File Structure

- **Modify:** `src/sections/campaigns/wizard/steps/step-1-scenario.tsx` — добавить импорт motion, константу easing, обернуть обе ветรки в `AnimatePresence` + `motion`-обёртки. Единственный файл с кодовыми изменениями.
- **Modify (тесты):** `src/sections/campaigns/wizard/steps/step-1-scenario.test.tsx` — добавить один поведенческий тест на смену рендера через toggle (остальные кейсы уже покрывают поведение и должны остаться зелёными).

---

## Task 0: Worktree (изоляция по AGENTS.md)

**Files:** нет (инфраструктура).

- [ ] **Step 1: Создать worktree off `main`**

Run:
```bash
cd /Users/macintosh/Documents/work/afina-ai-first_camping-centric
git worktree add .worktrees/block3-showall-anim -b feature/block3-showall-anim main
cd .worktrees/block3-showall-anim
npm install
```
Expected: worktree создан, `npm install` завершается без ошибок. Все дальнейшие команды — из `.worktrees/block3-showall-anim`.

- [ ] **Step 2: Sanity — текущий тест-сьют зелёный до правок**

Run:
```bash
npm test -- src/sections/campaigns/wizard/steps/step-1-scenario.test.tsx
```
Expected: PASS (все существующие кейсы). Это базлайн — поведение не должно сломаться после анимации.

---

## Task 1: Поведенческий тест на toggle-рендер (TDD-страховка)

Цель: явный регресс-тест, что toggle **меняет, какой блок отрисован** (а не просто прячет визуально). Анимацию юнит-тест не проверяет (jsdom не считает layout-высоты) — её верифицируем вручную в Task 3. Этот тест защищает от поломки логики при обёртывании в `AnimatePresence`.

**Files:**
- Test: `src/sections/campaigns/wizard/steps/step-1-scenario.test.tsx`

- [ ] **Step 1: Дописать failing-тест в конец describe-блока**

В файле `src/sections/campaigns/wizard/steps/step-1-scenario.test.tsx`, внутри `describe("Step1Scenario — curated default + «Показать все» catalog", ...)`, перед закрывающей `});` (после кейса на строке 158–165) добавить:

```tsx
  it("toggling «Показать все»/«Свернуть» swaps which block is rendered (curated header ↔ search)", () => {
    renderStep();

    // Default: curated block rendered, catalog search NOT rendered.
    expect(screen.getByText("Подобрали для вас")).toBeInTheDocument();
    expect(screen.queryByLabelText("Поиск по сценариям")).not.toBeInTheDocument();

    // Expand → catalog rendered, curated header gone.
    fireEvent.click(screen.getByRole("button", { name: "Показать все" }));
    expect(screen.getByLabelText("Поиск по сценариям")).toBeInTheDocument();
    expect(screen.queryByText("Подобрали для вас")).not.toBeInTheDocument();

    // Collapse → back to curated, catalog gone.
    fireEvent.click(screen.getByRole("button", { name: "Свернуть" }));
    expect(screen.getByText("Подобрали для вас")).toBeInTheDocument();
    expect(screen.queryByLabelText("Поиск по сценариям")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Запустить — тест должен ПРОЙТИ на текущем коде**

Run:
```bash
npm test -- src/sections/campaigns/wizard/steps/step-1-scenario.test.tsx
```
Expected: PASS. (Текущий код уже корректно меняет рендер по `showAll` — тест фиксирует это поведение как контракт перед добавлением анимации. Это «характеристический» тест, а не классический red-first: его задача — поймать регресс на Task 2, где мы оборачиваем ветки в `AnimatePresence mode="wait"`.)

> Примечание для исполнителя: `AnimatePresence` с `mode="wait"` в jsdom может НЕ размонтировать уходящий блок мгновенно (ждёт `exit`-анимации, а в jsdom анимации не запускаются «по-настоящему»). Если после Task 2 этот тест упадёт на `queryByText("Подобрали для вас")` (старый блок ещё в DOM), это ожидаемая особенность jsdom + AnimatePresence — см. Task 2, Step 5 (фоллбэк-настройка теста). НЕ переписывай логику компонента под тест.

- [ ] **Step 3: Commit**

```bash
git add src/sections/campaigns/wizard/steps/step-1-scenario.test.tsx
git commit -m "test(step1-scenario): characterize «Показать все»/«Свернуть» block swap"
```

---

## Task 2: Обернуть toggle в motion + AnimatePresence

**Files:**
- Modify: `src/sections/campaigns/wizard/steps/step-1-scenario.tsx`

- [ ] **Step 1: Добавить импорт motion и константу easing**

В `src/sections/campaigns/wizard/steps/step-1-scenario.tsx` после строки 3 (`import { useMemo, useState } from "react";`) добавить импорт:

```tsx
import { AnimatePresence, motion } from "motion/react";
```

После блока импортов (после строки 16, закрывающей импорт из `@/data/scenarios`) добавить константу transition (exponential ease-out-quart, как `--ease-out` в globals.css; зеркалит `suggestion-bar.tsx:17`):

```tsx
/** Вертикальное сжатие/разжатие toggle-блоков. Exponential ease-out-quart
 *  (= --ease-out в globals.css), без bounce/elastic. height + opacity. */
const COLLAPSE_TRANSITION = { duration: 0.32, ease: [0.23, 1, 0.32, 1] } as const;
```

- [ ] **Step 2: Обернуть обе ветки в AnimatePresence + motion**

Заменить весь JSX-блок `<div className="flex flex-col gap-4"> ... </div>` (строки 106–211) на версию с `AnimatePresence`/`motion`. Внешний `<div>` остаётся; внутри — `AnimatePresence mode="wait" initial={false}` с двумя взаимоисключающими `motion`-обёртками. `overflow-hidden` обязателен, иначе при height-анимации контент «вылазит». Полный новый блок:

```tsx
      <div className="flex flex-col gap-4">
        <AnimatePresence mode="wait" initial={false}>
          {!showAll ? (
            <motion.section
              key="curated"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={COLLAPSE_TRANSITION}
              className="flex flex-col gap-3 overflow-hidden"
            >
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Подобрали для вас
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {CURATED_SCENARIOS.map((s) => (
                  <ScenarioCard
                    key={s.id}
                    scenario={s}
                    selected={selectedId === s.id}
                    onClick={handleSelect}
                    sourceLabel={sourceTypeLabel(s.recommendedSourceType)}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Показать все
              </button>
            </motion.section>
          ) : (
            <motion.div
              key="catalog"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={COLLAPSE_TRANSITION}
              className="flex flex-col gap-4 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className="self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Свернуть
              </button>

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

              <div>
                {groups.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Ничего не нашлось. Измените запрос или сбросьте фильтр.
                  </p>
                ) : (
                  <div className="flex flex-col gap-6 pb-1">
                    {groups.map((group) => (
                      <section key={group.category} className="flex flex-col gap-3">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {group.category}{" "}
                          <span className="text-muted-foreground/60">
                            ({group.count})
                          </span>
                        </h2>
                        <div className="grid grid-cols-3 gap-3">
                          {group.scenarios.map((s) => (
                            <ScenarioCard
                              key={s.id}
                              scenario={s}
                              selected={selectedId === s.id}
                              onClick={handleSelect}
                              sourceLabel={sourceTypeLabel(s.recommendedSourceType)}
                              curatedLabel={s.isCurated ? "Подобрано для вас" : undefined}
                            />
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
```

Ключевые отличия от исходника:
- `<section>` → `<motion.section key="curated">`; внешний `<>...</>` → `<motion.div key="catalog">`.
- Добавлены `initial`/`animate`/`exit` на `height` + `opacity`, общий `transition={COLLAPSE_TRANSITION}`.
- Добавлен `overflow-hidden` к обоим контейнерам (на каталоге класс стал `flex flex-col gap-4 overflow-hidden`).
- `mode="wait"` + `initial={false}` — уходящий блок схлопывается до появления нового; при первом mount без входной анимации.
- Логика (`onNext`, фильтры, лейблы) и все русские строки — без изменений.

- [ ] **Step 3: Запустить lint**

Run:
```bash
npm run lint
```
Expected: без ошибок в `step-1-scenario.tsx` (нет неиспользуемых импортов, motion типизирован).

- [ ] **Step 4: Запустить тесты**

Run:
```bash
npm test -- src/sections/campaigns/wizard/steps/step-1-scenario.test.tsx
```
Expected: PASS — все кейсы, включая новый из Task 1.

- [ ] **Step 5 (фоллбэк — только если Step 4 упал из-за AnimatePresence в jsdom):**

Если падают кейсы вида `queryByText("Подобрали для вас")` / `queryByLabelText("Поиск по сценариям")` **именно потому, что уходящий блок не размонтирован** (jsdom не доигрывает `exit`), добавь в начало тест-файла мок, отключающий ожидание exit-анимации (motion размонтирует синхронно). Сразу после `vi.mock(".../step-content", ...)` (строка 10–14) вставь:

```tsx
// jsdom не запускает реальные анимации: заставляем AnimatePresence
// размонтировать выходящий узел синхронно, чтобы query* видели только
// активный блок. Сама анимация проверяется вручную (см. план, Task 3).
vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return {
    ...actual,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});
```

Затем повторно запусти Step 4 — должно стать PASS. (Это легитимный приём: мы тестируем поведение toggle, а не саму анимацию; анимацию верифицируем в браузере.) Если Step 4 прошёл без фоллбэка — этот шаг пропусти.

- [ ] **Step 6: Commit**

```bash
git add src/sections/campaigns/wizard/steps/step-1-scenario.tsx src/sections/campaigns/wizard/steps/step-1-scenario.test.tsx
git commit -m "feat(step1-scenario): анимировать «Показать все» — вертикальное сжатие/разжатие (aim #1)"
```

---

## Task 3: Ручная верификация анимации (основной критерий приёмки)

**Честно:** ядро правки — плавность анимации — **не покрывается юнит-тестом** (jsdom не считает layout). Главный критерий приёмки — этот ручной прогон.

**Files:** нет.

- [ ] **Step 1: Поднять dev-сервер на свободном порту**

Из `.worktrees/block3-showall-anim`. Порт 3000 может занимать основной чекаут другого агента — используем 3001 (по AGENTS.md).

Run:
```bash
npm run dev -- -p 3001
```
Expected: `Ready on http://localhost:3001`.

- [ ] **Step 2: Открыть экран выбора сценария**

В браузере открыть `http://localhost:3001`, дойти до визарда кампании, шаг 1 «Выберите сценарий для кампании» (блок «Подобрали для вас» виден по умолчанию).

- [ ] **Step 3: Проверить «Показать все»**

Кликнуть «Показать все». Убедиться:
- блок «Подобрали для вас» **плавно сжимается по вертикали** (height → 0 + fade-out), не исчезает мгновенно;
- каталог (поиск + чипсы + секции) **плавно разжимается по вертикали** (height 0 → auto + fade-in) после схлопывания подборки;
- нет «прыжка»/«дерганья», нет bounce/упругости, движение спокойное ease-out (~0.32s).

- [ ] **Step 4: Проверить «Свернуть»**

Кликнуть «Свернуть». Убедиться, что происходит обратное: каталог сжимается, подборка разжимается — так же плавно, без рывков.

- [ ] **Step 5: Проверить отсутствие визуальных артефактов**

Во время обеих анимаций: контент не «вылазит» за границы (работает `overflow-hidden`), скролл не дёргается, жёлтый акцент не мигает. Опционально повторить толчком туда-обратно несколько раз подряд — анимация должна корректно прерываться и доигрывать в новом направлении (motion гасит in-flight автоматически).

- [ ] **Step 6: Остановить dev-сервер**

`Ctrl-C` в терминале dev-сервера.

---

## Task 4: Финальная проверка перед сдачей

**Files:** нет.

- [ ] **Step 1: Полный lint + тесты worktree**

Run:
```bash
npm run lint && npm test
```
Expected: lint чист; vitest — все тесты PASS (включая step-1-scenario сьют).

- [ ] **Step 2: Сообщить путь worktree и ветку пользователю**

По AGENTS.md очистку (`git worktree remove`, удаление ветки) делает пользователь. В финальном сообщении указать:
- worktree: `.worktrees/block3-showall-anim`
- branch: `feature/block3-showall-anim`
- что верификация анимации — ручная (Task 3), юнит-тесты покрывают только toggle-поведение.

---

## Self-Review (выполнено при написании плана)

1. **Spec coverage (Блок 3 / правка 1):** «вертикально сжимать "подобрали для вас", разжимать блок со всеми сценариями; на "свернуть" — наоборот; Motion: анимировать height/opacity через AnimatePresence/layout; easing — ease-out-quart» — покрыто Task 2 (height+opacity, `AnimatePresence mode="wait"`, `[0.23, 1, 0.32, 1]`). Поиск точного файла — выполнен (`step-1-scenario.tsx`). ✅
2. **Placeholder scan:** нет TODO/«добавить обработку» — весь JSX и тест приведены целиком. ✅
3. **Type consistency:** `COLLAPSE_TRANSITION` определена один раз и используется в обеих обёртках; импорт `{ AnimatePresence, motion } from "motion/react"` соответствует конвенции репо (`suggestion-bar.tsx`); ключи `key="curated"`/`key="catalog"` уникальны. ✅
4. **Русские строки:** «Показать все»/«Свернуть»/«Подобрали для вас»/«Поиск по сценариям» — без изменений, английских строк не вводится. ✅
5. **PRODUCT.md anim-принципы:** exponential ease-out-quart, без bounce/elastic, длительность 0.32s (редко/точно). Анимация height — намеренное исключение под явный запрос пользователя (height + opacity, без width/padding). ✅
6. **Тест-конвенции репо:** Vitest + @testing-library/react, мок `StepContent`, `fireEvent.click` по русским ролям-именам — как в существующем сьюте. Новый тест следует тому же стилю; предусмотрен честный фоллбэк для jsdom+AnimatePresence. ✅

# Финал визарда, разрыв под боковиком, снос сегментной генерации — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Поставить явную точку в конце визарда (развилка на шаге бюджета → экран «Создаём кампанию» → карточка), починить разрыв контента под открытым боковиком и снести генератор гигантских сегментных графов.

**Architecture:** Экран ожидания — не новый шаг визарда, а состояние `creating` внутри `CampaignWorkspace`: пока оно взведено, колонка шагов и степпер не рендерятся, вместо них — переиспользованный `SurveyAwaiting`. Создание кампании (`onLaunchRequested`) откладывается до конца анимации, дальше работает существующая цепочка `campaign_created_from_wizard` → карточка. Снос сегментной генерации — удаление одной ветки `createTemplate` и функции за ней; защита сегментных сплитов в `mergeChannelNodes` остаётся, потому что сплиты никуда не делись.

**Tech Stack:** Next.js (версия репозитория, см. `node_modules/next/dist/docs/`), React, TypeScript, Tailwind, motion/react, Vitest + Testing Library (jsdom), Playwright для e2e.

**Spec:** `docs/superpowers/specs/2026-08-31-wizard-finale-closure-design.md`

## Global Constraints

- Работа идёт в воркти́ри `.worktrees/wizard-finale` на ветке `feature/wizard-finale`. В `main` не пушить.
- Юнит-тесты: `npm test` (vitest, `src/**/*.test.ts(x)`). Линт: `npm run lint`.
- Тексты интерфейса — по-русски, кавычки-ёлочки. Точные строки:
  - развилка на шаге бюджета: `Вот прогноз бюджета. Можно вернуться назад и что-то поменять — или создать кампанию, готовую к запуску.`
  - лейбл кнопки: `Создать кампанию`
  - заголовок экрана ожидания: `Создаём кампанию`
  - подзаголовок экрана ожидания: `Собираем сценарий, каналы и расписание в готовую к запуску кампанию.`
  - сноска экрана ожидания: `Все кампании хранятся в разделе «Кампании»`
  - подсказка про граф: `Кликните на граф, чтобы точечно поправить кампанию`
- Длительность экрана ожидания — `4000` мс.
- Жёлтый акцент (`bg-primary`) — не больше одного элемента на экран (PRODUCT.md, принцип 2).
- `git stash` не запускать ни при каких обстоятельствах — воркти́ри от этого рассыпается.

---

### Task 1: `SurveyAwaiting` получает длительность и сноску

`SurveyAwaiting` — существующий экран ожидания продукта (заголовок, подзаголовок, прогресс-бар, процент). Сейчас длительность зашита модульной константой, а места под тихую строку внизу нет. Обе анкетных точки вызова (`survey-section.tsx:151`, `:179`) новые пропсы не передают и обязаны продолжить работать без правок.

**Files:**
- Modify: `src/sections/survey/survey-awaiting.tsx`
- Test: `src/sections/survey/survey-awaiting.test.tsx` (создать)

**Interfaces:**
- Consumes: ничего.
- Produces: `SurveyAwaiting` с сигнатурой пропсов
  ```ts
  interface SurveyAwaitingProps {
    onDone: () => void;
    title?: string;
    subtitle?: string;
    /** Длительность заполнения прогресс-бара, мс. По умолчанию 2400. */
    durationMs?: number;
    /** Тихая строка под процентом. */
    footnote?: React.ReactNode;
  }
  ```
  Важно для Task 3: `onDone` вызывается через `durationMs + 200` мс — 200 мс это существующая пауза `setTimeout` после заполнения бара, её никто не убирает.

- [ ] **Step 1: Написать падающий тест**

Создать `src/sections/survey/survey-awaiting.test.tsx`:

```tsx
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { SurveyAwaiting } from "./survey-awaiting";

describe("SurveyAwaiting", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("по умолчанию завершается через 2400мс + 200мс паузы — анкета не затронута", () => {
    const onDone = vi.fn();
    render(<SurveyAwaiting onDone={onDone} />);

    act(() => {
      vi.advanceTimersByTime(2400);
    });
    expect(onDone).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("durationMs растягивает ожидание — на дефолтной отсечке ещё не готово", () => {
    const onDone = vi.fn();
    render(<SurveyAwaiting onDone={onDone} durationMs={4000} />);

    // Дефолтные 2400 + 200 прошли, но заказано 4000 — рано.
    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(onDone).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("footnote рендерится под прогрессом", () => {
    render(
      <SurveyAwaiting onDone={vi.fn()} footnote="Все кампании хранятся в разделе «Кампании»" />,
    );
    expect(
      screen.getByText("Все кампании хранятся в разделе «Кампании»"),
    ).toBeInTheDocument();
  });

  it("без footnote лишнего узла нет", () => {
    render(<SurveyAwaiting onDone={vi.fn()} />);
    expect(screen.queryByText(/хранятся в разделе/)).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить тест, убедиться что падает**

Запустить: `npx vitest run src/sections/survey/survey-awaiting.test.tsx`
Ожидается: FAIL — тест на `durationMs` завершится раньше срока (проп игнорируется), тест на `footnote` не найдёт текст.

- [ ] **Step 3: Реализовать**

В `src/sections/survey/survey-awaiting.tsx`:

Переименовать модульную константу в дефолт и добавить пропсы. Интерфейс:

```tsx
const DEFAULT_DURATION = 2400; // ms — short, this is a mock
const TICK = 50;

interface SurveyAwaitingProps {
  onDone: () => void;
  /** Override the heading. Defaults to the task-analysis copy. */
  title?: string;
  /** Override the sub-line. When omitted, falls back to the source-agnostic
   *  task-analysis copy. */
  subtitle?: string;
  /** Длительность заполнения бара, мс. Анкета не передаёт — держит свои 2400. */
  durationMs?: number;
  /** Тихая строка под процентом (например, где хранятся кампании). */
  footnote?: React.ReactNode;
}
```

Сигнатура компонента:

```tsx
export function SurveyAwaiting({
  onDone,
  title,
  subtitle,
  durationMs = DEFAULT_DURATION,
  footnote,
}: SurveyAwaitingProps) {
```

В эффекте заменить `TOTAL_DURATION` на `durationMs` и добавить его в массив зависимостей:

```tsx
  useEffect(() => {
    const steps = durationMs / TICK;
    let count = 0;
    const id = setInterval(() => {
      count++;
      setProgress(Math.min((count / steps) * 100, 100));
      if (count >= steps) {
        clearInterval(id);
        setTimeout(() => onDoneRef.current(), 200);
      }
    }, TICK);
    return () => clearInterval(id);
  }, [durationMs]);
```

Под блоком с процентом добавить сноску (внутри того же `<div className="mt-8 flex flex-col gap-3">`, последним потомком):

```tsx
        {footnote && (
          <p className="mt-1 text-xs text-muted-foreground/70">{footnote}</p>
        )}
```

- [ ] **Step 4: Запустить тесты, убедиться что проходят**

Запустить: `npx vitest run src/sections/survey/survey-awaiting.test.tsx`
Ожидается: PASS, 4 теста.

- [ ] **Step 5: Убедиться что анкета не сломалась**

Запустить: `npx vitest run src/sections/survey/`
Ожидается: PASS. Оба вызова в `survey-section.tsx` пропсов не передают и работают на дефолтах.

- [ ] **Step 6: Коммит**

```bash
git add src/sections/survey/survey-awaiting.tsx src/sections/survey/survey-awaiting.test.tsx
git commit -m "feat(survey-awaiting): durationMs и footnote для переиспользования вне анкеты"
```

---

### Task 2: Развилка и лейбл кнопки на шаге «Прогноз бюджета»

Шаг перестаёт читаться как «ещё один шаг» и начинает читаться как последняя развилка. Формулировка — из комментов Никиты, лейбл кнопки честно называет действие.

Осторожно: в режиме точечной правки с карточки шаг рендерится с `footerOverride`, где свой `continueLabel`. Ни абзац-развилка, ни новый дефолтный лейбл там появляться не должны — правка существующей кампании ничего не создаёт.

**Files:**
- Modify: `src/sections/campaigns/wizard/steps/step-budget.tsx:455-463`
- Modify: `src/sections/campaigns/wizard/steps/step-budget.dom.test.tsx:44,60` (лейбл)
- Modify: `src/sections/campaigns/wizard/steps/step-budget.test.tsx:186,205` (лейбл)
- Test: `src/sections/campaigns/wizard/steps/step-budget.dom.test.tsx` (новый describe)

**Interfaces:**
- Consumes: ничего из Task 1.
- Produces: кнопка шага бюджета доступна по имени `Создать кампанию` — Task 3 кликает именно её.

- [ ] **Step 1: Написать падающий тест**

Дописать в конец `src/sections/campaigns/wizard/steps/step-budget.dom.test.tsx`:

```tsx
describe("StepBudget — финальная развилка визарда", () => {
  it("показывает развилку: назад поправить или создать кампанию", () => {
    renderStep();
    expect(
      screen.getByText(
        "Вот прогноз бюджета. Можно вернуться назад и что-то поменять — или создать кампанию, готовую к запуску.",
      ),
    ).toBeInTheDocument();
  });

  it("основная кнопка называет действие — «Создать кампанию», а не «Далее»", () => {
    renderStep();
    expect(
      screen.getByRole("button", { name: "Создать кампанию" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Далее" })).toBeNull();
  });

  // Точечная правка с карточки ничего не создаёт: там свой лейбл футера, и
  // текст про создание кампании был бы прямой ложью.
  it("в режиме правки развилки нет, лейбл — из footerOverride", () => {
    render(
      <StepBudget
        data={streamData}
        onNext={vi.fn()}
        onBack={vi.fn()}
        active
        footerOverride={{ continueLabel: "Применить и вернуться", backLabel: "Отмена" }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Применить и вернуться" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Можно вернуться назад и что-то поменять/)).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить тест, убедиться что падает**

Запустить: `npx vitest run src/sections/campaigns/wizard/steps/step-budget.dom.test.tsx`
Ожидается: FAIL — текста развилки нет, кнопка называется «Далее».

- [ ] **Step 3: Реализовать**

В `src/sections/campaigns/wizard/steps/step-budget.tsx` заменить блок футера (строки 455–463) на:

```tsx
        {!footerOverride?.hidden && (
          <>
            {/* Последняя развилка визарда (комменты от 31.08): шаг перестаёт
                читаться как «ещё один шаг». В режиме точечной правки с
                карточки (footerOverride) ничего не создаётся — там текста нет. */}
            {!footerOverride && (
              <p className="text-sm text-muted-foreground">
                Вот прогноз бюджета. Можно вернуться назад и что-то поменять — или
                создать кампанию, готовую к запуску.
              </p>
            )}
            <StepFooter
              onBack={onBack}
              onContinue={proceed}
              continueLabel={footerOverride?.continueLabel ?? "Создать кампанию"}
              backLabel={footerOverride?.backLabel}
              continueDisabled={!canContinue}
            />
          </>
        )}
```

- [ ] **Step 4: Починить существующие тесты, ожидавшие «Далее»**

Четыре места ждут старый лейбл при прямом рендере `StepBudget` (без `footerOverride`):

- `src/sections/campaigns/wizard/steps/step-budget.dom.test.tsx:44` и `:60`
- `src/sections/campaigns/wizard/steps/step-budget.test.tsx:186` и `:205`

В каждом заменить `{ name: "Далее" }` на `{ name: "Создать кампанию" }`. Больше ничего в этих тестах не трогать — они про сохранение потолка дневного бюджета и про доступность кнопки, а не про её подпись.

- [ ] **Step 5: Запустить тесты, убедиться что проходят**

Запустить: `npx vitest run src/sections/campaigns/wizard/steps/`
Ожидается: PASS.

- [ ] **Step 6: Коммит**

```bash
git add src/sections/campaigns/wizard/steps/step-budget.tsx src/sections/campaigns/wizard/steps/step-budget.dom.test.tsx src/sections/campaigns/wizard/steps/step-budget.test.tsx
git commit -m "feat(step-budget): развилка финала визарда и лейбл «Создать кампанию»"
```

---

### Task 3: Экран «Создаём кампанию» между визардом и карточкой

Сейчас `handleLaunchFromBudget` вызывает `onLaunchRequested` синхронно, и редьюсер в том же переходе меняет `view` на карточку — между последним кликом и карточкой нет ни кадра. Вставляем четырёхсекундный экран ожидания.

Экран НЕ становится шагом визарда: попав в `stepsForIntent`, он оказался бы кликабельной позицией степпера и целью `computeStepTransition`, а из экрана ожидания нельзя ни выйти, ни вернуться.

**Files:**
- Modify: `src/sections/campaigns/wizard/campaign-workspace.tsx` (импорт, состояние `creating`, `handleLaunchFromBudget:216-231`, блок рендера `:267-310`)
- Modify: `src/sections/campaigns/wizard/campaign-workspace.test.tsx:457-492` (два теста ждут синхронный вызов)
- Test: `src/sections/campaigns/wizard/campaign-workspace.test.tsx` (новый describe)

**Interfaces:**
- Consumes: `SurveyAwaiting` из Task 1 — пропсы `durationMs`, `footnote`; `onDone` срабатывает через `durationMs + 200` мс. Кнопка `Создать кампанию` из Task 2.
- Produces: ничего для следующих задач.

- [ ] **Step 1: Поднять тестовые хелперы в область модуля**

`renderAtBudgetStep` (`campaign-workspace.test.tsx:426`) и `budgetStepScope` (`:453`) объявлены ВНУТРИ describe на строке 423 — новый describe их не увидит. Перед тем как писать тесты, вынести обе функции на уровень модуля (сразу после `renderWorkspace`, `:52-77`), оставив тела без изменений, и убрать их объявления из describe на `:423`. Существующие два теста внутри того describe продолжают их вызывать без правок.

- [ ] **Step 2: Написать падающий тест**

В `src/sections/campaigns/wizard/campaign-workspace.test.tsx` дописать в конец файла:

```tsx
describe("CampaignWorkspace — экран «Создаём кампанию» перед карточкой", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("клик по «Создать кампанию» поднимает экран ожидания и НЕ создаёт кампанию сразу", () => {
    const onLaunchRequested = vi.fn();
    renderAtBudgetStep(onLaunchRequested);
    fireEvent.click(
      budgetStepScope().getByRole("button", { name: "Создать кампанию" }),
    );

    expect(screen.getByText("Создаём кампанию")).toBeInTheDocument();
    expect(onLaunchRequested).not.toHaveBeenCalled();
  });

  it("экран ожидания говорит, где лежат кампании", () => {
    renderAtBudgetStep(vi.fn());
    fireEvent.click(
      budgetStepScope().getByRole("button", { name: "Создать кампанию" }),
    );
    expect(
      screen.getByText("Все кампании хранятся в разделе «Кампании»"),
    ).toBeInTheDocument();
  });

  it("на время ожидания колонка шагов и степпер убраны", () => {
    renderAtBudgetStep(vi.fn());
    fireEvent.click(
      budgetStepScope().getByRole("button", { name: "Создать кампанию" }),
    );
    expect(screen.queryByText("Прогноз бюджета")).toBeNull();
    expect(screen.queryByRole("button", { name: "Бюджет" })).toBeNull();
  });

  it("кампания создаётся через 4 секунды, а не раньше", () => {
    const onLaunchRequested = vi.fn();
    renderAtBudgetStep(onLaunchRequested);
    fireEvent.click(
      budgetStepScope().getByRole("button", { name: "Создать кампанию" }),
    );

    act(() => {
      vi.advanceTimersByTime(3900);
    });
    expect(onLaunchRequested).not.toHaveBeenCalled();

    // 4000 мс бара + 200 мс паузы SurveyAwaiting перед onDone.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onLaunchRequested).toHaveBeenCalledTimes(1);
  });

  it("бюджет, выбранный перед ожиданием, доезжает до LaunchRequest", () => {
    const onLaunchRequested = vi.fn();
    renderAtBudgetStep(onLaunchRequested);
    const budget = budgetStepScope();
    fireEvent.click(budget.getByRole("button", { name: /Своя сумма/i }));
    fireEvent.change(budget.getByRole("textbox", { name: "Своя сумма" }), {
      target: { value: "88888" },
    });
    fireEvent.click(budget.getByRole("button", { name: "Создать кампанию" }));

    act(() => {
      vi.advanceTimersByTime(4200);
    });

    const req = onLaunchRequested.mock.calls[0][0] as {
      cost: number;
      stepData: StepData;
    };
    expect(req.cost).toBe(88888);
    expect(req.stepData.budget).toBe(88888);
  });

  // Точечная правка с карточки кампанию не создаёт — она коммитит правку
  // существующей. Экран «Создаём кампанию» там был бы прямой ложью.
  it("в режиме точечной правки экран ожидания не поднимается", () => {
    const onCommit = vi.fn();
    renderWorkspace({
      editing: { campaignId: "cmp_1", step: "budget" },
      snapshot,
      onCommit,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Применить и вернуться" }),
    );
    expect(screen.queryByText("Создаём кампанию")).toBeNull();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
```

Импорты в шапке файла дополнить: `act` из `@testing-library/react`, `beforeEach` из `vitest`.

- [ ] **Step 3: Запустить тест, убедиться что падает**

Запустить: `npx vitest run src/sections/campaigns/wizard/campaign-workspace.test.tsx`
Ожидается: FAIL — экрана «Создаём кампанию» нет, `onLaunchRequested` вызывается синхронно.

- [ ] **Step 4: Реализовать**

В `src/sections/campaigns/wizard/campaign-workspace.tsx`:

Добавить импорт рядом с остальными импортами секций:

```tsx
import { SurveyAwaiting } from "@/sections/survey/survey-awaiting";
```

Рядом с остальными `useState` в `WorkspaceInner` (после объявления `stepData`, `campaign-workspace.tsx:64-69`) добавить:

```tsx
  // Экран «Создаём кампанию» (комменты от 31.08): визард раньше телепортировал
  // на карточку без единого кадра между кликом и результатом. Держим здесь
  // снапшот, с которым уйдём в onLaunchRequested, когда ожидание кончится.
  // НЕ шаг визарда: попав в stepsForIntent, экран стал бы кликабельной
  // позицией степпера и целью computeStepTransition — а из ожидания нельзя
  // ни выйти, ни вернуться.
  const [creating, setCreating] = useState<StepData | null>(null);
```

Заменить тело `handleLaunchFromBudget` (`:216-231`) так, чтобы вместо немедленного вызова взводилось состояние:

```tsx
  const handleLaunchFromBudget = useCallback(
    (partial: Partial<StepData>) => {
      const merged = { ...stepData, ...partial };
      if (!onLaunchRequested) {
        handleNext(partial);
        return;
      }
      setCreating(merged);
    },
    [handleNext, onLaunchRequested, stepData]
  );

  // Конец ожидания — здесь и только здесь кампания реально создаётся.
  // Дальше работает существующая цепочка: campaign_created_from_wizard
  // создаёт кампанию и в том же переходе роутит view на карточку.
  const handleCreatingDone = useCallback(() => {
    if (!creating || !onLaunchRequested) return;
    onLaunchRequested({
      scenarioId: creating.scenario ?? "",
      cost: creating.budget ?? 0,
      count: creating.fileRowCount ?? FALLBACK_BASE,
      stepData: creating,
      proceed: () => {},
    });
  }, [creating, onLaunchRequested]);
```

В `return` компонента, сразу после открывающего `<div className="relative flex flex-1 …">` (`:267`), поставить ранний выход на экран ожидания. Заменить весь `return (…)` на форму с гейтом впереди:

```tsx
  if (creating) {
    return (
      <div
        className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-8 transition-[padding] duration-300"
        style={{ paddingRight: "var(--chat-sidebar-width, 0px)" }}
      >
        <SurveyAwaiting
          title="Создаём кампанию"
          subtitle="Собираем сценарий, каналы и расписание в готовую к запуску кампанию."
          durationMs={4000}
          footnote="Все кампании хранятся в разделе «Кампании»"
          onDone={handleCreatingDone}
        />
      </div>
    );
  }

  return (
    // существующая разметка со степпером и колонкой шагов — без изменений
```

Таймер живёт внутри `SurveyAwaiting` и чистится его собственным `useEffect`-cleanup; отдельная защита в `CampaignWorkspace` не нужна.

- [ ] **Step 5: Починить два теста, ждавших синхронное создание**

`src/sections/campaigns/wizard/campaign-workspace.test.tsx`, тесты «своя сумма, введённая на «Бюджете», доходит…» (`:457`) и «рекомендованная сумма… тоже доходит…» (`:477`) кликают «Далее» и сразу проверяют `onLaunchRequested`. Оба надо:

1. переименовать кнопку в клике на `Создать кампанию`;
2. обернуть их describe в фейковые таймеры и провернуть время после клика:

```tsx
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
```

и после `fireEvent.click(...)` вставить

```tsx
    act(() => {
      vi.advanceTimersByTime(4200);
    });
```

Ассерты про `req.cost` и `req.stepData.budget` не менять — они по-прежнему верны, просто наступают позже.

- [ ] **Step 6: Запустить тесты, убедиться что проходят**

Запустить: `npx vitest run src/sections/campaigns/wizard/`
Ожидается: PASS. Отдельно проверить, что тесты изолированного режима правки (describe «изолированный режим правки шага (Task 12)») зелёные без изменений — экран ожидания там не поднимается, потому что `onLaunchRequested` в этом режиме не передаётся.

- [ ] **Step 7: Коммит**

```bash
git add src/sections/campaigns/wizard/campaign-workspace.tsx src/sections/campaigns/wizard/campaign-workspace.test.tsx
git commit -m "feat(wizard): экран «Создаём кампанию» между шагом бюджета и карточкой"
```

---

### Task 4: Подсказка про кликабельный граф на карточке

Мини-граф на карточке кликабельный, но об этом нигде не сказано. Подсказка показывается только пока граф правится — после запуска она врала бы.

**Files:**
- Modify: `src/sections/campaigns/campaign-screen.tsx:387-397`
- Test: `src/sections/campaigns/campaign-screen.test.tsx` (новый it в describe «блок «Сценарий кампании»»)

**Interfaces:**
- Consumes: ничего.
- Produces: ничего.

- [ ] **Step 1: Написать падающий тест**

Дописать в `src/sections/campaigns/campaign-screen.test.tsx`, в describe `CampaignScreen — блок «Сценарий кампании»`:

```tsx
  it("у черновика подсказывает, что граф кликабелен", () => {
    renderCampaign(
      baseCampaign({ id: "cmp_graph_hint", channels: ["sms"], status: "draft" }),
    );
    expect(
      screen.getByText("Кликните на граф, чтобы точечно поправить кампанию"),
    ).toBeInTheDocument();
  });

  // После запуска граф не правится (graphEditable === false), и подсказка
  // обещала бы недоступное действие.
  it("у запущенной кампании подсказки про граф нет", () => {
    for (const status of ["active", "paused", "completed"] as const) {
      const { unmount } = renderCampaign(
        baseCampaign({ id: `cmp_graph_hint_${status}`, channels: ["sms"], status }),
      );
      expect(screen.queryByText(/Кликните на граф/)).toBeNull();
      unmount();
    }
  });
```

- [ ] **Step 2: Запустить тест, убедиться что падает**

Запустить: `npx vitest run src/sections/campaigns/campaign-screen.test.tsx`
Ожидается: FAIL на первом тесте — текста нет.

- [ ] **Step 3: Реализовать**

В `src/sections/campaigns/campaign-screen.tsx` заменить блок графа (`:387-397`) на:

```tsx
          <div className="flex flex-col gap-3 border-t border-border pt-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Граф кампании
            </p>
            {/* Мини-граф кликабелен, но об этом ниоткуда не узнать (коммент
                от 31.08). Показываем только пока граф правится — после
                запуска подсказка обещала бы недоступное действие. */}
            {graphEditable && (
              <p className="text-xs text-muted-foreground">
                Кликните на граф, чтобы точечно поправить кампанию
              </p>
            )}
            <WorkflowMiniPreview
              campaignId={campaign.id}
              signalType={signalType}
              sourceType={campaign.sourceType}
              channels={campaign.channels}
              graphVersion={graphVersion}
              onClick={openWorkflow}
            />
          </div>
```

- [ ] **Step 4: Запустить тесты, убедиться что проходят**

Запустить: `npx vitest run src/sections/campaigns/campaign-screen.test.tsx`
Ожидается: PASS.

- [ ] **Step 5: Коммит**

```bash
git add src/sections/campaigns/campaign-screen.tsx src/sections/campaigns/campaign-screen.test.tsx
git commit -m "feat(campaign-card): подсказка о кликабельном графе у черновика"
```

---

### Task 5: Снос сегментной генерации графа

`createTemplate` для типов сигнала «Апсейл» и «Удержание» уходит в `buildSegmentedChannelTemplate`, который строит сплиттер на четыре ветки и полный коммуникационный юнит на каждый из трёх активных сегментов. При двух-трёх каналах это несколько десятков нод — тот самый «адски огромный флоу».

Убирается генератор, а не сегментация как возможность: тип сплита «По сегменту» остаётся в `split-fields.tsx`, `node-actions.ts:225`, `campaign-cost.ts:77`, `split-segments.ts`, `node-sublabel.ts`, и защита сегментных сплитов в `mergeChannelNodes` тоже остаётся.

Побочный эффект: прогноз коммуникаций для «Апсейла» и «Удержания» падает примерно втрое. Это следствие, а не регрессия.

**Files:**
- Modify: `src/state/workflow-templates.ts` — удалить `buildSegmentedChannelTemplate` (`:417-524`) и `SEGMENTED_TYPES` (`:525`), упростить ветку в `createTemplate` (`:575-580`), поправить доккомменты `mergeChannelNodes` (`:788`, абзац про обязательный `context`)
- Modify: `src/state/workflow-templates.test.ts` — блоки на `:466-470` (комментарий), `:542-600` (describe «сегментированный сценарий»), `:846-869` (тест про метки сегментов)
- Test: `src/state/workflow-templates.test.ts` (новый it)

**Interfaces:**
- Consumes: ничего.
- Produces: `createTemplate(signalType, sourceType, channels)` при непустых `channels` всегда возвращает линейный шаблон. Число нод зависит только от `channels`, не от `signalType`.

- [ ] **Step 1: Написать падающий тест**

Дописать в `src/state/workflow-templates.test.ts`:

```ts
describe("createTemplate — сегментной генерации больше нет", () => {
  it("«Удержание» с каналами не порождает сплит по сегменту", () => {
    const graph = createTemplate("Удержание", "new", ["sms", "email"]);
    const segmentSplits = graph.nodes.filter(
      (nd) =>
        nd.data.nodeType === "split" &&
        nd.data.params?.kind === "split" &&
        nd.data.params.by === "segment",
    );
    expect(segmentSplits).toHaveLength(0);
  });

  it("«Удержание» и «Апсейл» дают граф того же размера, что несегментный тип", () => {
    const channels = ["sms", "email"] as const;
    const linear = createTemplate("Возврат", "new", [...channels]);
    for (const type of ["Удержание", "Апсейл"] as const) {
      expect(createTemplate(type, "new", [...channels]).nodes).toHaveLength(
        linear.nodes.length,
      );
    }
  });

  // Сплиттер каналов (by:"equal") — часть линейного шаблона и остаётся.
  it("сплиттер каналов при нескольких каналах на месте", () => {
    const graph = createTemplate("Удержание", "new", ["sms", "email"]);
    const equalSplits = graph.nodes.filter(
      (nd) =>
        nd.data.nodeType === "split" &&
        nd.data.params?.kind === "split" &&
        nd.data.params.by === "equal",
    );
    expect(equalSplits.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Запустить тест, убедиться что падает**

Запустить: `npx vitest run src/state/workflow-templates.test.ts -t "сегментной генерации больше нет"`
Ожидается: FAIL — сегментный сплит на месте, размер графа больше линейного.

- [ ] **Step 3: Удалить генератор**

В `src/state/workflow-templates.ts`:

1. Удалить функцию `buildSegmentedChannelTemplate` целиком вместе с её доккомментом (`/** Builds a segmented channel-aware template (Апсейл, Удержание). … */` и тело, строки ~410–524).
2. Удалить `const SEGMENTED_TYPES = new Set<SignalType>(["Апсейл", "Удержание"]);` и комментарий `/** Segmented signal types */`.
3. В `createTemplate` заменить ветку

```ts
  if (channels && channels.length > 0) {
    // Channel-aware path
    if (SEGMENTED_TYPES.has(signalType)) {
      base = buildSegmentedChannelTemplate(signalType, channels);
    } else {
      base = buildLinearChannelTemplate(signalType, channels);
    }
  } else if (channels) {
```

на

```ts
  if (channels && channels.length > 0) {
    // Channel-aware path. Сегментная ветка (по одному комм-юниту на каждый из
    // трёх активных сегментов) снята 31.08: она давала граф в несколько
    // десятков нод. Сам тип сплита «По сегменту» остался — его ставит
    // пользователь или ИИ, генератор его больше не создаёт.
    base = buildLinearChannelTemplate(signalType, channels);
  } else if (channels) {
```

- [ ] **Step 4: Поправить доккомменты `mergeChannelNodes`**

Два места в шапке `mergeChannelNodes` (`:780-815`) ссылаются на удалённое:

1. Фраза «несколько сегментов в `buildSegmentedChannelTemplate`» в перечислении причин, по которым канал встречается в графе несколько раз. Заменить на: «первый проход и повтор в `buildCommUnit`, а также сегментные сплиты, поставленные вручную или ИИ».
2. Абзац, объясняющий обязательность `context` тем, что только полная пересборка «корректно восстанавливает сегментацию (Апсейл/Удержание — сколько сегментов, какие сплиты)». Заменить обоснование: `createTemplate` теперь для всех типов строит линейный шаблон, и причина обязательности `context` — восстановление «Конца» с верным `reason` и подбор шаблона по `signalType`/`sourceType`, а не сегментация.

Ветку «предок — защищённый сплит по сегменту, не трогаем вовсе» в коде НЕ трогать: сегментные сплиты остаются возможны.

- [ ] **Step 5: Мигрировать тесты сегментного пути**

`src/state/workflow-templates.test.ts`:

1. Комментарий на `:466-470` упоминает `SEGMENTED_TYPES` как причину выбора «Реактивации». Переписать: типа-исключения больше нет, «Реактивация» остаётся просто реальным `SignalType`.

2. Describe «сегментированный сценарий (несколько параллельных юнитов на канал)» (`:544-600`):
   - Тест «снятый канал уходит из ВСЕХ сегментов без висячих рёбер» — переориентировать на линейный шаблон: предпосылка «канал встречается больше одного раза» по-прежнему верна, потому что `buildCommUnit` даёт первый проход и повтор. Заменить `createTemplate("Апсейл", …)` на `createTemplate("Реактивация", …)` и `UPSELL_CTX` на `REACT_CTX`, переименовать describe в «канал, встречающийся в графе несколько раз (проход + повтор)».
   - Тест «после удаления канала … граф остаётся полностью связным» — та же замена типа и контекста.
   - Тест «сплиттер сегментов (by:segment) не трогается…» — сегментный сплит теперь не приходит из channel-aware генерации, поэтому фикстуру взять с legacy-пути: `createTemplate("Апсейл", "new")` без аргумента каналов даёт `upsellTemplate` со сплитом `by:"segment"` и каналами `email`/`sms` под ним. Тест переписать так:

```ts
  // Сегментный сплит генератором больше не создаётся, но остаётся легальной
  // нодой: legacy-шаблон «Апсейла» его несёт, пользователь и ИИ могут
  // поставить свой. Защита «мерж такой сплит не трогает» обязана держаться.
  it("сплиттер по сегменту переживает мерж каналов нетронутым", () => {
    const graph = createTemplate("Апсейл", "new");
    const before = graph.nodes.filter(
      (n) =>
        n.data.nodeType === "split" &&
        n.data.params?.kind === "split" &&
        n.data.params.by === "segment",
    );
    expect(before).toHaveLength(1);

    const merged = mergeChannelNodes(graph, ["sms"], UPSELL_CTX);

    const after = merged.nodes.filter(
      (n) =>
        n.data.nodeType === "split" &&
        n.data.params?.kind === "split" &&
        n.data.params.by === "segment",
    );
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before[0].id); // тот же узел, не пересобран
  });
```

   `UPSELL_CTX` при этом сохранить — он всё ещё используется.

3. Тест «двухшаговый сценарий, сегментированный сценарий («Апсейл»)» (`:846`): убрать хвостовой блок про метки сегментов на рёбрах (`const segSplit = …` до `expect(segLabels).toEqual(…)`) — сегментного сплита в этом графе больше не будет. Тело до него (опустошение → заполнение → сверка стоимости с `fresh`) оставить как есть, переименовать тест в «двухшаговый сценарий: опустошение и заполнение каналов сходятся со свежим шаблоном».

- [ ] **Step 6: Прогнать затронутые тесты**

Запустить: `npx vitest run src/state/workflow-templates.test.ts src/sections/campaigns/campaign-graph-cost.test.ts src/sections/campaigns/campaign-cost-parity.test.ts src/sections/campaigns/campaign-graph-consistency.test.ts`

Ожидается: PASS. Если где-то зашита конкретная сумма для «Апсейла» или «Удержания» — она изменилась по делу (комм-юнит стал один вместо трёх); пересчитать ожидание и в комментарии к тесту сослаться на снос сегментной генерации. Не подгонять числа молча.

- [ ] **Step 7: Полный прогон**

Запустить: `npm test`
Ожидается: PASS. Всё, что упадёт, — либо зашитые суммы (см. шаг 6), либо ожидания формы графа для «Апсейла»/«Удержания». Тесты про тип сплита «По сегменту» сам по себе (`split-segments.test.ts`, `node-sublabel.test.ts`, `split-fields.test.tsx`, `campaign-cost.test.ts`, `graph-description.test.ts`) падать не должны — если падают, значит удалено лишнее.

- [ ] **Step 8: Коммит**

```bash
git add src/state/workflow-templates.ts src/state/workflow-templates.test.ts
git commit -m "refactor(workflow-templates): снести сегментную генерацию графа"
```

Если шаг 6 или 7 потребовал правок в других тестовых файлах — добавить их в этот же коммит.

---

### Task 6: Разрыв контента при скролле с открытым боковиком

Симптом со слов автора: открываешь боковик, делаешь скролл — контент разорван. На скрине карточка кампании с открытой панелью «Push — возвращение»: верх отрисован на одном скролл-офсете, низ на другом.

Это баг перерисовки, а не вёрстки, поэтому порядок строгий: **сначала воспроизвести, потом найти корень, только потом чинить**. Фикс под гипотезу не подгонять.

**Files:**
- Modify (вероятно): `src/sections/campaigns/template-preview-drawer.tsx:184`, `src/sections/shell/scoring-drawer.tsx:39`, `src/sections/shell/chat-drawer.tsx:62`
- Test: `src/sections/campaigns/template-preview-drawer.test.tsx` (регрессионный guard)

**Interfaces:**
- Consumes: ничего.
- Produces: ничего.

- [ ] **Step 1: Воспроизвести и снять доказательство**

Поднять дев-сервер из воркти́ри на порту 3001 (порт 3000 может держать основной чекаут):

```bash
npm run dev -- -p 3001
```

В браузере: открыть карточку кампании с коммуникациями → кликнуть по шаблону сообщения, чтобы открылся `TemplatePreviewDrawer` → проскроллить карточку → снять скриншот разрыва.

Скриншот сохранить в скрэтчпад. **Без воспроизведённого разрыва дальше не идти** — если симптом не ловится, описать, что именно пробовали, и остановиться с вопросом к владельцу, а не чинить наугад.

- [ ] **Step 2: Проверить рабочую гипотезу**

Гипотеза: `backdrop-filter` на `fixed`-слое поверх скроллящегося `overflow-y-auto` контейнера (`src/components/ui/entity-card.tsx:45`) не инвалидирует область за собой при скролле.

Проверка на живой странице: в DevTools снять `backdrop-filter` с корня боковика и повторить скролл. Снять второй скриншот.

Если разрыв ушёл — гипотеза подтверждена, идти на шаг 3.
Если остался — гипотеза неверна. Следующие кандидаты, в порядке проверки: `pt-[120px]` на скролл-контейнере в паре с абсолютно спозиционированным заголовком карточки; трансформы `motion` на `aside`. Проверять по одному тем же способом, фикс писать только под подтверждённый корень.

- [ ] **Step 3: Написать регрессионный тест**

Тест закрепляет ровно то свойство, которым чинится баг. Дописать в describe `TemplatePreviewDrawer (connected) — eye-icon wiring` в `src/sections/campaigns/template-preview-drawer.test.tsx` (начинается на `:131`), повторив тамошний способ рендера — `Harness` плюс `TemplatePreviewDrawer` внутри `AppStateProvider`/`ChatProvider`, открытие кликом по кнопке `open`, корень панели по `data-testid="template-preview-drawer"` (он стоит на `motion.aside`, `template-preview-drawer.tsx:175`):

```tsx
  // Регрессия 31.08: backdrop-filter на fixed-боковике поверх скроллящегося
  // контейнера карточки (entity-card.tsx:45) не инвалидировал область за
  // собой — контент рвался при скролле с открытой панелью. Фон панели
  // непрозрачен на 0.96, так что блюр всё равно не читался. Тест держит
  // свойство, а не внешний вид: вернувшийся backdrop-blur вернёт и баг.
  it("корень панели не несёт backdrop-filter", () => {
    render(
      <AppStateProvider>
        <ChatProvider>
          <Harness templateId="tpl_sms_reminder" />
          <TemplatePreviewDrawer />
        </ChatProvider>
      </AppStateProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    expect(
      screen.getByTestId("template-preview-drawer").className,
    ).not.toMatch(/backdrop-blur/);
  });
```

Аналогичный тест для `scoring-drawer` (testid `scoring-drawer`, `scoring-drawer.tsx:34`) добавить только если шаг 5 действительно снимет там блюр.

- [ ] **Step 4: Запустить тест, убедиться что падает**

Запустить: `npx vitest run src/sections/campaigns/template-preview-drawer.test.tsx`
Ожидается: FAIL — класс `backdrop-blur-[2px]` на месте.

- [ ] **Step 5: Применить фикс**

Если гипотеза шага 2 подтвердилась: убрать `backdrop-blur-[2px]` из className в `template-preview-drawer.tsx:184` и `scoring-drawer.tsx:39` — фон обоих `rgba(14,14,12,0.96)`, блюр при такой непрозрачности не виден.

`chat-drawer.tsx:62` — фон `rgba(10,10,10,0.85)`, там блюр может быть заметен. Снять его, снять скриншот до и после, сравнить. Если разница видна и портит вид — оставить блюр в чат-дровере и зафиксировать в комментарии, что он остаётся под наблюдением; если не видна — снять и там.

Если гипотеза не подтвердилась — реализовать фикс под найденный на шаге 2 корень, а этот шаг и тест из шага 3 переписать под него.

- [ ] **Step 6: Проверить фикс на том же репро**

Повторить сценарий шага 1 в браузере, снять скриншот. Разрыва быть не должно.

Запустить: `npx vitest run src/sections/campaigns/ src/sections/shell/`
Ожидается: PASS.

- [ ] **Step 7: Коммит**

```bash
git add src/sections/campaigns/template-preview-drawer.tsx src/sections/campaigns/template-preview-drawer.test.tsx src/sections/shell/scoring-drawer.tsx src/sections/shell/chat-drawer.tsx
git commit -m "fix(drawers): разрыв контента при скролле с открытым боковиком"
```

---

### Task 7: Финальная проверка

**Files:** нет изменений кода, кроме починки найденного.

- [ ] **Step 1: Полный прогон тестов**

Запустить: `npm test`
Ожидается: PASS.

- [ ] **Step 2: Линт**

Запустить: `npm run lint`
Ожидается: без ошибок.

- [ ] **Step 3: Пройти сценарий целиком в браузере**

Дев-сервер из воркти́ри на 3001. Пройти визард от выбора сценария до конца:

1. на шаге «Прогноз бюджета» видна развилка и кнопка «Создать кампанию»;
2. клик поднимает экран «Создаём кампанию» со сноской про раздел «Кампании»;
3. примерно через четыре секунды открывается карточка созданной кампании;
4. на карточке под заголовком «Граф кампании» видна подсказка про клик;
5. выбрать сценарий с типом сигнала «Удержание» (например, «Лояльность под угрозой») и открыть граф — флоу линейный, без веера сегментов.

Снять скриншоты каждого пункта.

- [ ] **Step 4: Показать результат владельцу**

Собрать скриншоты шага 3 и скриншоты «до/после» из Task 6 и показать через скилл `visual-review`.

- [ ] **Step 5: Отчитаться**

Сообщить путь воркти́ри (`.worktrees/wizard-finale`) и имя ветки (`feature/wizard-finale`). Мердж и уборку воркти́ри решает владелец — сам не мержить и не удалять.

# Группа A — правки копирайта и лейаута: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Внести лёгкие правки встречи 2026-06-23 (блоки 1, 5, 2, 3) — welcome-карточки, стоимость каналов, порядок/валидация анкеты, поведение шага выбора сценария — без изменения модели данных.

**Architecture:** Точечные правки UI-компонентов прототипа + два чистых хелпера (`isSurveyMinimallyFilled`, `formatUnitCost`) под unit-тесты. Каждый блок независим; единственная связь — сквозное правило «Назад слева / Далее справа» (блок 2).

**Tech Stack:** Next.js 16, React, TypeScript, Tailwind v4, motion v12, vitest + @testing-library/react.

**Спека:** `docs/superpowers/specs/2026-06-24-meeting-edits-group-a-design.md`

---

## Preflight (обязательно перед правками)

Работать в отдельном воркдереве от `integration` (см. AGENTS.md):

```bash
git worktree add .worktrees/group-a -b feature/group-a integration
cd .worktrees/group-a
npm install
git status --short                       # чисто
git rev-list --count HEAD..integration   # ДОЛЖНО быть 0
```

Если счётчик не 0 — STOP, база устарела. Тесты в этом воркдереве: `npx vitest run <path>`; не запускать `next dev` на :3000, если его держит другой воркдерев (использовать `-p 3001`).

---

## Файловая карта

| Файл | Блок | Что меняем |
|---|---|---|
| `src/sections/welcome/onboarding-step-cards.tsx` | 1 | `PLATES`: средняя карточка → «Коммуникации» |
| `src/sections/welcome/onboarding-step-cards.test.tsx` | 1 | строки теста под новый копирайт |
| `src/sections/campaigns/wizard/steps/step-channels.tsx` | 5 | хелпер `formatUnitCost` + стоимость на карточке + блок «Получить только сигналы» |
| `src/sections/campaigns/wizard/steps/step-channels.test.tsx` | 5 | unit для `formatUnitCost` + render-тест |
| `src/state/survey-validation.ts` | 2 | хелпер `isSurveyMinimallyFilled` |
| `src/state/survey-validation.test.ts` | 2 | unit для хелпера (новый файл) |
| `src/sections/survey/survey-form.tsx` | 2 | порядок полей + валидация «хотя бы одно» |
| `src/sections/survey/onboarding-scenarios-screen.tsx` | 2 | кнопка «Назад» (проп `onBack`) |
| `src/sections/survey/onboarding-scenarios-screen.test.tsx` | 2 | render-тест «Назад»/«Далее» (новый файл) |
| `src/sections/survey/survey-section.tsx` | 2 | проброс `onBack` (возврат на форму) |
| `src/sections/campaigns/wizard/steps/step-1-scenario.tsx` | 3 | фильтры всегда сверху, «Показать все» добавляет каталог, тег «Из подборки», без чипа источника |
| `src/sections/campaigns/wizard/steps/step-1-scenario.test.tsx` | 3 | переписать под новое поведение |

---

## Task 1: Блок 1 — welcome-карточка «Коммуникации»

**Files:**
- Modify: `src/sections/welcome/onboarding-step-cards.tsx:16-20`
- Test: `src/sections/welcome/onboarding-step-cards.test.tsx`

- [ ] **Step 1: Обновить тест под новый копирайт**

Заменить весь файл `src/sections/welcome/onboarding-step-cards.test.tsx` на:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OnboardingStepCards } from "./onboarding-step-cards";

describe("OnboardingStepCards — копирайт услуг", () => {
  it("рендерит три карточки: Сигналы / Коммуникации / Статистика", () => {
    render(<OnboardingStepCards />);
    expect(screen.getByText("Сигналы")).toBeInTheDocument();
    expect(screen.getByText("Коммуникации")).toBeInTheDocument();
    expect(screen.getByText("Статистика")).toBeInTheDocument();
    expect(screen.queryByText("Кампании")).not.toBeInTheDocument();
  });

  it("карточка «Сигналы» — описание про intent-аудитории", () => {
    render(<OnboardingStepCards />);
    expect(
      screen.getByText(
        "Находим, кому из клиентов нужна коммуникация прямо сейчас — по поведению и данным.",
      ),
    ).toBeInTheDocument();
  });

  it("карточка «Коммуникации» — описание про сообщение по каналам", () => {
    render(<OnboardingStepCards />);
    expect(
      screen.getByText(
        "Запускаем нужное сообщение в нужный момент — по выбранным каналам.",
      ),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `npx vitest run src/sections/welcome/onboarding-step-cards.test.tsx`
Expected: FAIL — текущий `PLATES` содержит «Кампании», а тест ждёт «Коммуникации».

- [ ] **Step 3: Поменять среднюю карточку в `PLATES`**

В `src/sections/welcome/onboarding-step-cards.tsx` заменить второй элемент массива:

```tsx
  {
    heading: "Коммуникации",
    description:
      "Запускаем нужное сообщение в нужный момент — по выбранным каналам.",
  },
```

(Первый элемент «Сигналы» и третий «Статистика» не трогать.)

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `npx vitest run src/sections/welcome/onboarding-step-cards.test.tsx`
Expected: PASS (3 теста).

- [ ] **Step 5: Коммит**

```bash
git add src/sections/welcome/onboarding-step-cards.tsx src/sections/welcome/onboarding-step-cards.test.tsx
git commit -m "feat(welcome): средняя карточка — Коммуникации вместо Кампаний (group A #1)"
```

---

## Task 2: Блок 5 — стоимость канала + блок «Получить только сигналы»

**Files:**
- Modify: `src/sections/campaigns/wizard/steps/step-channels.tsx`
- Test: `src/sections/campaigns/wizard/steps/step-channels.test.tsx`

### 2a. Хелпер `formatUnitCost`

- [ ] **Step 1: Заменить тест-файл (добавить формат стоимости)**

Заменить весь `src/sections/campaigns/wizard/steps/step-channels.test.tsx` на (импорты всегда сверху — иначе eslint `import/first`):

```tsx
import { describe, it, expect } from "vitest";
import { toggleChannel, formatUnitCost } from "./step-channels";

describe("toggleChannel (StepChannels selection logic)", () => {
  it("adds a channel when absent", () => {
    expect(toggleChannel([], "sms")).toEqual(["sms"]);
  });
  it("removes a channel when present", () => {
    expect(toggleChannel(["sms", "push"], "sms")).toEqual(["push"]);
  });
  it("preserves canonical channel order", () => {
    const out = toggleChannel(["push"], "sms");
    expect(out).toEqual(["sms", "push"]);
  });
});

describe("formatUnitCost (стоимость канала за отправку)", () => {
  it("целое число рублей без копеек", () => {
    expect(formatUnitCost("sms")).toBe("5 ₽ / отправка");
    expect(formatUnitCost("email")).toBe("1 ₽ / отправка");
    expect(formatUnitCost("ivr")).toBe("8 ₽ / отправка");
  });
  it("дробное — через запятую", () => {
    expect(formatUnitCost("push")).toBe("0,5 ₽ / отправка");
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx vitest run src/sections/campaigns/wizard/steps/step-channels.test.tsx`
Expected: FAIL — `formatUnitCost` не экспортирован.

- [ ] **Step 3: Реализовать `formatUnitCost`**

В `src/sections/campaigns/wizard/steps/step-channels.tsx` сначала добавить `UNIT_COST` в импорт из `campaign-cost` (строка 9):

```tsx
import { CHANNEL_LABEL, UNIT_COST } from "@/sections/campaigns/campaign-cost";
```

Затем после функции `toggleChannel` (после строки 18) добавить:

```tsx
/** «5 ₽ / отправка», «0,5 ₽ / отправка» — стоимость канала за одну отправку из UNIT_COST. */
export function formatUnitCost(channel: Channel): string {
  const cost = UNIT_COST[channel];
  const rub = Number.isInteger(cost) ? String(cost) : String(cost).replace(".", ",");
  return `${rub} ₽ / отправка`;
}
```

- [ ] **Step 4: Запустить — должен пройти**

Run: `npx vitest run src/sections/campaigns/wizard/steps/step-channels.test.tsx`
Expected: PASS (toggleChannel + formatUnitCost).

### 2b. UI: стоимость на карточке + блок «только сигналы»

- [ ] **Step 5: Заменить тест-файл (добавить render-тесты)**

Заменить весь `src/sections/campaigns/wizard/steps/step-channels.test.tsx` на финальную версию — добавляет импорт `StepChannels`/`initialStepData`, стаб `StepContent` (печатная анимация) и render-блок. Импорты остаются строго сверху:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StepChannels, toggleChannel, formatUnitCost } from "./step-channels";
import { initialStepData } from "@/types/campaign";

vi.mock("@/sections/campaigns/wizard/steps/step-content", () => ({
  StepContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("toggleChannel (StepChannels selection logic)", () => {
  it("adds a channel when absent", () => {
    expect(toggleChannel([], "sms")).toEqual(["sms"]);
  });
  it("removes a channel when present", () => {
    expect(toggleChannel(["sms", "push"], "sms")).toEqual(["push"]);
  });
  it("preserves canonical channel order", () => {
    const out = toggleChannel(["push"], "sms");
    expect(out).toEqual(["sms", "push"]);
  });
});

describe("formatUnitCost (стоимость канала за отправку)", () => {
  it("целое число рублей без копеек", () => {
    expect(formatUnitCost("sms")).toBe("5 ₽ / отправка");
    expect(formatUnitCost("email")).toBe("1 ₽ / отправка");
    expect(formatUnitCost("ivr")).toBe("8 ₽ / отправка");
  });
  it("дробное — через запятую", () => {
    expect(formatUnitCost("push")).toBe("0,5 ₽ / отправка");
  });
});

describe("StepChannels — стоимость и блок «Получить только сигналы»", () => {
  afterEach(cleanup);

  it("показывает стоимость каждого канала за отправку", () => {
    render(<StepChannels data={initialStepData} onNext={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText("5 ₽ / отправка")).toBeInTheDocument();
    expect(screen.getByText("1 ₽ / отправка")).toBeInTheDocument();
    expect(screen.getByText("0,5 ₽ / отправка")).toBeInTheDocument();
    expect(screen.getByText("8 ₽ / отправка")).toBeInTheDocument();
  });

  it("блок «Получить только сигналы» с заголовком и описанием", () => {
    render(<StepChannels data={initialStepData} onNext={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText("Получить только сигналы")).toBeInTheDocument();
    expect(screen.getByText("Не проводить коммуникации")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Запустить — должен упасть**

Run: `npx vitest run src/sections/campaigns/wizard/steps/step-channels.test.tsx`
Expected: FAIL — render-тесты падают: стоимость не выводится, блок «Получить только сигналы» отсутствует (unit-тесты `toggleChannel`/`formatUnitCost` проходят).

- [ ] **Step 7: Обновить UI в `StepChannels`**

В `src/sections/campaigns/wizard/steps/step-channels.tsx`:

(а) В карточке канала вывести стоимость. Заменить строку `{CHANNEL_LABEL[channel]}` (строка 72) на блок с подписью и стоимостью:

```tsx
                <span className="flex flex-col">
                  <span>{CHANNEL_LABEL[channel]}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatUnitCost(channel)}
                  </span>
                </span>
```

(б) Заменить кнопку «Не проводить коммуникацию» (строки 78-98) на разделитель + блок с заголовком и описанием:

```tsx
        <div className="border-t border-border" />

        <button
          type="button"
          aria-pressed={noComms}
          onClick={selectNoComms}
          className={cn(
            "flex items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            noComms
              ? "border-brand/50 bg-brand-muted text-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <span
            aria-hidden
            className={cn(
              "mt-1 h-3 w-3 shrink-0 rounded-full border-2 transition-colors",
              noComms ? "border-foreground bg-foreground" : "border-border"
            )}
          />
          <span className="flex flex-col">
            <span className="font-medium text-foreground">Получить только сигналы</span>
            <span className="text-xs text-muted-foreground">Не проводить коммуникации</span>
          </span>
        </button>
```

- [ ] **Step 8: Запустить — должен пройти**

Run: `npx vitest run src/sections/campaigns/wizard/steps/step-channels.test.tsx`
Expected: PASS (все блоки).

- [ ] **Step 9: Коммит**

```bash
git add src/sections/campaigns/wizard/steps/step-channels.tsx src/sections/campaigns/wizard/steps/step-channels.test.tsx
git commit -m "feat(wizard): стоимость канала + блок «Получить только сигналы» (group A #5)"
```

---

## Task 3: Блок 2 — анкета: порядок, «хотя бы одно», «Назад»

**Files:**
- Modify: `src/state/survey-validation.ts`
- Test: `src/state/survey-validation.test.ts` (создать)
- Modify: `src/sections/survey/survey-form.tsx`
- Modify: `src/sections/survey/onboarding-scenarios-screen.tsx`
- Test: `src/sections/survey/onboarding-scenarios-screen.test.tsx` (создать)
- Modify: `src/sections/survey/survey-section.tsx`

### 3a. Хелпер `isSurveyMinimallyFilled`

- [ ] **Step 1: Создать тест хелпера**

Создать `src/state/survey-validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isSurveyMinimallyFilled } from "./survey-validation";

describe("isSurveyMinimallyFilled (хотя бы одно поле)", () => {
  it("оба пустые → false", () => {
    expect(isSurveyMinimallyFilled({ companyWebsite: "", taskDescription: "" })).toBe(false);
  });
  it("оба из пробелов → false", () => {
    expect(isSurveyMinimallyFilled({ companyWebsite: "  ", taskDescription: "\n\t" })).toBe(false);
  });
  it("только сайт → true", () => {
    expect(isSurveyMinimallyFilled({ companyWebsite: "example.com", taskDescription: "" })).toBe(true);
  });
  it("только задача → true", () => {
    expect(isSurveyMinimallyFilled({ companyWebsite: "", taskDescription: "ищу ипотеку" })).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx vitest run src/state/survey-validation.test.ts`
Expected: FAIL — `isSurveyMinimallyFilled` не экспортирован.

- [ ] **Step 3: Реализовать хелпер**

В `src/state/survey-validation.ts` дописать в конец (существующие `isCompanyNameValid` / `isTaskDescriptionValid` оставить):

```ts
/** Анкета минимально заполнена, если непусто хотя бы одно из (сайт, задача). */
export function isSurveyMinimallyFilled(args: {
  companyWebsite: string;
  taskDescription: string;
}): boolean {
  return args.companyWebsite.trim().length > 0 || args.taskDescription.trim().length > 0;
}
```

- [ ] **Step 4: Запустить — должен пройти**

Run: `npx vitest run src/state/survey-validation.test.ts`
Expected: PASS (4 теста).

- [ ] **Step 5: Коммит**

```bash
git add src/state/survey-validation.ts src/state/survey-validation.test.ts
git commit -m "feat(survey): хелпер isSurveyMinimallyFilled — хотя бы одно поле (group A #2)"
```

### 3b. Форма анкеты: сайт выше задачи + валидация «хотя бы одно»

- [ ] **Step 6: Переписать `survey-form.tsx`**

Заменить весь файл `src/sections/survey/survey-form.tsx` на (сайт выше задачи; гейт на `isSurveyMinimallyFilled`; единая ошибка при двух пустых):

```tsx
"use client";

import { useState } from "react";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import { isSurveyMinimallyFilled } from "@/state/survey-validation";
import type { Survey } from "@/types/survey";

interface SurveyFormProps {
  onSubmit: (survey: Survey) => void;
  title?: string;
  subtitle?: string;
}

export function SurveyForm({
  onSubmit,
  title = "С чего начнём — опишите вашу задачу",
  subtitle = "Укажите сайт компании или опишите задачу — достаточно одного. Афина подберёт подходящие сценарии.",
}: SurveyFormProps) {
  const { survey } = useAppState();
  const dispatch = useAppDispatch();

  const [description, setDescription] = useState(survey.taskDescription ?? "");
  const [site, setSite] = useState(survey.companyWebsite ?? "");
  const [showErrors, setShowErrors] = useState(false);

  const minimallyFilled = isSurveyMinimallyFilled({
    companyWebsite: site,
    taskDescription: description,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!minimallyFilled) {
      setShowErrors(true);
      return;
    }
    const filled: Survey = {
      companyName: survey.companyName,
      companyWebsite: site.trim(),
      taskDescription: description.trim(),
      directionId: survey.directionId,
    };
    // Persist the partial as we go so navigation away keeps draft state.
    dispatch({ type: "survey_updated", patch: filled });
    onSubmit(filled);
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onSubmit={handleSubmit}
      className="w-full max-w-2xl"
      noValidate
    >
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
          {subtitle}
        </p>
      </header>
      <Field id="survey-site" label="Сайт компании" hint="Необязательно">
        <Input
          id="survey-site"
          type="text"
          placeholder="example.com"
          value={site}
          onChange={(e) => setSite(e.target.value)}
        />
      </Field>
      <div className="mt-5">
        <Field id="survey-task" label="Ваша задача" hint="Необязательно">
          <Textarea
            id="survey-task"
            rows={4}
            placeholder="Например: привлечь людей, которые ищут ипотеку"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
      </div>
      {showErrors && !minimallyFilled ? (
        <p className="mt-3 text-xs text-destructive">
          Заполните хотя бы одно поле — сайт или задачу
        </p>
      ) : null}
      <div className="mt-8 flex items-center justify-between gap-3">
        <span aria-hidden />
        <Button type="submit" variant="default" size="lg">
          Продолжить
        </Button>
      </div>
    </motion.form>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 7: Проверить типы**

Run: `npx tsc --noEmit`
Expected: без ошибок (хелпер `isTaskDescriptionValid` больше не импортируется в форме — это не ошибка, он остаётся в `survey-validation.ts` и используется тестами/прочим).

### 3c. Кнопка «Назад» на экране подбора сценариев

- [ ] **Step 8: Создать render-тест экрана**

Создать `src/sections/survey/onboarding-scenarios-screen.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OnboardingScenariosScreen } from "./onboarding-scenarios-screen";

describe("OnboardingScenariosScreen — навигация", () => {
  it("показывает «Назад» (слева) и «Далее» (справа)", () => {
    render(<OnboardingScenariosScreen onChooseScenario={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Назад" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Далее" })).toBeInTheDocument();
  });
  it("«Назад» вызывает onBack", () => {
    const onBack = vi.fn();
    render(<OnboardingScenariosScreen onChooseScenario={vi.fn()} onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
  it("«Далее» вызывает onChooseScenario", () => {
    const onChoose = vi.fn();
    render(<OnboardingScenariosScreen onChooseScenario={onChoose} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(onChoose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 9: Запустить — должен упасть**

Run: `npx vitest run src/sections/survey/onboarding-scenarios-screen.test.tsx`
Expected: FAIL — нет пропа `onBack` и кнопки «Назад».

- [ ] **Step 10: Добавить «Назад» в экран**

В `src/sections/survey/onboarding-scenarios-screen.tsx`:

(а) расширить пропсы:

```tsx
interface OnboardingScenariosScreenProps {
  onChooseScenario: () => void;
  onBack: () => void;
}

export function OnboardingScenariosScreen({ onChooseScenario, onBack }: OnboardingScenariosScreenProps) {
```

(б) заменить блок с единственной кнопкой (строки 35-41) на ряд «Назад» / «Далее»:

```tsx
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.25, ease: [0.23, 1, 0.32, 1] }}
        className="flex items-center gap-3"
      >
        <Button variant="ghost" onClick={onBack}>Назад</Button>
        <Button onClick={onChooseScenario}>Далее</Button>
      </motion.div>
```

- [ ] **Step 11: Запустить — должен пройти**

Run: `npx vitest run src/sections/survey/onboarding-scenarios-screen.test.tsx`
Expected: PASS (3 теста).

- [ ] **Step 12: Пробросить `onBack` из `survey-section.tsx`**

В `src/sections/survey/survey-section.tsx`:

(а) добавить обработчик рядом с `handleChooseScenario` (после строки 89):

```tsx
  function handleScenariosBack() {
    if (phase.kind !== "scenarios") return;
    setPhase({ kind: "form" });
  }
```

(б) передать его в экран (строка 178):

```tsx
            <OnboardingScenariosScreen
              onChooseScenario={handleChooseScenario}
              onBack={handleScenariosBack}
            />
```

- [ ] **Step 13: Проверить типы и закоммитить**

Run: `npx tsc --noEmit`
Expected: без ошибок.

```bash
git add src/sections/survey/survey-form.tsx src/sections/survey/onboarding-scenarios-screen.tsx src/sections/survey/onboarding-scenarios-screen.test.tsx src/sections/survey/survey-section.tsx
git commit -m "feat(survey): сайт выше задачи, «хотя бы одно», «Назад» на экране сценариев (group A #2)"
```

---

## Task 4: Блок 3 — шаг сценария: фильтры сверху, «Показать все» добавляет, тег «Из подборки»

**Files:**
- Modify: `src/sections/campaigns/wizard/steps/step-1-scenario.tsx`
- Test: `src/sections/campaigns/wizard/steps/step-1-scenario.test.tsx`

- [ ] **Step 1: Переписать тест под новое поведение**

Заменить блок `describe("Step1Scenario — ...")` (строки 67-197) на новый. Шапку файла (импорты + `vi.mock("@/sections/.../step-content")` + `vi.mock("motion/react")` + блоки `groupScenariosByCategory` и `sourceTypeLabel`, строки 1-65) оставить без изменений.

```tsx
describe("Step1Scenario — фильтры всегда сверху + «Показать все» добавляет каталог", () => {
  afterEach(cleanup);

  const curated = SCENARIOS.filter((s) => s.isCurated);

  function renderStep(onNext = vi.fn()) {
    return render(<Step1Scenario data={initialStepData} onNext={onNext} />);
  }

  it("дефолт: блок подборки, поиск и чипсы видны, «Показать все», без чипа источника", () => {
    renderStep();
    const region = screen.getByRole("region", { name: "Подобрали для вас" });
    for (const s of curated) {
      expect(within(region).getByRole("button", { name: s.name })).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Поиск по сценариям")).toBeInTheDocument();
    for (const category of SCENARIO_CATEGORIES) {
      expect(screen.getByRole("button", { name: category })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Показать все" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Все сценарии" })).not.toBeInTheDocument();
    // Чип типа источника убран на этом шаге.
    expect(screen.queryByText("Новая база номеров")).not.toBeInTheDocument();
    expect(screen.queryByText("Поток")).not.toBeInTheDocument();
    expect(screen.queryByText("Свои сигналы")).not.toBeInTheDocument();
  });

  it("карточки подборки помечены тегом «Из подборки»", () => {
    renderStep();
    const region = screen.getByRole("region", { name: "Подобрали для вас" });
    const tags = within(region).getAllByText("Из подборки");
    expect(tags.length).toBe(curated.length);
  });

  it("«Показать все» добавляет каталог ниже подборки (подборка остаётся)", () => {
    renderStep();
    fireEvent.click(screen.getByRole("button", { name: "Показать все" }));
    expect(screen.getByRole("region", { name: "Подобрали для вас" })).toBeInTheDocument();
    const catalog = screen.getByRole("region", { name: "Все сценарии" });
    const nonBase = SCENARIOS.filter((s) => !s.isBase);
    for (const s of nonBase) {
      expect(within(catalog).getByRole("button", { name: s.name })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Свернуть" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Показать все" })).not.toBeInTheDocument();
  });

  it("«Свернуть» убирает каталог, но подборка и фильтры остаются", () => {
    renderStep();
    fireEvent.click(screen.getByRole("button", { name: "Показать все" }));
    fireEvent.click(screen.getByRole("button", { name: "Свернуть" }));
    expect(screen.queryByRole("region", { name: "Все сценарии" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Подобрали для вас" })).toBeInTheDocument();
    expect(screen.getByLabelText("Поиск по сценариям")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Показать все" })).toBeInTheDocument();
  });

  it("в каталоге курированные несут «Из подборки», обычные — нет", () => {
    renderStep();
    fireEvent.click(screen.getByRole("button", { name: "Показать все" }));
    const catalog = screen.getByRole("region", { name: "Все сценарии" });
    for (const s of curated) {
      const card = within(catalog).getByRole("button", { name: s.name });
      expect(within(card).getByText("Из подборки")).toBeInTheDocument();
    }
    const nonCurated = SCENARIOS.filter((s) => !s.isBase && !s.isCurated);
    for (const s of nonCurated) {
      const card = within(catalog).getByRole("button", { name: s.name });
      expect(within(card).queryByText("Из подборки")).not.toBeInTheDocument();
    }
  });

  it("выбор карточки из подборки вызывает onNext с id", () => {
    const onNext = vi.fn();
    renderStep(onNext);
    const region = screen.getByRole("region", { name: "Подобрали для вас" });
    fireEvent.click(within(region).getByRole("button", { name: curated[0].name }));
    expect(onNext).toHaveBeenCalledWith({ scenario: curated[0].id });
  });

  it("выбор карточки из каталога вызывает onNext с id", () => {
    const onNext = vi.fn();
    renderStep(onNext);
    fireEvent.click(screen.getByRole("button", { name: "Показать все" }));
    const catalog = screen.getByRole("region", { name: "Все сценарии" });
    const target = SCENARIOS.find((s) => !s.isBase && !s.isCurated)!;
    fireEvent.click(within(catalog).getByRole("button", { name: target.name }));
    expect(onNext).toHaveBeenCalledWith({ scenario: target.id });
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx vitest run src/sections/campaigns/wizard/steps/step-1-scenario.test.tsx`
Expected: FAIL — фильтры пока в ветке `showAll`, нет регионов с aria-label, тег «Подобрано для вас» вместо «Из подборки».

- [ ] **Step 3: Переписать компонент**

Заменить тело `return (...)` функции `Step1Scenario` (строки 115-233) на структуру: поиск и чипсы всегда сверху, постоянный блок подборки `<section aria-label="Подобрали для вас">`, кнопка-тоггл, и добавляемый `<motion.section aria-label="Все сценарии">` при `showAll`. Хуки/`useMemo`/`handleSelect`/`toggleCategory` (строки 72-113) не трогать.

```tsx
  return (
    <StepContent
      title="Выберите сценарий для кампании"
      subtitle="Готовая связка сигнала и кампании под бизнес-цель"
    >
      <div className="flex flex-col gap-4">
        {/* Поиск — всегда сверху */}
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

        {/* Чипсы категорий — всегда сверху */}
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

        {/* Подборка — постоянный блок */}
        <section aria-label="Подобрали для вас" className="flex flex-col gap-3">
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
                curatedLabel="Из подборки"
              />
            ))}
          </div>
        </section>

        {/* Тоггл «Показать все» ↔ «Свернуть» */}
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {showAll ? "Свернуть" : "Показать все"}
        </button>

        {/* Полный каталог — добавляется ниже подборки */}
        <AnimatePresence initial={false}>
          {showAll && (
            <motion.section key="all" aria-label="Все сценарии" {...collapseMotion}>
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
                            curatedLabel={s.isCurated ? "Из подборки" : undefined}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </StepContent>
  );
```

- [ ] **Step 4: Запустить — должен пройти**

Run: `npx vitest run src/sections/campaigns/wizard/steps/step-1-scenario.test.tsx`
Expected: PASS (включая блоки `groupScenariosByCategory` и `sourceTypeLabel`).

- [ ] **Step 5: Проверить типы**

Run: `npx tsc --noEmit`
Expected: без ошибок. (`sourceTypeLabel` остаётся экспортированной — используется в тесте; в рендере больше не вызывается — это допустимо.)

- [ ] **Step 6: Коммит**

```bash
git add src/sections/campaigns/wizard/steps/step-1-scenario.tsx src/sections/campaigns/wizard/steps/step-1-scenario.test.tsx
git commit -m "feat(wizard): фильтры всегда сверху, «Показать все» добавляет каталог, тег «Из подборки» (group A #3)"
```

---

## Task 5: Финальная проверка всей Группы A

- [ ] **Step 1: Прогнать все тесты**

Run: `npx vitest run`
Expected: PASS — все тесты зелёные (включая не затронутые).

- [ ] **Step 2: Типы**

Run: `npx tsc --noEmit`
Expected: ровно **13 пре-существующих** ошибок — все в `src/components/ai-elements/*` (вендорная база на base-ui) и одна в `src/sections/campaigns/campaign-cost.ts:154`. Группа A их не вносила (наши файлы: welcome / step-channels / survey / survey-validation — без ошибок). Гейт: количество и расположение ошибок не изменились относительно базы `da8cd05`; ни одна ошибка не ссылается на файлы Группы A.

- [ ] **Step 3: Линт**

Run: `npm run lint`
Expected: без новых ошибок в файлах Группы A (если в репо есть пре-существующие предупреждения/ошибки линта вне наших файлов — это не регрессия Группы A; сверить с базой).

- [ ] **Step 4: Сообщить итог**

Сообщить путь воркдерева (`.worktrees/group-a`) и ветку (`feature/group-a`). Слияние/удаление воркдерева — решение пользователя (не пушить и не мёржить в `main`).

---

## Соответствие критериям приёмки спеки

- **Блок 1:** порядок Сигналы/Коммуникации/Статистика; карточка 2 «Коммуникации»; тест зелёный → Task 1.
- **Блок 5:** стоимость из `UNIT_COST` «N ₽ / отправка»; блок «Получить только сигналы» с разделителем, заголовком и описанием; выбор очищает каналы (логика `selectNoComms` сохранена) → Task 2.
- **Блок 2:** сайт выше задачи; сабмит при ≥1 поле, иначе ошибка и блок; «Назад»(слева)/«Далее»(справа), «Назад» → форма → Task 3.
- **Блок 3:** поиск и фильтр всегда видны; «Показать все» добавляет каталог, «Свернуть» убирает; нет чипа источника; тег «Из подборки» на подборке → Task 4.

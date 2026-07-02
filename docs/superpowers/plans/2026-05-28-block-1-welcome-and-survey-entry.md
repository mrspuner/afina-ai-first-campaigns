# Block 1 — Welcome screen and Survey entry point Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перенести Survey из «гейта перед Welcome» в полноценную точку входа, открываемую с Welcome кнопкой «Расскажите о себе» (fullscreen-режим). Welcome приводим к новому контенту с двумя состояниями (first-time / returning), плашки делаем декоративными, skip удаляем.

**Architecture:** Новый `view.kind: "survey"` в дискриминированном union управляет видимостью chrome (sidebar + bottom bar). Welcome — статический компонент с two-state рендером по `surveyStatus`. Survey остаётся 4-фазным flow, но теряет prop `skippable`. Переход survey → wizard происходит через существующую цепочку `catalog_open` → modal → `catalog_select` (which already sets view.kind: "guided-signal"). `AnimatePresence` на уровне `page.tsx` обеспечивает плавный fade.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, motion/react v12, vitest.

**Спека:** `docs/superpowers/specs/2026-05-28-block-1-welcome-and-survey-entry-design.md`

---

## File Structure

| Файл | Роль | Состояние |
|---|---|---|
| `src/types/survey.ts` | Тип `SurveyStatus` | Модификация — удалить `"skipped"` |
| `src/state/app-state.ts` | Reducer, types `View`/`Action`/`ViewAddress` | Модификация — `open_survey`, удалить `survey_skipped`, добавить `survey` в `View`, обновить `viewToAddress` |
| `src/state/app-state.test.ts` | Юнит-тесты reducer'а | Модификация — добавить тесты `open_survey`, удалить тесты `survey_skipped` |
| `src/state/survey-gate.test.ts` | Тесты defensive-гейта | Модификация — удалить кейс `"skipped"` |
| `src/sections/survey/survey-section.tsx` | Корневой компонент Survey | Модификация — удалить `skippable`, `onSkip`, диспатч `survey_skipped` |
| `src/sections/survey/survey-form.tsx` | Шаг 1 — сайт | Модификация — удалить кнопку «Пропустить» и связанные props, обновить копирайт |
| `src/sections/survey/survey-awaiting.tsx` | Шаг 2 — насыщение | Модификация — обновить копирайт |
| `src/sections/survey/onboarding-scenarios-screen.tsx` | Шаг 4 — витрина | Модификация — обновить копирайт |
| `src/sections/welcome/onboarding-step-cards.tsx` | 3 плашки | Существенная модификация — декоративные карточки без CTA/opacity/labels, новые тексты |
| `src/sections/welcome/welcome-view.tsx` | Hero + plates + CTA-блок | Существенная модификация — two-state hero + CTA-блок «Подберём сценарии под ваш бизнес» / «Запустить новый сценарий» |
| `src/app/page.tsx` | Корневой layout, `renderMain()`, chrome | Модификация — убрать гейт survey-перед-welcome, добавить кейс `view.kind === "survey"`, обернуть `AppSidebar` / `BottomBarSlot` / `LaunchFlyout` в `AnimatePresence` |

Все правки — внутри существующих файлов. Новых файлов не создаём.

---

### Task 1: Удалить `"skipped"` из типа `SurveyStatus`

**Files:**
- Modify: `src/types/survey.ts:9`

- [ ] **Step 1: Открыть `src/types/survey.ts`, заменить тип**

```ts
// было:
export type SurveyStatus = "not_started" | "completed" | "skipped";

// стало:
export type SurveyStatus = "not_started" | "completed";
```

- [ ] **Step 2: Проверить, что TypeScript падает на оставшихся ссылках на `"skipped"`**

Run: `npx tsc --noEmit`
Expected: ошибки в `src/state/app-state.ts:683` (case "survey_skipped" → `surveyStatus: "skipped"`), в `src/sections/survey/survey-section.tsx:54` (диспатч `survey_skipped`), в `src/state/survey-gate.test.ts:25`, в `src/state/app-state.test.ts:789-797, 805`.

Это ожидаемо — следующие задачи их убирают.

- [ ] **Step 3: НЕ коммитим — продолжаем в Task 2 (одна изменённая строка не имеет смысла отдельным коммитом)**

---

### Task 2: Reducer и actions — добавить `open_survey`, удалить `survey_skipped`, добавить `survey` в `View`

**Files:**
- Modify: `src/state/app-state.ts:99-106` (View), `:225-...` (Action union), `:294-...` (reducer), `:893-914` (viewToAddress)

- [ ] **Step 1: Расширить тип `View` — добавить `"survey"` (`src/state/app-state.ts:99-106`)**

```ts
export type View =
  | { kind: "welcome" }
  | { kind: "survey" }
  | { kind: "guided-signal"; initialScenario?: { id: string; name: string } }
  | { kind: "awaiting-campaign" }
  | { kind: "campaign-select" }
  | { kind: "workflow"; campaign: { id: string; name: string }; launched: boolean }
  | { kind: "campaign"; campaign: { id: string; name: string } }
  | { kind: "section"; name: SectionName; campaignId?: string };
```

`ViewAddress` НЕ расширяем — survey не персистится в history (см. Step 4 ниже).

- [ ] **Step 2: Добавить action `open_survey`, удалить `survey_skipped` из `Action` union (`src/state/app-state.ts:230`)**

В union убрать строку `| { type: "survey_skipped" }` и добавить `| { type: "open_survey" }`.

Финальное расположение (рядом с остальными `survey_*` actions, после `survey_completed`):

```ts
  | { type: "survey_updated"; patch: Partial<Survey> }
  | { type: "survey_completed"; survey: Survey }
  | { type: "open_survey" }
  // (строка "survey_skipped" удалена)
  | { type: "survey_reset" }
```

- [ ] **Step 3: Добавить case `"open_survey"` в reducer, удалить `"survey_skipped"` (`src/state/app-state.ts:672-691`)**

Заменить блок reducer-cases вокруг survey следующим:

```ts
    case "survey_updated":
      return { ...state, survey: { ...state.survey, ...action.patch } };

    case "survey_completed":
      return {
        ...state,
        survey: action.survey,
        surveyStatus: "completed",
        // Анкета — единственный источник «направления клиента» для пользователя.
        // Дев-панель просто отражает это значение и позволяет тестово переопределить.
        clientDirection: businessDirectionFromSurvey(action.survey.directionId),
      };

    case "open_survey":
      return { ...state, view: { kind: "survey" } };

    case "survey_reset":
      return {
        ...state,
        survey: EMPTY_SURVEY,
        surveyStatus: "not_started",
        clientDirection: DEFAULT_DIRECTION_ID,
      };
```

(Целый case `"survey_skipped"` удалён.)

- [ ] **Step 4: Обновить `viewToAddress` — survey мапится в welcome (`src/state/app-state.ts:893-914`)**

В switch добавить кейс `"survey"` ДО или ВМЕСТО `welcome`-кейса:

```ts
export function viewToAddress(view: View): ViewAddress {
  switch (view.kind) {
    case "welcome":
    case "survey":
      // Survey — транзиентный fullscreen-стейт; back/forward не должен
      // возвращать пользователя в survey как отдельный URL — мапим в welcome.
      return { kind: "welcome" };
    case "guided-signal":
      return {
        kind: "guided-signal",
        scenarioId: view.initialScenario?.id,
        scenarioName: view.initialScenario?.name,
      };
    case "awaiting-campaign":
      return { kind: "awaiting-campaign" };
    case "campaign-select":
      return { kind: "campaign-select" };
    case "workflow":
      return { kind: "workflow", campaignId: view.campaign.id };
    case "campaign":
      return { kind: "campaign", campaignId: view.campaign.id };
    case "section":
      return { kind: "section", name: view.name, campaignId: view.campaignId };
  }
}
```

- [ ] **Step 5: Запустить TypeScript-чек — должны остаться только ошибки в Survey-компонентах и тестах**

Run: `npx tsc --noEmit`
Expected: ошибки только в `src/sections/survey/survey-section.tsx:54` (диспатч `survey_skipped`), `src/state/survey-gate.test.ts:25` и `src/state/app-state.test.ts` (тесты с `"skipped"`). Их чиним в следующих задачах.

- [ ] **Step 6: Не коммитим — продолжаем (state-слой ещё не имеет тестов для нового action)**

---

### Task 3: Юнит-тесты reducer'а — добавить `open_survey`, удалить `survey_skipped`-тесты

**Files:**
- Modify: `src/state/app-state.test.ts:789-808`

- [ ] **Step 1: Удалить тесты `survey_skipped` и заменить их на тесты `open_survey`**

В `src/state/app-state.test.ts` найти блоки `"survey_skipped flips status without writing data"` (lines 789-797) и `"does not mutate unrelated slices"` с диспатчем `survey_skipped` (lines 799-808). Заменить целиком на следующие тесты:

```ts
  it("open_survey switches view.kind to survey", () => {
    const next = appReducer(initialState, { type: "open_survey" });
    expect(next.view).toEqual({ kind: "survey" });
  });

  it("open_survey does not mutate survey data or surveyStatus", () => {
    const state: AppState = {
      ...initialState,
      survey: {
        companyName: "Acme",
        companyWebsite: "https://acme.example",
        directionId: "auto",
      },
      surveyStatus: "not_started",
    };
    const next = appReducer(state, { type: "open_survey" });
    expect(next.survey).toBe(state.survey);
    expect(next.surveyStatus).toBe("not_started");
  });
```

- [ ] **Step 2: Запустить тесты — должны пройти**

Run: `npx vitest run src/state/app-state.test.ts`
Expected: all PASS (включая два новых теста для `open_survey`).

- [ ] **Step 3: Запустить TypeScript-чек**

Run: `npx tsc --noEmit`
Expected: остались ошибки только в `src/sections/survey/survey-section.tsx:54` и `src/state/survey-gate.test.ts:25`.

- [ ] **Step 4: Commit**

```bash
git add src/types/survey.ts src/state/app-state.ts src/state/app-state.test.ts
git commit -m "feat(state): add open_survey action and survey view kind, remove survey_skipped"
```

---

### Task 4: Обновить `survey-gate.test.ts` — удалить кейс `"skipped"`

**Files:**
- Modify: `src/state/survey-gate.test.ts:23-27`

- [ ] **Step 1: Удалить тест-кейс `"treats a skipped survey as still needing the site screen"`**

Удалить блок lines 23-27 в `src/state/survey-gate.test.ts`:

```ts
  // УДАЛИТЬ:
  it("treats a skipped survey as still needing the site screen", () => {
    expect(
      shouldShowSurveyGate({ surveyStatus: "skipped", isResuming: false })
    ).toBe(true);
  });
```

Файл должен остаться с тремя `it`-блоками (`not_started`, `completed`, `isResuming: true`).

- [ ] **Step 2: Запустить тест**

Run: `npx vitest run src/state/survey-gate.test.ts`
Expected: 3 PASS, 0 FAIL.

Логика `shouldShowSurveyGate` саму не меняем — `surveyStatus !== "completed"` корректно покрывает `"not_started"` (true) и не имеет случая `"skipped"` после удаления из типа.

---

### Task 5: `SurveyForm` — удалить кнопку «Пропустить», обновить копирайт

**Files:**
- Modify: `src/sections/survey/survey-form.tsx`

- [ ] **Step 1: Заменить файл полностью**

```tsx
"use client";

import { useState } from "react";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import {
  isWebsiteValid,
  normalizeWebsite,
} from "@/state/survey-validation";
import type { Survey } from "@/types/survey";

interface SurveyFormProps {
  onSubmit: (survey: Survey) => void;
  title?: string;
  subtitle?: string;
}

export function SurveyForm({
  onSubmit,
  title = "С чего начнём — дайте ссылку на ваш сайт",
  subtitle = "По сайту афина поймёт, чем вы занимаетесь, и подберёт подходящие сценарии.",
}: SurveyFormProps) {
  const { survey } = useAppState();
  const dispatch = useAppDispatch();

  const [website, setWebsite] = useState(survey.companyWebsite);
  const [showErrors, setShowErrors] = useState(false);

  const websiteOk = isWebsiteValid(website);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!websiteOk) {
      setShowErrors(true);
      return;
    }
    const filled: Survey = {
      companyName: survey.companyName,
      companyWebsite: normalizeWebsite(website),
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
      <Field
        id="survey-website"
        label="Сайт компании"
        error={
          showErrors && !websiteOk
            ? "Введите адрес вида example.com"
            : undefined
        }
      >
        <Input
          id="survey-website"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="example.com"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          aria-invalid={showErrors && !websiteOk ? true : undefined}
        />
      </Field>
      <div className="mt-8 flex items-center justify-end">
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

Изменения относительно исходного: убраны `skippable` и `onSkip` props, убрана кнопка «Пропустить» и обёртка с двумя кнопками (теперь просто `justify-end`), новые дефолты для `title`/`subtitle`, убран `hint="По нему мы предзаполним интересы"` под полем сайта (он остаётся `Field`-параметром на случай других вызовов, но не используется по умолчанию).

- [ ] **Step 2: Не запускаем тесты — компонент UI**

`survey-section.tsx` ещё передаёт `skippable={skippable}` и `onSkip={skippable ? handleSkip : undefined}` — это сломает TS. Чиним в Task 6.

---

### Task 6: `SurveySection` — удалить `skippable`/`onSkip`

**Files:**
- Modify: `src/sections/survey/survey-section.tsx`

- [ ] **Step 1: Заменить файл целиком**

```tsx
"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { useAppDispatch } from "@/state/app-state-context";
import type { Survey } from "@/types/survey";

import { SurveyAwaiting } from "./survey-awaiting";
import { SurveyForm } from "./survey-form";
import { OnboardingInterestsScreen } from "./onboarding-interests-screen";
import { OnboardingScenariosScreen } from "./onboarding-scenarios-screen";

type Phase =
  | { kind: "form" }
  | { kind: "awaiting"; survey: Survey }
  | { kind: "interests"; survey: Survey }
  | { kind: "scenarios"; survey: Survey };

interface SurveySectionProps {
  // Called once the user finishes onboarding. The first-visit flow opens the
  // scenario catalog from inside this section; gate-mode flows just need the
  // user handed off to the wizard. The caller decides what to do next.
  onComplete: () => void;
  // When true, run the full 3-screen onboarding (form → enrich → interests →
  // scenarios → caller). When false (legacy gate before the wizard), stop
  // after the enrich animation and hand off to the wizard.
  withOnboardingScreens?: boolean;
  title?: string;
  subtitle?: string;
}

export function SurveySection({
  onComplete,
  withOnboardingScreens = false,
  title,
  subtitle,
}: SurveySectionProps) {
  const dispatch = useAppDispatch();
  const [phase, setPhase] = useState<Phase>({ kind: "form" });

  function handleSubmit(survey: Survey) {
    setPhase({ kind: "awaiting", survey });
  }

  function handleAwaitingDone() {
    if (phase.kind !== "awaiting") return;
    if (withOnboardingScreens) {
      setPhase({ kind: "interests", survey: phase.survey });
      return;
    }
    dispatch({ type: "survey_completed", survey: phase.survey });
    onComplete();
  }

  function handleInterestsContinue() {
    if (phase.kind !== "interests") return;
    setPhase({ kind: "scenarios", survey: phase.survey });
  }

  function handleChooseScenario() {
    if (phase.kind !== "scenarios") return;
    dispatch({ type: "survey_completed", survey: phase.survey });
    dispatch({ type: "catalog_open", returnTo: "onboarding" });
    onComplete();
  }

  return (
    <div className="flex flex-1 items-center justify-center px-8 pb-16 pt-[120px]">
      <AnimatePresence mode="wait">
        {phase.kind === "form" && (
          <motion.div
            key="form"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            className="flex w-full justify-center"
          >
            <SurveyForm
              onSubmit={handleSubmit}
              title={title}
              subtitle={subtitle}
            />
          </motion.div>
        )}
        {phase.kind === "awaiting" && (
          <motion.div
            key="awaiting"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            className="flex w-full justify-center"
          >
            <SurveyAwaiting
              onDone={handleAwaitingDone}
              websiteHostname={hostnameFor(phase.survey.companyWebsite)}
            />
          </motion.div>
        )}
        {phase.kind === "interests" && (
          <motion.div
            key="interests"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            className="flex w-full justify-center"
          >
            <OnboardingInterestsScreen onContinue={handleInterestsContinue} />
          </motion.div>
        )}
        {phase.kind === "scenarios" && (
          <motion.div
            key="scenarios"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            className="flex w-full justify-center"
          >
            <OnboardingScenariosScreen onChooseScenario={handleChooseScenario} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function hostnameFor(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}
```

Изменения относительно исходного: удалены props `skippable`/`onSkip`, функция `handleSkip`, передача `skippable`/`onSkip` в `SurveyForm`.

- [ ] **Step 2: Запустить TypeScript-чек**

Run: `npx tsc --noEmit`
Expected: ошибки уйдут с `survey-section.tsx`, останутся только ошибки в `src/app/page.tsx` (передача `skippable={true}` и `onSkip={...}` в `SurveySection`). Их чиним в Task 11.

---

### Task 7: `SurveyAwaiting` — обновить копирайт

**Files:**
- Modify: `src/sections/survey/survey-awaiting.tsx:40-47`

- [ ] **Step 1: Заменить заголовок и подзаголовок**

```tsx
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Изучаем ваш бизнес
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {websiteHostname
          ? `Анализируем ${websiteHostname}…`
          : "афина анализирует сайт и сопоставляет его с данными об аудитории."}
      </p>
```

(было: `Обогащение данными` / `Изучаем ... и дополняем профиль компании` / `Дополняем профиль компании данными`.)

- [ ] **Step 2: Не запускаем тесты — pure UI text change**

---

### Task 8: `OnboardingScenariosScreen` — обновить копирайт

**Files:**
- Modify: `src/sections/survey/onboarding-scenarios-screen.tsx:19-34`

- [ ] **Step 1: Заменить заголовок и подзаголовок**

```tsx
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.05, ease: [0.23, 1, 0.32, 1] }}
        className="text-[38px] font-semibold leading-[1.1] tracking-tight"
      >
        Готово — подобрали {scenarioCount} сценариев<br />под ваш бизнес
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}
        className="max-w-md text-sm text-muted-foreground"
      >
        Каждый сценарий заточен под вашу аудиторию. Выберите, с какого начать.
      </motion.p>
```

(было: `Мы нашли {N} сценариев / специально для вас` / `Каждый сценарий — готовая связка...`.)

- [ ] **Step 2: Кнопку «Выбрать сценарий →» НЕ трогаем — оставляем как есть.**

---

### Task 9: `OnboardingStepCards` — декоративные плашки, новые тексты

**Files:**
- Modify: `src/sections/welcome/onboarding-step-cards.tsx` целиком

- [ ] **Step 1: Заменить файл целиком**

```tsx
"use client";

import { cn } from "@/lib/utils";

type Plate = {
  heading: string;
  description: string;
};

const PLATES: readonly Plate[] = [
  {
    heading: "Сигналы",
    description:
      "афина находит, кто из вашей аудитории готов к покупке прямо сейчас — по поведению и данным.",
  },
  {
    heading: "Кампании",
    description:
      "Запускаем точечную кампанию на этих клиентов: нужное сообщение в нужный момент.",
  },
  {
    heading: "Статистика",
    description:
      "Видите результат в цифрах — кто отреагировал, сколько принесла кампания.",
  },
] as const;

function plateClass() {
  return cn(
    "flex flex-col items-start rounded-lg border border-border bg-card p-4 text-left",
    // Page-entrance: each card cascades in with a 60 ms stagger between
    // siblings. Per-card delay is set via inline style at the call site.
    "animate-in fade-in-0 slide-in-from-bottom-2 [--tw-animation-duration:280ms] [--tw-ease:var(--ease-out)]"
  );
}

function staggerStyle(i: number): React.CSSProperties | undefined {
  return i > 0 ? { animationDelay: `${i * 60}ms` } : undefined;
}

export function OnboardingStepCards() {
  return (
    <div className="grid w-full grid-cols-3 gap-3">
      {PLATES.map((plate, i) => (
        <div key={plate.heading} className={plateClass()} style={staggerStyle(i)}>
          <span className="text-sm font-medium text-foreground">
            {plate.heading}
          </span>
          <span className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {plate.description}
          </span>
        </div>
      ))}
    </div>
  );
}
```

Изменения относительно исходного:
- удалены импорты `isStep1Active`/`isStep2Active`/`isStep3Active`, `useAppState`/`useAppDispatch`, `Button`, `scenarioCount`
- удалён `StepBody` и его лейбл «Шаг {n}»
- удалён in-card CTA «Создать сигнал»
- удалены `<button>`-варианты для step 2 / step 3 (вся карточка теперь `<div>`)
- удалены states active/disabled, opacity-35
- тексты STEPS заменены на «Сигналы / Кампании / Статистика» с новыми описаниями
- имя массива `STEPS` → `PLATES` (отражает, что это уже не шаги)

- [ ] **Step 2: Запустить TypeScript-чек**

Run: `npx tsc --noEmit`
Expected: всё ещё ошибки только в `src/app/page.tsx`. Удаление импортов `isStep*Active` из step-cards не ломает их использование где-либо ещё — `grep -rn "isStep[123]Active" src/` должен вернуть только `app-state.ts` (определение).

- [ ] **Step 3: Проверить, что `isStepNActive` больше нигде не используется**

Run: `grep -rn "isStep[123]Active" src/`
Expected: только `src/state/app-state.ts:924-926` (определения). Если так — определения можно удалить как мёртвый код, но НЕ удаляем в рамках этой задачи (отдельная зачистка).

---

### Task 10: `WelcomeView` + `WelcomeSection` — two-state рендер с hero / plates / CTA-блоком

**Files:**
- Modify: `src/sections/welcome/welcome-view.tsx` целиком
- (`welcome-section.tsx` не меняется — он просто прокидывает `chat`.)

- [ ] **Step 1: Заменить `welcome-view.tsx` целиком**

```tsx
"use client";

import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { isCampaignDone } from "@/state/app-state";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import { OnboardingChatHistory } from "./onboarding-chat-view";
import { OnboardingStepCards } from "./onboarding-step-cards";
import type { OnboardingChatState } from "./use-onboarding-chat";

const HERO_EASE = [0.32, 0.72, 0, 1] as const;

export function WelcomeView({ chat }: { chat: OnboardingChatState }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const done = isCampaignDone(state);

  // The conversation counts as started the moment any message (including
  // the pending bot bubble) is in history — that drives the hero exit.
  const conversationStarted = chat.history.length > 0;

  const surveyCompleted = state.surveyStatus === "completed";

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 pt-16 pb-promptbar"
    >
      <motion.div
        layout
        transition={{ duration: 0.42, ease: HERO_EASE }}
        className="flex w-full max-w-2xl flex-col items-start gap-8"
      >
        {done ? (
          <div className="flex w-full flex-col items-start gap-2">
            <h1 className="text-[28px] font-bold leading-8 text-foreground">
              Добро пожаловать
            </h1>
            <p className="text-[18px] leading-[22px] text-muted-foreground">
              Что вы хотите сделать
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false} mode="popLayout">
            {!conversationStarted && (
              <motion.div
                key="hero"
                initial={false}
                exit={{ opacity: 0, y: -20, filter: "blur(10px)" }}
                transition={{ duration: 0.42, ease: HERO_EASE }}
                className="flex w-full flex-col items-start gap-8"
              >
                {surveyCompleted ? (
                  <ReturningHero
                    onCreateScenario={() => dispatch({ type: "start_signal_flow" })}
                  />
                ) : (
                  <FirstTimeHero
                    onOpenSurvey={() => dispatch({ type: "open_survey" })}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}

        <motion.div
          layout
          transition={{ duration: 0.42, ease: HERO_EASE }}
          className="w-full"
        >
          <OnboardingChatHistory history={chat.history} />
        </motion.div>
      </motion.div>
    </div>
  );
}

function FirstTimeHero({ onOpenSurvey }: { onOpenSurvey: () => void }) {
  return (
    <>
      <div className="flex w-full flex-col items-start gap-3">
        <h1 className="text-[28px] font-bold leading-8 text-foreground">
          Добро пожаловать в афина
        </h1>
        <p className="text-[16px] leading-[22px] text-muted-foreground">
          афина работает сценариями. Сценарий — это готовый план работы с
          вашей аудиторией: он находит нужных клиентов, запускает кампанию и
          показывает результат.
        </p>
        <p className="text-[16px] leading-[22px] text-muted-foreground">
          Каждый сценарий состоит из трёх частей — сигнал, кампания и
          статистика. Вот как это устроено:
        </p>
      </div>

      <OnboardingStepCards />

      <div className="flex w-full flex-col items-start gap-3 rounded-lg border border-border bg-card p-5">
        <h2 className="text-[18px] font-semibold leading-6 text-foreground">
          Подберём сценарии под ваш бизнес
        </h2>
        <p className="text-[14px] leading-[20px] text-muted-foreground">
          Расскажите о себе за минуту — и афина предложит сценарии, которые
          подойдут именно вашей кампании.
        </p>
        <Button size="lg" className="mt-1" onClick={onOpenSurvey}>
          Расскажите о себе
        </Button>
      </div>
    </>
  );
}

function ReturningHero({ onCreateScenario }: { onCreateScenario: () => void }) {
  return (
    <>
      <div className="flex w-full flex-col items-start gap-2">
        <h1 className="text-[28px] font-bold leading-8 text-foreground">
          Добро пожаловать в афина
        </h1>
        <p className="text-[16px] leading-[22px] text-muted-foreground">
          Сценарии уже подобраны под ваш бизнес — запустите ещё один.
        </p>
      </div>

      <Button size="lg" onClick={onCreateScenario}>
        Запустить новый сценарий →
      </Button>
    </>
  );
}
```

Изменения относительно исходного:
- `items-center` / `text-center` → `items-start` / `text-left` (PRODUCT.md «asymmetry over center»)
- добавлены два внутренних компонента `FirstTimeHero` и `ReturningHero` — переключаются по `surveyStatus === "completed"`
- `FirstTimeHero` рендерит hero-абзацы из §6.1 спеки + `OnboardingStepCards` + CTA-блок «Подберём сценарии…»
- `ReturningHero` рендерит компактный hero + кнопку «Запустить новый сценарий →»
- При `done` (post-campaign welcome) behavior сохраняется как было — это отдельная ветка из существующего кода.

- [ ] **Step 2: Запустить TypeScript-чек**

Run: `npx tsc --noEmit`
Expected: всё ещё ошибки только в `src/app/page.tsx`.

---

### Task 11: `page.tsx` — гейт, view "survey", AnimatePresence для chrome

**Files:**
- Modify: `src/app/page.tsx` целиком

- [ ] **Step 1: Заменить файл целиком**

```tsx
"use client";

import { PromptInputProvider } from "@/components/ai-elements/prompt-input";
import { PromptChipsProvider } from "@/state/prompt-chips-context";
import { ChatProvider } from "@/state/chat-context";
import { TriggerEditRegistryProvider } from "@/state/trigger-edit-context";
import { DraftQueueProvider } from "@/state/draft-queue-context";
import { ChatPanel } from "@/sections/shell/chat-panel";
import { ChatDrawer } from "@/sections/shell/chat-drawer";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { useChat } from "@/state/chat-context";
import { AppSidebar } from "@/sections/shell/app-sidebar";
import { LaunchFlyout } from "@/sections/shell/launch-flyout";
import { ScenarioCatalogModal } from "@/sections/signals/scenario-catalog-modal";
import { ShellBottomBar } from "@/sections/shell/shell-bottom-bar";
import { WelcomeSection } from "@/sections/welcome/welcome-section";
import { SurveySection } from "@/sections/survey/survey-section";
import { WelcomeChatProvider } from "@/sections/welcome/welcome-chat-context";
import { useOnboardingChat } from "@/sections/welcome/use-onboarding-chat";
import { GuidedSignalSection } from "@/sections/signals/guided-signal-section";
import { SignalsSection } from "@/sections/signals/signals-section";
import { CampaignsSection } from "@/sections/campaigns/campaigns-section";
import { CampaignTypeView } from "@/sections/campaigns/campaign-type-view";
import { WorkflowSection } from "@/sections/campaigns/workflow-section";
import { CampaignScreen } from "@/sections/campaigns/campaign-screen";
import { StatisticsSection } from "@/sections/statistics/statistics-section";
import { SettingsSection } from "@/sections/settings/settings-section";
import { DevPanel } from "@/components/dev/dev-panel";
import { AnimatePresence, motion } from "motion/react";

const SHELL_EASE = [0.32, 0.72, 0, 1] as const;

function BottomBarSlot() {
  const { view } = useAppState();
  const { mode } = useChat();
  // При открытом drawer нижний бар скрыт — у drawer свой композер.
  if (mode === "sidebar") return null;
  return view.kind === "guided-signal" ? (
    <ChatPanel placeholder="Введите ваши параметры или задайте вопрос" />
  ) : (
    <ShellBottomBar />
  );
}

export default function Home() {
  const { view, launchFlyoutOpen, activeSection, catalog } = useAppState();
  const dispatch = useAppDispatch();
  const welcomeChat = useOnboardingChat();

  const isSurveyFullscreen = view.kind === "survey";

  function renderMain() {
    if (view.kind === "welcome") {
      return <WelcomeSection />;
    }
    if (view.kind === "survey") {
      return (
        <SurveySection
          withOnboardingScreens
          onComplete={() => { /* catalog open routes the user from here */ }}
        />
      );
    }
    if (view.kind === "guided-signal" || view.kind === "awaiting-campaign")
      return <GuidedSignalSection />;
    if (view.kind === "campaign-select")
      return (
        <CampaignTypeView
          onSelect={(id, name) =>
            dispatch({ type: "campaign_selected", campaign: { id, name } })
          }
        />
      );
    if (view.kind === "workflow") return <WorkflowSection />;
    if (view.kind === "campaign") return <CampaignScreen />;
    if (view.kind === "section") {
      if (view.name === "Статистика") return <StatisticsSection />;
      if (view.name === "Сигналы") return <SignalsSection />;
      if (view.name === "Кампании") return <CampaignsSection />;
      if (view.name === "Настройки") return <SettingsSection />;
    }
    return null;
  }

  return (
    <PromptInputProvider>
      <PromptChipsProvider>
      <WelcomeChatProvider value={welcomeChat}>
        <ChatProvider>
        <DraftQueueProvider>
        <TriggerEditRegistryProvider>
        <div className="flex h-screen overflow-hidden bg-background">
          <AnimatePresence initial={false}>
            {!isSurveyFullscreen && (
              <motion.div
                key="sidebar"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.28, ease: SHELL_EASE }}
              >
                <AppSidebar
                  activeNav={activeSection ?? undefined}
                  onNavChange={(nav) => dispatch({ type: "sidebar_nav", section: nav })}
                  onLaunchOpen={() => dispatch({ type: "flyout_open" })}
                  onLogoClick={() => dispatch({ type: "go_welcome" })}
                  flyoutOpen={launchFlyoutOpen}
                />
              </motion.div>
            )}
          </AnimatePresence>
          {!isSurveyFullscreen && (
            <LaunchFlyout
              open={launchFlyoutOpen}
              onClose={() => dispatch({ type: "flyout_close" })}
            />
          )}
          <ScenarioCatalogModal
            open={catalog !== null}
            onClose={() => dispatch({ type: "catalog_close" })}
            onSelect={(scenarioId) => dispatch({ type: "catalog_select", scenarioId })}
          />
          <div className="relative flex flex-1 flex-col overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={view.kind}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.26, ease: SHELL_EASE }}
                className="flex flex-1 flex-col overflow-hidden"
              >
                {renderMain()}
              </motion.div>
            </AnimatePresence>
            <AnimatePresence initial={false}>
              {!isSurveyFullscreen && (
                <motion.div
                  key="bottom-bar"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={{ duration: 0.28, ease: SHELL_EASE }}
                >
                  <BottomBarSlot />
                </motion.div>
              )}
            </AnimatePresence>
            <ChatDrawer placeholder="Введите ваши параметры или задайте вопрос" />
            <DevPanel />
          </div>
        </div>
        </TriggerEditRegistryProvider>
        </DraftQueueProvider>
        </ChatProvider>
      </WelcomeChatProvider>
      </PromptChipsProvider>
    </PromptInputProvider>
  );
}
```

Изменения относительно исходного:
- удалён `surveyStatus` из деструктуризации `useAppState` (больше не нужен здесь — логика ушла в `WelcomeView`)
- удалён старый гейт `if (surveyStatus === "not_started") return <SurveySection ...>` внутри ветки `welcome`
- добавлена ветка `if (view.kind === "survey") return <SurveySection withOnboardingScreens onComplete={...} />` без `skippable`/`onSkip`
- `AppSidebar`, `LaunchFlyout`, `BottomBarSlot` обёрнуты в `AnimatePresence` с условием `!isSurveyFullscreen` (`LaunchFlyout` без motion-обёртки — у него своя анимация изнутри, просто условный рендер)
- `renderMain()` обёрнут в `AnimatePresence mode="wait"` с ключом `view.kind` — это плавный fade при смене survey ↔ guided-signal
- импортированы `AnimatePresence`, `motion`, добавлена константа `SHELL_EASE`

- [ ] **Step 2: Запустить TypeScript-чек**

Run: `npx tsc --noEmit`
Expected: NO errors.

- [ ] **Step 3: Запустить unit-тесты**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 4: Запустить lint**

Run: `npx eslint src/`
Expected: NO new warnings/errors в затронутых файлах. (Если ESLint падает на pre-existing issues — оставить как есть, не чинить вне scope.)

- [ ] **Step 5: Commit**

```bash
git add src/types/survey.ts src/state/app-state.ts src/state/app-state.test.ts src/state/survey-gate.test.ts \
        src/sections/survey/survey-section.tsx src/sections/survey/survey-form.tsx \
        src/sections/survey/survey-awaiting.tsx src/sections/survey/onboarding-scenarios-screen.tsx \
        src/sections/welcome/onboarding-step-cards.tsx src/sections/welcome/welcome-view.tsx \
        src/app/page.tsx
git commit -m "feat(welcome): new Welcome with two states and on-demand fullscreen Survey

- Welcome shows hero + 3 descriptive plates + 'Расскажите о себе' CTA when surveyStatus is not_started; compact hero + 'Запустить новый сценарий' when completed
- Survey moved out of pre-Welcome gate into new view.kind 'survey' (fullscreen — sidebar and bottom-bar hidden via AnimatePresence)
- Skip removed (no skippable prop, no survey_skipped action, no 'skipped' status)
- Plates lose 'Шаг N' labels, opacity-35, in-card CTA — purely decorative
- Survey copy aligned with spec (form, awaiting, scenarios)"
```

---

### Task 12: Manual smoke test (running dev server)

Цель: убедиться, что новые flow визуально и поведенчески работают как описано в спеке.

**Files:** dev-server, browser

- [ ] **Step 1: Убедиться, что dev-сервер запущен на :3000**

Если не запущен, использовать skill `start-dev-server`. Если пользователь работает в воркти, использовать port 3001 (`npm run dev -- -p 3001`).

- [ ] **Step 2: Чистый запуск — first-time welcome**

В браузере открыть `http://localhost:3000` (или `:3001`).

Проверить (ожидаемое):
- ✓ AppSidebar виден слева.
- ✓ ShellBottomBar виден внизу с плейсхолдером «Задайте вопрос…».
- ✓ Hero показывает h1 «Добро пожаловать в афина», два абзаца про сценарии (по §6.1 спеки).
- ✓ Три плашки «Сигналы / Кампании / Статистика» — без лейблов «Шаг N», без затемнения, все три равнозначно подсвечены, не кликаются.
- ✓ Под плашками — CTA-блок «Подберём сценарии под ваш бизнес» с кнопкой «Расскажите о себе».
- ✓ Содержимое выровнено по левому краю.

- [ ] **Step 3: Открыть survey по кнопке «Расскажите о себе»**

Кликнуть «Расскажите о себе».

Проверить:
- ✓ AppSidebar плавно уезжает влево (fade + slide-left, ~280ms).
- ✓ ShellBottomBar плавно уезжает вниз (fade + slide-down).
- ✓ Контент Welcome исчезает, появляется SurveyForm с заголовком «С чего начнём — дайте ссылку на ваш сайт».
- ✓ Кнопки «Пропустить» НЕТ — только «Продолжить».

- [ ] **Step 4: Пройти survey до конца**

Ввести `https://example.com` → «Продолжить» → дождаться `SurveyAwaiting` (новый заголовок «Изучаем ваш бизнес», состояние «Анализируем example.com…») → дождаться `OnboardingInterestsScreen` (тексты НЕ менялись) → выбрать интересы → «Продолжить» → дождаться `OnboardingScenariosScreen` (новый заголовок «Готово — подобрали N сценариев под ваш бизнес»).

Кликнуть «Выбрать сценарий →».

Проверить:
- ✓ Открывается `ScenarioCatalogModal` поверх survey.
- ✓ AppSidebar и BottomBar всё ещё скрыты (`view.kind` всё ещё `"survey"`).

- [ ] **Step 5: Выбрать сценарий в каталоге**

Кликнуть на любой сценарий в модалке.

Проверить:
- ✓ Модалка закрывается.
- ✓ View плавно переходит в `guided-signal` (wizard step 1).
- ✓ AppSidebar плавно появляется слева.
- ✓ ChatPanel (а не ShellBottomBar) появляется снизу — это нормально, у `guided-signal` свой нижний бар.
- ✓ Wizard step 1 рендерится без повторного запроса сайта.

- [ ] **Step 6: Вернуться на Welcome через сайдбар-логотип**

Кликнуть логотип «афина» в сайдбаре.

Проверить:
- ✓ Welcome рендерится в state «completed»: hero (h1 + один подзаголовок «Сценарии уже подобраны под ваш бизнес — запустите ещё один.») + кнопка «Запустить новый сценарий →».
- ✓ Плашек нет.
- ✓ Кнопка «Запустить новый сценарий» открывает wizard step 1 без survey.

- [ ] **Step 7: Edge case — отмена в каталоге**

`localStorage.clear()` + reload → пройти survey до экрана каталога → закрыть каталог (X или ESC).

Проверить:
- ✓ Срабатывает `catalog_close` для `returnTo === "onboarding"` → переход в Welcome.
- ✓ Welcome в state «completed» (поскольку `survey_completed` уже произошёл до `catalog_open`).
- ✓ AppSidebar и BottomBar плавно появляются.

- [ ] **Step 8: Edge case — чат на welcome**

`localStorage.clear()` + reload → на Welcome (not_started) ввести в промпт-бар «привет» → Enter.

Проверить:
- ✓ Hero + plates + CTA-блок исчезают (через `conversationStarted`), появляется чат-история.
- ✓ Поведение чата не сломано.

- [ ] **Step 9: Если есть регрессии — НЕ коммитить, разобраться**

Любая регрессия (визуальная или функциональная) — стоп, фикс, повторный smoke. После успешного smoke — переходим к Task 13.

---

### Task 13: Push branch and open PR

**Files:** git

- [ ] **Step 1: Убедиться, что все коммиты на feature-ветке**

Run: `git log --oneline main..HEAD`
Expected: один коммит из Task 11.

- [ ] **Step 2: Push ветки**

```bash
git push -u origin HEAD
```

- [ ] **Step 3: Создать PR**

```bash
gh pr create --title "Block 1 — Welcome screen and Survey entry point" --body "$(cat <<'EOF'
## Summary

- Welcome переезжает на новый контент: hero + 3 декоративные плашки (Сигналы / Кампании / Статистика, без лейблов «Шаг N» и затемнения) + CTA-блок «Расскажите о себе»
- Returning state Welcome (`surveyStatus === "completed"`): компактный hero + кнопка «Запустить новый сценарий →»
- Survey переезжает из «гейта перед Welcome» в полноценный fullscreen-режим (`view.kind: "survey"`) — открывается по кнопке «Расскажите о себе»
- Skip удалён полностью: нет prop `skippable`, нет action `survey_skipped`, нет значения `surveyStatus: "skipped"`

## Test plan

- [ ] Unit-тесты проходят (`npm test`)
- [ ] TypeScript без ошибок (`npx tsc --noEmit`)
- [ ] Manual smoke по сценариям из плана §12 (first-time welcome, открытие survey, прохождение до wizard, returning welcome, отмена в каталоге, чат на welcome)

Спека: `docs/superpowers/specs/2026-05-28-block-1-welcome-and-survey-entry-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Вернуть URL PR пользователю**

---

## Self-Review

**Spec coverage:**
- §5.1 Welcome two-state — Task 9 (plates) + Task 10 (welcome-view two-state hero + CTA). ✓
- §5.2 Survey fullscreen — Task 11 (page.tsx view "survey" + chrome AnimatePresence). ✓
- §5.3 State / event flow — Tasks 1-3 (types, reducer, tests). ✓
- §5.4 Переход Survey → Wizard — Task 11 (renderMain AnimatePresence + AppSidebar/BottomBarSlot enter). ✓
- §6 Тексты — Tasks 5, 7, 8, 9, 10 (form, awaiting, scenarios, plates, hero). ✓ Тексты `OnboardingInterestsScreen` намеренно не меняются (§6.3).
- §9 Acceptance criteria — Task 12 manual smoke покрывает 1-11. ✓
- §10 Риски: миграция localStorage — отметили, что AppState не персиститься, миграция не нужна.

**Placeholder scan:** Каждый step имеет либо точный код, либо точную команду с ожидаемым output. Нет «TBD», «implement later», «similar to».

**Type consistency:**
- `View` union с `{ kind: "survey" }` (Task 2) → используется в `renderMain()` (Task 11) — совпадает.
- `Action` с `{ type: "open_survey" }` (Task 2) → диспатчится в `WelcomeView` (Task 10) — совпадает.
- `SurveySection` props (Task 6) — без `skippable`/`onSkip` → page.tsx (Task 11) не передаёт — совпадает.
- `SurveyForm` props (Task 5) — без `skippable`/`onSkip` → `SurveySection` (Task 6) не передаёт — совпадает.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-28-block-1-welcome-and-survey-entry.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — диспатчу свежего сабагента под каждый task, ревью между шагами, быстрая итерация.

**2. Inline Execution** — выполняю шаги в этой сессии через executing-plans, батч-исполнение с чекпоинтами для ревью.

**Какой подход?**

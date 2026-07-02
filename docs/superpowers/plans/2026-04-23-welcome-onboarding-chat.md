# Welcome Onboarding Chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пересобрать WelcomeScreen так, чтобы PromptBar и его оболочка не растягивались на всю ширину, этапы онбординг-шагов ушли из PromptBar под текст приветствия (с новой подписью-плейсхолдером), а под PromptBar появились кликабельные подсказки, которые подставляются в инпут и сразу сабмитятся. Submit на welcome запускает скриптованный ответ (LLM позже).

**Architecture:** `ShellBottomBar` перестаёт рендериться на welcome; вся композиция welcome теперь внутри `WelcomeView`: заголовок → подпись → инлайновые Шаг 1/2/3 → узкий PromptBar в «обёртке» с маржой → чипы-подсказки. Подсказки и скриптованный чат активны только когда `signals.length === 0 && campaigns.length === 0` (эквивалент пресета `empty`). Скриптованный ответ переиспользует существующий state-slice `aiReply` и action-ы `ai_reply_shown` / `ai_reply_dismissed`. Шаг 1/2/3 остаются в `ShellBottomBar` на прочих view (в т.ч. `awaiting-campaign`, где клик по Шаг 2 — единственный способ продвинуться).

**Tech Stack:** Next.js 16.2.2, React 19, TypeScript, Tailwind v4, `motion/react`, существующий `@/components/ai-elements/prompt-input` с `PromptInputProvider`.

---

## Reuse audit

- `src/components/ai-elements/prompt-input.tsx` — `PromptInput`, `PromptInputBody`, `PromptInputTextarea`, `PromptInputFooter`, `PromptInputTools`, `PromptInputSubmit`, `PromptInputButton`, `usePromptInputController`. Используем как есть.
- `src/state/app-state.ts` — `isOnWelcome`, `isStep1Active`, `isStep2Active`, `isStep3Active`, `isCampaignDone`, action `start_signal_flow`, `ai_reply_shown`, `ai_reply_dismissed`. Никаких новых action-ов не нужно.
- `src/sections/shell/shell-bottom-bar.tsx` — `ShellBottomBar`. Из него убираем рендер на welcome и удаляем `isOnWelcome` ветку в `floatBottom` (сократится до двух состояний). Шаги 1/2/3 остаются для остальных view.
- `src/sections/campaigns/workflow-section.tsx:247-292` — паттерн бабла `aiReply` над PromptBar (иконка + текст + кнопка закрытия). Копируем стилистику локально в welcome.
- `tests/e2e/happy-path.spec.ts:10-11` — кликает `Шаг 1 · Получение сигнала` на welcome. После правок кнопка существует внутри `WelcomeView` с тем же текстом → e2e пройдёт без изменений, но подтвердим запуском.
- `tests/e2e/view-history.spec.ts` — проверяет только заголовок `Добро пожаловать`. Сохраняем.

---

## File structure

- Create: `src/sections/welcome/onboarding-steps.tsx` — панель из трёх бейджей Шаг 1 / 2 / 3 для welcome. Содержит только presentation + dispatcher, без state.
- Create: `src/sections/welcome/welcome-prompt.tsx` — узкая «оболочка» с маржой, `PromptInput`, чипы-подсказки, поповер скриптованного ответа. Единственный компонент, который на welcome взаимодействует с `PromptInputProvider`.
- Create: `src/sections/welcome/onboarding-scripts.ts` — плейсхолдер-массив чипов и скриптованных ответов (placeholder-контент, конкретику пользователь даст позже).
- Modify: `src/sections/welcome/welcome-view.tsx` — переписываем: заголовок, подзаголовок, подпись-плейсхолдер, `<OnboardingSteps />`, `<WelcomePrompt />`.
- Modify: `src/sections/welcome/welcome-section.tsx` — чистим props `onStep1Click` (больше не нужен — welcome-view сам диспатчит).
- Modify: `src/sections/shell/shell-bottom-bar.tsx` — early return `null` на welcome; убираем ветку `isOnWelcome(state) ? "40%" :` из `floatBottom`. Бейджи Шаг 1/2/3 остаются (нужны на `awaiting-campaign`).
- Modify (tests, if needed): `tests/e2e/happy-path.spec.ts` — подтверждаем, что селектор `Шаг 1 · Получение сигнала` по-прежнему матчится.

---

### Task 1: Hide ShellBottomBar on welcome

**Files:**
- Modify: `src/sections/shell/shell-bottom-bar.tsx`

- [ ] **Step 1: Добавить ранний возврат на welcome**

В `ShellBottomBar` сразу после инициализации `view` вставить:

```tsx
if (isOnWelcome(state)) return null;
```

Место — до `useLayoutEffect`, чтобы эффект высоты не регистрировался (иначе `--promptbar-height` останется от старого рендера). `useRef`/`useState` должны быть объявлены ДО `return null`, чтобы hooks-порядок не ломался — так что `return null` кладётся сразу после объявления `barRef` + последнего `useState`/`useEffect`. Конкретно: после блока `useLayoutEffect(() => { ... }, [view.kind]);` и до `return (...)`.

- [ ] **Step 2: Упростить floatBottom**

В текущем коде:

```tsx
const floatBottom = isOnWelcome(state) ? "40%" : pinnedToBottom ? "0%" : "3%";
```

Заменить на:

```tsx
const floatBottom = pinnedToBottom ? "0%" : "3%";
```

Ветка `isOnWelcome` больше никогда не сработает после Step 1, удаляем для чистоты.

- [ ] **Step 3: Убрать `--promptbar-height` при unmount на welcome**

Текущий cleanup в `useLayoutEffect` уже снимает переменную при unmount. Этого достаточно — возврат `null` в Step 1 приведёт к перерисовке без монтирования `barRef`, и cleanup предыдущего рендера отработает. Действия не требуются, но на всякий случай убедиться, что `useLayoutEffect` расположен ДО `return null`. Если после Step 1 это так — шаг no-op.

- [ ] **Step 4: dev-server smoke**

```bash
npm run dev
```

Открыть `http://localhost:3000` — на welcome не должно быть PromptBar-а в центре экрана. На `/` после клика `Сигналы` / `Кампании` (перешли через сайдбар) PromptBar всё ещё есть внизу.

Остановить сервер.

- [ ] **Step 5: Commit**

```bash
git add src/sections/shell/shell-bottom-bar.tsx
git commit -m "feat(welcome): hide ShellBottomBar on welcome view"
```

---

### Task 2: Onboarding steps panel

**Files:**
- Create: `src/sections/welcome/onboarding-steps.tsx`

- [ ] **Step 1: Создать компонент**

```tsx
"use client";

import { ChevronRight } from "lucide-react";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import {
  isStep1Active,
  isStep2Active,
  isStep3Active,
} from "@/state/app-state";
import { cn } from "@/lib/utils";

export function OnboardingSteps() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const items = [
    {
      n: 1,
      label: "Получение сигнала",
      active: isStep1Active(state),
      onClick: isStep1Active(state)
        ? () => dispatch({ type: "start_signal_flow" })
        : undefined,
    },
    {
      n: 2,
      label: "Запуск кампании",
      active: isStep2Active(state),
      onClick: undefined,
    },
    {
      n: 3,
      label: "Статистика кампании",
      active: isStep3Active(state),
      onClick: undefined,
    },
  ] as const;

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {items.map(({ n, label, active, onClick }) => (
        <button
          key={n}
          type="button"
          disabled={!active}
          onClick={onClick}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
            active
              ? onClick
                ? "cursor-pointer border-border bg-card hover:bg-accent"
                : "cursor-default border-border bg-card"
              : "cursor-not-allowed border-border/40 bg-card/40 opacity-35"
          )}
        >
          <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
            Шаг {n}
          </span>
          <div className="h-3 w-px shrink-0 bg-border" />
          <span className="text-sm font-medium text-foreground">{label}</span>
          {active && onClick && (
            <ChevronRight className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
        </button>
      ))}
    </div>
  );
}
```

Примечание: я намеренно НЕ портирую анимацию `stepTwoNew` (пульсирующий зелёный outline из `shell-bottom-bar.tsx:121-129`). Эта анимация срабатывает на `awaiting-campaign`, а на welcome этот view невозможен (view=welcome). DRY: не добавляем мёртвый код.

- [ ] **Step 2: Commit**

```bash
git add src/sections/welcome/onboarding-steps.tsx
git commit -m "feat(welcome): add onboarding-steps panel component"
```

---

### Task 3: Onboarding scripts placeholder

**Files:**
- Create: `src/sections/welcome/onboarding-scripts.ts`

- [ ] **Step 1: Создать плейсхолдер-данные**

```ts
/**
 * Плейсхолдер-контент для welcome-onboarding. Конкретные тексты подсказок и
 * скриптованных ответов пользователь задаст позже — пока это stub, чтобы
 * UI-сборка работала end-to-end.
 *
 * Когда появятся реальные данные: расширить `HINTS` до актуальных реплик
 * и дополнить `scriptReply()` детерминированной логикой (словарь prompt→reply
 * или lookup по вхождению ключевых слов).
 */

export type OnboardingHint = {
  id: string;
  label: string;
};

export const HINTS: OnboardingHint[] = [
  { id: "placeholder-1", label: "Как начать работу" },
  { id: "placeholder-2", label: "Что такое сигнал" },
  { id: "placeholder-3", label: "Как запустить кампанию" },
];

/**
 * Возвращает скриптованный ответ на произвольный пользовательский ввод.
 * Сейчас — универсальная плейсхолдер-реплика. Позже будет заменено на
 * конкретный роутинг (возможно, словарь prompt→reply).
 */
export function scriptReply(_userText: string): string {
  return "Ответ появится здесь — скриптованный путь на замену LLM (placeholder).";
}

export const CAPTION = "Вот что вы можете сделать в Афине (placeholder):";
```

- [ ] **Step 2: Commit**

```bash
git add src/sections/welcome/onboarding-scripts.ts
git commit -m "feat(welcome): add onboarding scripts placeholder"
```

---

### Task 4: Welcome prompt (input + hints + scripted reply)

**Files:**
- Create: `src/sections/welcome/welcome-prompt.tsx`

- [ ] **Step 1: Создать компонент**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sparkles, X } from "lucide-react";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import { HINTS, scriptReply } from "./onboarding-scripts";

function HintChips({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2 px-1">
      {HINTS.map((h) => (
        <button
          key={h.id}
          type="button"
          onClick={() => onPick(h.label)}
          className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {h.label}
        </button>
      ))}
    </div>
  );
}

export function WelcomePrompt() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const controller = usePromptInputController();

  // Чипы-подсказки показываем только когда оба коллекшна пустые —
  // совпадает с пресетом DevPanel "empty".
  const showHints =
    state.signals.length === 0 && state.campaigns.length === 0;

  // Очистить textarea при монтировании (входе на welcome). Страхует от
  // случая, когда пользователь что-то набрал на workflow, а потом кликнул
  // лого и вернулся на welcome — текст подтягивается из общего провайдера.
  const didClear = useRef(false);
  useEffect(() => {
    if (!didClear.current) {
      controller.textInput.clear();
      didClear.current = true;
    }
  }, [controller]);

  function runPrompt(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    dispatch({ type: "ai_reply_shown", text: scriptReply(trimmed) });
    controller.textInput.clear();
  }

  function handleSubmit(message: PromptInputMessage) {
    runPrompt(message.text ?? "");
  }

  function handleChipClick(label: string) {
    controller.textInput.setInput(label);
    // Сразу сабмитим — пользователь ждёт «одним кликом».
    runPrompt(label);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      <AnimatePresence>
        {state.aiReply && (
          <motion.div
            key="welcome-ai-reply"
            initial={{ y: 6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 6, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
            className="flex items-start gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-sm"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/80">
                AI
              </p>
              <p className="mt-0.5 text-sm text-foreground">{state.aiReply}</p>
            </div>
            <button
              type="button"
              aria-label="Закрыть ответ AI"
              onClick={() => dispatch({ type: "ai_reply_dismissed" })}
              className="rounded-md p-1 text-muted-foreground opacity-70 hover:bg-accent hover:text-foreground hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* «Оболочка» с маржой вокруг PromptInput (≈12px по горизонтали) */}
      <div className="px-3">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea placeholder="Задайте вопрос…" />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools />
            <PromptInputSubmit />
          </PromptInputFooter>
        </PromptInput>
      </div>

      {showHints && <HintChips onPick={handleChipClick} />}
    </div>
  );
}
```

Ключевые моменты:
1. Внешний контейнер `max-w-2xl mx-auto` — PromptBar не растягивается.
2. Обёртка `<div className="px-3">` — тот самый «оболочка шире, чем PromptInput». Даёт визуальный margin.
3. `HintChips` виден только при пустых коллекшнах.
4. На клик по чипу — `setInput` + немедленный `runPrompt` (не ждём сабмита).
5. AI-реплика рендерится в том же flex-колонке ВЫШЕ PromptInput (так ответ виден при появлении, и компонент сам полностью отвечает за welcome-чат).
6. `didClear` очищает textarea при входе на welcome один раз.

- [ ] **Step 2: Commit**

```bash
git add src/sections/welcome/welcome-prompt.tsx
git commit -m "feat(welcome): add welcome-prompt with scripted reply and hint chips"
```

---

### Task 5: Rewrite WelcomeView

**Files:**
- Modify: `src/sections/welcome/welcome-view.tsx`
- Modify: `src/sections/welcome/welcome-section.tsx`

- [ ] **Step 1: Переписать welcome-view.tsx**

Полный новый контент:

```tsx
"use client";

import { OnboardingSteps } from "./onboarding-steps";
import { WelcomePrompt } from "./welcome-prompt";
import { CAPTION } from "./onboarding-scripts";

export function WelcomeView() {
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 py-10">
      <div className="flex w-full max-w-3xl flex-col items-center gap-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Добро пожаловать</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Три шага до первой кампании —<br />
            начните с получения сигналов
          </p>
        </div>

        <div className="flex flex-col items-center gap-3">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/80">
            {CAPTION}
          </p>
          <OnboardingSteps />
        </div>

        <div className="w-full">
          <WelcomePrompt />
        </div>
      </div>
    </div>
  );
}
```

Notes:
- Heading `Добро пожаловать` сохранён — happy-path e2e и view-history e2e по нему матчатся.
- Удалён `pb-[350px]` (компенсация под бывший floating PromptBar на 40% — больше не нужна).
- Вертикальный gap-8 между блоками даёт «воздух» как на старой композиции.

- [ ] **Step 2: Упростить welcome-section.tsx**

```tsx
"use client";

import { WelcomeView } from "./welcome-view";

export function WelcomeSection() {
  return <WelcomeView />;
}
```

`useAppDispatch` / `onStep1Click` больше не нужны — диспатч теперь в `OnboardingSteps`.

- [ ] **Step 3: dev-server smoke**

```bash
npm run dev
```

Проверить на `http://localhost:3000`:
1. Заголовок `Добро пожаловать` виден, подзаголовок тоже.
2. Под подзаголовком — подпись placeholder + три бейджа Шаг 1/2/3 (Шаг 1 активен и кликабелен, 2/3 — disabled).
3. PromptBar узкий (max-w-2xl), отцентрирован, с горизонтальным отступом относительно своего контейнера.
4. Под PromptBar — три чипа-подсказки.
5. Клик по чипу → PromptBar очищается, над PromptBar всплывает бабл `AI: Ответ появится здесь…`.
6. Написать «test» в PromptBar + Enter → тот же бабл.
7. DevPanel (Cmd+Shift+D) → переключить на `mid` → чипы исчезают. Назад на `empty` → чипы появились.
8. Клик на Шаг 1 → ушли в guided-signal flow, PromptBar внизу экрана (ShellBottomBar снова видим).
9. Клик на лого → возврат на welcome, PromptBar опять узкий и по центру.

Остановить сервер.

- [ ] **Step 4: Commit**

```bash
git add src/sections/welcome/welcome-view.tsx src/sections/welcome/welcome-section.tsx
git commit -m "feat(welcome): restructure welcome into onboarding chat layout"
```

---

### Task 6: Verify e2e still passes

**Files:**
- Modify (if needed): `tests/e2e/happy-path.spec.ts`
- Modify (if needed): `tests/e2e/view-history.spec.ts`

- [ ] **Step 1: Прогнать оба spec-а**

```bash
npx playwright test tests/e2e/happy-path.spec.ts tests/e2e/view-history.spec.ts --reporter=list
```

Expected: оба зелёные. `Шаг 1 · Получение сигнала` селектор матчится по новому компоненту `OnboardingSteps`.

- [ ] **Step 2: Если красные — чинить селекторы, не контент**

Частые причины падения:
- `getByRole("heading", { name: "Добро пожаловать" })` — всё ещё матчится, т.к. `<h1>` есть в новом view.
- `getByRole("button", { name: /Шаг 1.*Получение сигнала/s })` — селектор такой же, button в `OnboardingSteps` имеет тот же aria-name.
- Если фокус/scroll сбивается — добавить `await page.waitForSelector` на новый `WelcomePrompt`.

- [ ] **Step 3: Прогнать unit-тесты для уверенности**

```bash
npm test -- --run
```

Expected: все 63+ unit-теста зелёные. Ничего из welcome-структуры тесты не покрывают, но изменения в `ShellBottomBar` не должны ломать существующие флоу.

- [ ] **Step 4 (no-op if green): Commit**

Если пришлось править тесты:

```bash
git add tests/e2e/
git commit -m "test: align e2e selectors with welcome onboarding layout"
```

---

## Self-review checklist (выполнено до сохранения плана)

**Spec coverage:**
- ✅ PromptBar не растягивается на всю ширину → Task 4, `max-w-2xl mx-auto`.
- ✅ Контейнер PromptBar не растягивается → Task 1 (ShellBottomBar скрыт на welcome), Task 4 (локальный контейнер).
- ✅ Шаги онбординга перенесены под текст приветствия → Task 2 + Task 5.
- ✅ Подпись «что можете сделать в Афине» → Task 3 (CAPTION) + Task 5.
- ✅ Оболочка PromptBar шире самого PromptBar (маржины) → Task 4, `<div className="px-3">` вокруг `PromptInput`.
- ✅ Кликабельные подсказки под PromptBar с auto-submit → Task 4, `HintChips` + `handleChipClick`.
- ✅ Welcome = мини-чат с заскриптованными ответами → Task 4, `scriptReply` + `ai_reply_shown`.
- ✅ Чипы/чат доступны только при пресете `empty` → Task 4, `showHints = signals.length === 0 && campaigns.length === 0`.
- ✅ Placeholder-контент (пользователь напишет позже) → Task 3, `onboarding-scripts.ts`.

**Placeholder scan:** TBD/TODO/«similar to» — нет. Все code steps содержат полный код.

**Type consistency:**
- `OnboardingHint` используется в `HINTS` и нигде больше.
- `scriptReply(text: string): string` — сигнатура единообразна.
- `WelcomePrompt` не экспортирует props — компонент self-contained.
- `WelcomeView` больше не принимает `onStep1Click` — совместно обновлены оба файла в Task 5.

Все пункты спеки из сообщения пользователя покрыты. `awaiting-campaign` flow не задеваем — `ShellBottomBar` + бейджи там остаются.

---

## Execution handoff

Plan complete. Two execution options:

**1. Subagent-Driven (recommended)** — я диспатчу свежего subagent на каждый Task, между ними — быстрый ревью.

**2. Inline Execution** — выполняю в этой же сессии через `superpowers:executing-plans`, с чекпоинтами.

**Which approach?**

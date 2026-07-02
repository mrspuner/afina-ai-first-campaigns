# FlowSignals Peek Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** В FlowSignals-визарде сделать так, чтобы соседние шаги «выглядывали» (peek) из-за границ вьюпорта, а юзер мог свободно скроллить и прыгать степпером между шагами без потери активного шага. Скролл — с magnetic snap к центру; стрепер показывает activeStep, но клики меняют focusedStep.

**Architecture:** Вводим понятие `focusedStep` (шаг, центрированный во вьюпорте) и отделяем его от `activeStep` (шаг, на котором юзер реально работает). Layout каждого шага меняется с `min-h-screen` на `min-h-[70vh]` с центрированным контентом, чтобы соседи peek'али по 15vh. Логика «какой шаг сейчас в фокусе» — в чистой функции `closestStepIndex`, обёрнутой в хук `useStepPeekNavigation` с magnetic snap (debounced timer 180ms). Стрепер принимает `activeStep` + `focusedStep`, визуально выделяет active, клик ставит focused. Возврат к activeStep — pill-кнопка снизу/сверху, появляющаяся, когда `focusedStep !== activeStep`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, motion v12 (`motion/react`), vitest для unit-тестов чистой функции и хука (jsdom + ручной мок ResizeObserver/scrollTo).

**Spec:** `docs/flowsignals-peek-navigation-prd.md`

**Reuse audit:**
- `CampaignWorkspace` (`src/sections/signals/campaign-workspace.tsx`) — основная точка модификации; там сейчас `currentStep` (= activeStep по семантике), `maxStep`, `scrollToStep`, layout шагов.
- `CampaignStepper` (`src/sections/signals/campaign-stepper.tsx`) — переиспользуем, добавим вторую цепочку состояний; визуал точек/линий не трогаем.
- `StepContent` (`src/sections/signals/steps/step-content.tsx`) — НЕ трогаем, верстка шагов остаётся.
- `motion` — есть уже для page-entrance staggered reveal; используем `animate(scrollContainer, { scrollTop }, { ease, duration })` или нативный `scrollTo({behavior:"smooth"})` (motion v12 `animate` поддерживает scroll). Решение в Task 4.
- Existing hook `useTypewriter` — пример паттерна хуков; на него опираемся стилистически.

**Терминология (PRD ↔ код):**
| PRD | Код (после рефакторинга) |
|---|---|
| activeStep | `activeStep` (раньше `currentStep`) |
| focusedStep | `focusedStep` |
| maxStep | `maxStep` (без изменений) |

---

## Task 1: Pure helper `closestStepIndex`

**Files:**
- Create: `src/sections/signals/peek-navigation/closest-step.ts`
- Create: `src/sections/signals/peek-navigation/closest-step.test.ts`

Чистая функция: «дай ближайший к центру вьюпорта шаг по списку центров». Проверяется юнит-тестами без DOM.

- [ ] **Step 1: Write the failing test**

```ts
// src/sections/signals/peek-navigation/closest-step.test.ts
import { describe, it, expect } from "vitest";
import { closestStepIndex } from "./closest-step";

describe("closestStepIndex", () => {
  it("picks the step whose center is closest to viewport center", () => {
    // step centers: 0, 700, 1400 (px from scroll container top)
    // viewport center within container: 720 → step at 700 (index 1) wins
    expect(closestStepIndex([0, 700, 1400], 720)).toBe(1);
  });

  it("ties go to the lower-index step (deterministic)", () => {
    expect(closestStepIndex([0, 700, 1400], 350)).toBe(0);
  });

  it("returns 0 for empty input via clamp (defensive)", () => {
    expect(closestStepIndex([], 100)).toBe(0);
  });

  it("clamps to last when viewport center is past all steps", () => {
    expect(closestStepIndex([0, 700, 1400], 99999)).toBe(2);
  });

  it("clamps to first when viewport center is above all steps", () => {
    expect(closestStepIndex([0, 700, 1400], -500)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sections/signals/peek-navigation/closest-step.test.ts`
Expected: FAIL with "Cannot find module './closest-step'".

- [ ] **Step 3: Implement helper**

```ts
// src/sections/signals/peek-navigation/closest-step.ts
/**
 * Given a list of step centers (Y-coordinates relative to the scroll
 * container) and the current viewport center (also relative), returns the
 * index of the step whose center is closest to the viewport center. Ties
 * resolve to the lower index for determinism. Returns 0 for empty input.
 */
export function closestStepIndex(
  stepCenters: readonly number[],
  viewportCenter: number,
): number {
  if (stepCenters.length === 0) return 0;
  let best = 0;
  let bestDist = Math.abs(stepCenters[0] - viewportCenter);
  for (let i = 1; i < stepCenters.length; i++) {
    const d = Math.abs(stepCenters[i] - viewportCenter);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/sections/signals/peek-navigation/closest-step.test.ts`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/sections/signals/peek-navigation/closest-step.ts src/sections/signals/peek-navigation/closest-step.test.ts
git commit -m "feat(signals): add closestStepIndex helper for peek navigation"
```

---

## Task 2: Hook `useStepPeekNavigation`

**Files:**
- Create: `src/sections/signals/peek-navigation/use-step-peek-navigation.ts`
- Create: `src/sections/signals/peek-navigation/use-step-peek-navigation.test.ts`

Хук, который слушает скролл контейнера, считает focusedStep и debounce'ит magnetic-snap к центру.

API:
```ts
useStepPeekNavigation({
  containerRef,        // RefObject<HTMLDivElement | null>
  stepRefs,            // RefObject<Record<number, HTMLDivElement | null>>
  steps,               // number[] — список шагов в порядке отрисовки (e.g. [1,2,3,4])
  snapDelayMs,         // default 180
  enabled,             // default true (выключаем во время программного scrollTo)
}): {
  focusedStep: number;
  scrollToStep: (step: number, opts?: { smooth?: boolean }) => void;
}
```

Логика:
- При scroll-событии: считаем `viewportCenter = container.scrollTop + container.clientHeight / 2`. Считаем center каждого step через `el.offsetTop + el.offsetHeight / 2`. Зовём `closestStepIndex(...)`, обновляем `focusedStep`.
- При scroll-событии: ресетим debounce-таймер на `snapDelayMs`. По таймауту: программно скроллим контейнер так, чтобы центр focusedStep попал в центр вьюпорта. На время программного скролла отключаем обработчик (флаг `isProgrammaticScrollRef`), чтобы не зациклиться.
- Если высота шага > clientHeight контейнера, **snap НЕ срабатывает** (пользователь скроллит внутри карточки) — просто обновляем focusedStep.

- [ ] **Step 1: Write the failing test**

```ts
// src/sections/signals/peek-navigation/use-step-peek-navigation.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRef } from "react";
import { useStepPeekNavigation } from "./use-step-peek-navigation";

function makeStepEl(top: number, height: number): HTMLDivElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "offsetTop", { value: top, configurable: true });
  Object.defineProperty(el, "offsetHeight", { value: height, configurable: true });
  return el;
}

function makeContainer(clientHeight: number): HTMLDivElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
  let _scrollTop = 0;
  Object.defineProperty(el, "scrollTop", {
    get: () => _scrollTop,
    set: (v: number) => { _scrollTop = v; },
    configurable: true,
  });
  // jsdom doesn't impl scrollTo
  el.scrollTo = vi.fn(({ top }: { top: number }) => {
    _scrollTop = top;
    el.dispatchEvent(new Event("scroll"));
  }) as unknown as Element["scrollTo"];
  return el;
}

describe("useStepPeekNavigation", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("focuses the step closest to viewport center on scroll", () => {
    const container = makeContainer(700);
    const stepEls = {
      1: makeStepEl(0, 500),
      2: makeStepEl(500, 500),
      3: makeStepEl(1000, 500),
    };

    const { result } = renderHook(() => {
      const containerRef = useRef(container);
      const stepRefs = useRef(stepEls);
      return useStepPeekNavigation({
        containerRef,
        stepRefs,
        steps: [1, 2, 3],
      });
    });

    expect(result.current.focusedStep).toBe(1);

    act(() => {
      container.scrollTop = 600; // viewport center = 600 + 350 = 950 → step 2 center 750
                                 //                                       step 3 center 1250
                                 //                                       closest: step 2
      container.dispatchEvent(new Event("scroll"));
    });

    expect(result.current.focusedStep).toBe(2);
  });

  it("snaps to focused step center after debounce", () => {
    const container = makeContainer(700);
    const stepEls = {
      1: makeStepEl(0, 400),
      2: makeStepEl(400, 400),
    };

    renderHook(() => {
      const containerRef = useRef(container);
      const stepRefs = useRef(stepEls);
      return useStepPeekNavigation({
        containerRef,
        stepRefs,
        steps: [1, 2],
        snapDelayMs: 180,
      });
    });

    act(() => {
      container.scrollTop = 250; // viewport center = 600 → step 2 center = 600 → already snapped
      container.dispatchEvent(new Event("scroll"));
    });

    act(() => {
      vi.advanceTimersByTime(180);
    });

    // Step 2 center = 600. To put 600 at viewport center (clientHeight/2 = 350):
    // scrollTop should become 600 - 350 = 250. Already 250, no movement (idempotent).
    expect(container.scrollTop).toBe(250);
  });

  it("scrollToStep centers the step", () => {
    const container = makeContainer(700);
    const stepEls = {
      1: makeStepEl(0, 400),
      2: makeStepEl(400, 400),
      3: makeStepEl(800, 400),
    };

    const { result } = renderHook(() => {
      const containerRef = useRef(container);
      const stepRefs = useRef(stepEls);
      return useStepPeekNavigation({
        containerRef,
        stepRefs,
        steps: [1, 2, 3],
      });
    });

    act(() => {
      result.current.scrollToStep(3, { smooth: false });
    });

    // step 3 center = 1000; scrollTop should be 1000 - 350 = 650
    expect(container.scrollTop).toBe(650);
    expect(result.current.focusedStep).toBe(3);
  });

  it("does NOT snap when focused step is taller than container", () => {
    const container = makeContainer(500);
    const stepEls = {
      1: makeStepEl(0, 1200), // taller than container
      2: makeStepEl(1200, 400),
    };

    renderHook(() => {
      const containerRef = useRef(container);
      const stepRefs = useRef(stepEls);
      return useStepPeekNavigation({
        containerRef,
        stepRefs,
        steps: [1, 2],
      });
    });

    act(() => {
      container.scrollTop = 100; // mid-scroll inside step 1
      container.dispatchEvent(new Event("scroll"));
    });

    const before = container.scrollTop;
    act(() => { vi.advanceTimersByTime(500); });
    expect(container.scrollTop).toBe(before); // no snap kicked in
  });
});
```

- [ ] **Step 2: Add @testing-library/react if missing**

Run: `node -e "console.log(require('@testing-library/react/package.json').version)"` — if it errors, install it:

```bash
npm install --save-dev @testing-library/react
```

If already present, skip.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/sections/signals/peek-navigation/use-step-peek-navigation.test.ts`
Expected: FAIL with "Cannot find module './use-step-peek-navigation'".

- [ ] **Step 4: Implement hook**

```ts
// src/sections/signals/peek-navigation/use-step-peek-navigation.ts
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { closestStepIndex } from "./closest-step";

interface UseStepPeekNavigationParams {
  containerRef: RefObject<HTMLDivElement | null>;
  stepRefs: RefObject<Record<number, HTMLDivElement | null>>;
  steps: number[];
  /** Debounce window after the last scroll event before snap fires. */
  snapDelayMs?: number;
  /** When false, hook does nothing — used to suspend during programmatic
   * navigation (e.g. external scrollIntoView during step-1 → step-2). */
  enabled?: boolean;
}

interface UseStepPeekNavigationResult {
  focusedStep: number;
  scrollToStep: (step: number, opts?: { smooth?: boolean }) => void;
}

export function useStepPeekNavigation({
  containerRef,
  stepRefs,
  steps,
  snapDelayMs = 180,
  enabled = true,
}: UseStepPeekNavigationParams): UseStepPeekNavigationResult {
  const [focusedStep, setFocusedStep] = useState(steps[0] ?? 1);

  const snapTimerRef = useRef<number | null>(null);
  const isProgrammaticRef = useRef(false);
  const focusedStepRef = useRef(focusedStep);
  focusedStepRef.current = focusedStep;

  // Keep latest steps array in a ref so the persistent scroll listener
  // always sees the current list without needing to re-attach.
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const measure = useCallback((): {
    centers: number[];
    viewportCenter: number;
    focusedHeight: number;
    containerHeight: number;
  } => {
    const container = containerRef.current;
    if (!container) {
      return { centers: [], viewportCenter: 0, focusedHeight: 0, containerHeight: 0 };
    }
    const centers: number[] = [];
    const heights: number[] = [];
    for (const step of stepsRef.current) {
      const el = stepRefs.current?.[step];
      if (!el) {
        centers.push(0);
        heights.push(0);
        continue;
      }
      centers.push(el.offsetTop + el.offsetHeight / 2);
      heights.push(el.offsetHeight);
    }
    const viewportCenter = container.scrollTop + container.clientHeight / 2;
    const idx = closestStepIndex(centers, viewportCenter);
    return {
      centers,
      viewportCenter,
      focusedHeight: heights[idx] ?? 0,
      containerHeight: container.clientHeight,
    };
  }, [containerRef, stepRefs]);

  const scrollToStep = useCallback(
    (step: number, opts?: { smooth?: boolean }) => {
      const container = containerRef.current;
      const el = stepRefs.current?.[step];
      if (!container || !el) return;
      const target = el.offsetTop + el.offsetHeight / 2 - container.clientHeight / 2;
      isProgrammaticRef.current = true;
      container.scrollTo({
        top: Math.max(0, target),
        behavior: opts?.smooth === false ? "auto" : "smooth",
      });
      // Reset the flag after the smooth scroll has had a chance to settle.
      // 360ms ≈ 2× snap delay — generous but bounded.
      window.setTimeout(() => {
        isProgrammaticRef.current = false;
      }, 360);
      setFocusedStep(step);
    },
    [containerRef, stepRefs],
  );

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    function clearSnap() {
      if (snapTimerRef.current != null) {
        window.clearTimeout(snapTimerRef.current);
        snapTimerRef.current = null;
      }
    }

    function onScroll() {
      if (isProgrammaticRef.current) return;

      const { centers, viewportCenter, focusedHeight, containerHeight } = measure();
      const idx = closestStepIndex(centers, viewportCenter);
      const step = stepsRef.current[idx] ?? stepsRef.current[0] ?? 1;
      if (step !== focusedStepRef.current) {
        setFocusedStep(step);
      }

      // Don't snap if the focused step is taller than the container — user
      // is scrolling inside it.
      if (focusedHeight > containerHeight) {
        clearSnap();
        return;
      }

      clearSnap();
      snapTimerRef.current = window.setTimeout(() => {
        const c = containerRef.current;
        const el = stepRefs.current?.[step];
        if (!c || !el) return;
        const target = el.offsetTop + el.offsetHeight / 2 - c.clientHeight / 2;
        if (Math.abs(c.scrollTop - target) < 1) return; // already snapped
        isProgrammaticRef.current = true;
        c.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
        window.setTimeout(() => {
          isProgrammaticRef.current = false;
        }, 360);
      }, snapDelayMs);
    }

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      clearSnap();
    };
  }, [containerRef, stepRefs, measure, snapDelayMs, enabled]);

  return { focusedStep, scrollToStep };
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/sections/signals/peek-navigation/use-step-peek-navigation.test.ts`
Expected: PASS, all 4 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/sections/signals/peek-navigation/use-step-peek-navigation.ts src/sections/signals/peek-navigation/use-step-peek-navigation.test.ts
git commit -m "feat(signals): add useStepPeekNavigation hook with magnetic snap"
```

---

## Task 3: Restructure `CampaignWorkspace` layout for peek visibility

**Files:**
- Modify: `src/sections/signals/campaign-workspace.tsx`

Что меняем:
1. Каждый шаг был `min-h-screen` → меняем на `min-h-[70vh]` с центрированным контентом. Это даёт ~15vh peek сверху и снизу для соседних шагов.
2. Скролл-контейнер получает `pt-[15vh] pb-[15vh]`, чтобы первый/последний шаг тоже центровались (без этих отступов виден край контейнера, не peek).
3. Скролл-контейнер получает явный `ref` (`scrollContainerRef`) — нужен Task 4 для хука.

На этом этапе focusedStep НЕ вводим — только меняем layout, чтобы убедиться, что верстка не сломалась и шаги визуально центруются с peek соседей.

- [ ] **Step 1: Add `scrollContainerRef` and update layout classes**

В `WorkspaceInner` (после `stepRefs`):

```tsx
const scrollContainerRef = useRef<HTMLDivElement | null>(null);
```

Заменяем блок начиная с `<div className="flex flex-1 flex-col overflow-y-auto">` (строка 235):

```tsx
{/* Scrollable step column. py-[15vh] gives the first and last steps room
 *  to center within the viewport so their neighbors can peek. */}
<div
  ref={scrollContainerRef}
  className="flex flex-1 flex-col overflow-y-auto py-[15vh]"
>
  {visibleSteps.map((step) => (
    <motion.div
      key={step}
      ref={(el) => { stepRefs.current[step] = el; }}
      initial={step === animatingStep ? { y: 60, opacity: 0 } : false}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex min-h-[70vh] flex-col items-center justify-center px-8"
    >
      {renderStepContent(step)}
    </motion.div>
  ))}
</div>
```

(Убрали `pb-40 pt-10 min-h-screen`, добавили `min-h-[70vh]` и контейнерный `py-[15vh]`. `pb-40 pt-10` больше не нужен, потому что floating input clearance добивается тем, что шаг центрирован в 70vh, а сверху/снизу 15vh пустоты.)

- [ ] **Step 2: Adjust `scrollToStep` to operate on the ref'd container**

Существующая функция:
```tsx
function scrollToStep(step: number, behavior: ScrollBehavior = "smooth") {
  stepRefs.current[step]?.scrollIntoView({ behavior, block: "start" });
}
```

Меняем `block: "start"` на `block: "center"`, чтобы первый раз страница приземлялась в peek-режиме:

```tsx
function scrollToStep(step: number, behavior: ScrollBehavior = "smooth") {
  stepRefs.current[step]?.scrollIntoView({ behavior, block: "center" });
}
```

- [ ] **Step 3: Verify dev server**

Run dev server (kill port 3000 first if needed):
```bash
lsof -ti:3000 | xargs -r kill -9
npm run dev &
```

Then in a browser, navigate to a guided-signal flow and:
- Visually confirm each step's content is vertically centered.
- After advancing past step 2, scroll up — top 15% of step N−1 should peek above step N.
- Scroll down — bottom 15% of step N+1 should peek.
- Confirm no double-scrollbar appears (only the workspace column scrolls).

If scrollbars/overlap break, the most likely culprit is `pb-40 pt-10` removal interacting with floating prompt-bar — re-add `pb-32` to inner motion.div if needed for that specific case, document why.

- [ ] **Step 4: Commit**

```bash
git add src/sections/signals/campaign-workspace.tsx
git commit -m "feat(signals): restructure step layout for peek visibility"
```

---

## Task 4: Wire `useStepPeekNavigation` into `CampaignWorkspace`

**Files:**
- Modify: `src/sections/signals/campaign-workspace.tsx`

Вводим `focusedStep` и переименовываем `currentStep` → `activeStep` для соответствия PRD-терминологии.

- [ ] **Step 1: Rename `currentStep` → `activeStep` (mechanical)**

В `WorkspaceInner` заменяем все вхождения `currentStep` на `activeStep` (включая `setCurrentStep` → `setActiveStep`). Обновляем имена в callback-ах: `handleNext`, `handleStepperClick`, `handleGoToStep`, `handleLaunchNew` и т.д. Файл должен компилироваться без логических изменений.

После замены — прогоняем lint и существующие тесты:
```bash
npm run lint
npx vitest run
```
Expected: PASS.

- [ ] **Step 2: Add `focusedStep` via the hook**

В импорты добавить:
```tsx
import { useStepPeekNavigation } from "@/sections/signals/peek-navigation/use-step-peek-navigation";
```

После объявления `scrollContainerRef`:

```tsx
const { focusedStep, scrollToStep: peekScrollToStep } = useStepPeekNavigation({
  containerRef: scrollContainerRef,
  stepRefs,
  steps: visibleSteps,
  // Disable peek-driven snap for terminal stages where the user must
  // commit to one step (processing has its own animation; result has CTAs
  // we don't want skipped past).
  enabled: activeStep < 7,
});
```

⚠️ Важно: `visibleSteps` объявлен ниже в файле — переместить его объявление **до** этого вызова, чтобы хук получал актуальный список шагов.

- [ ] **Step 3: Replace internal `scrollToStep` with the hook's `peekScrollToStep`**

Удалить локальную функцию `scrollToStep` (теперь дублирует хук). Заменить все вызовы `scrollToStep(step, behavior)` на `peekScrollToStep(step, { smooth: behavior !== "instant" })`. Учесть оба места (`useEffect` пост-коммит и `pendingScroll` в callback-ах).

В `useEffect` пост-коммит-скролла:

```tsx
useEffect(() => {
  if (!pendingScroll.current) return;
  const { step, behavior } = pendingScroll.current;
  pendingScroll.current = null;
  peekScrollToStep(step, { smooth: behavior !== "instant" });
});
```

- [ ] **Step 4: Visual smoke check**

Run dev server, walk wizard step 1 → 6:
- Каждый «Далее» должен плавно центрировать следующий шаг (smooth scroll).
- При свободном скролле колесом focusedStep должен меняться по мере прохождения центра.
- Через 180 мс после остановки скролла — magnetic snap к ближайшему шагу.
- Активный шаг (последний пройденный) остаётся неизменным при скролле — степпер пока не реагирует на focusedStep (это Task 5).

- [ ] **Step 5: Commit**

```bash
git add src/sections/signals/campaign-workspace.tsx
git commit -m "feat(signals): wire peek navigation into wizard workspace"
```

---

## Task 5: Update `CampaignStepper` to distinguish active vs focused

**Files:**
- Modify: `src/sections/signals/campaign-stepper.tsx`
- Modify: `src/sections/signals/campaign-workspace.tsx` (передача props)

PRD: степпер показывает activeStep как «выделен жёлтым/brand», focusedStep — как «лёгкий outline» (визуально отделим, но не доминирует). Клик по visited-шагу меняет focusedStep, а не activeStep.

- [ ] **Step 1: Extend `CampaignStepperProps`**

```tsx
interface CampaignStepperProps {
  activeStep: number;     // brand-highlighted
  focusedStep: number;    // outline ring (separate from active)
  maxStep: number;
  onStepClick: (step: number) => void;
  disabled?: boolean;
}
```

- [ ] **Step 2: Update visual mapping**

Заменить вычисление `isActive` и стилей кружка/лейбла:

```tsx
const isActive = step === activeStep;
const isFocused = step === focusedStep;
const isVisited = step <= maxStep;
const isCompleted = isVisited && !isActive;
const isPending = step > maxStep;
const isClickable = isVisited && !disabled;
```

В стилях кружка добавить состояние focused (без active):

```tsx
className={cn(
  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium transition-colors duration-200 ease-out",
  isCompleted && !isFocused &&
    "border-primary bg-primary text-primary-foreground",
  isCompleted && isFocused && !isActive &&
    "border-primary bg-primary text-primary-foreground ring-2 ring-foreground/30",
  isActive &&
    "border-brand bg-brand text-brand-foreground ring-2 ring-brand/25",
  isPending && "border-border bg-background text-muted-foreground"
)}
```

В лейбле — focused-but-not-active получает чуть более яркий цвет, но не bold:

```tsx
className={cn(
  "py-1 text-xs transition-colors duration-200 ease-out",
  isActive && "font-medium text-foreground",
  isFocused && !isActive && "text-foreground",
  isClickable
    ? "cursor-pointer text-foreground hover:text-primary"
    : "cursor-default",
  isPending && "text-muted-foreground"
)}
```

⚠️ Логика клика: PRD говорит «Клик по любому пройденному шагу = focusedStep становится этим шагом, activeStep НЕ меняется». Текущий обработчик в `campaign-workspace.tsx` (`handleStepperClick`) меняет `currentStep` (= activeStep). Это меняем в Step 4.

Удалить условие `isClickable = isVisited && !isActive && !disabled` → сделать `isClickable = isVisited && !disabled` (в active кликнуть тоже можно — это просто скролл к нему, безопасно).

- [ ] **Step 3: Update workspace to pass new props**

В `campaign-workspace.tsx` заменить блок `<CampaignStepper ...>`:

```tsx
<CampaignStepper
  activeStep={activeStep}
  focusedStep={focusedStep}
  maxStep={maxStep}
  onStepClick={handleStepperClick}
  disabled={activeStep === 7}
/>
```

- [ ] **Step 4: Update `handleStepperClick` semantics**

Раньше:
```tsx
const handleStepperClick = useCallback((step: number) => {
  setAnimatingStep(null);
  setActiveStep(step);
  pendingScroll.current = { step, behavior: "instant" };
}, []);
```

Меняем на: смещаем focusedStep (через peekScrollToStep), activeStep не трогаем:

```tsx
const handleStepperClick = useCallback((step: number) => {
  setAnimatingStep(null);
  peekScrollToStep(step, { smooth: true });
}, [peekScrollToStep]);
```

- [ ] **Step 5: Visual smoke check**

В dev-сервере:
- Открыть визард, дойти до шага 4 — степпер выделяет шаг 4 жёлтым (active).
- Кликнуть по шагу 2 в степпере — плавный скролл, шаг 2 центрируется. Степпер: шаг 4 остался жёлтым (active), шаг 2 получил light ring (focused).
- Скроллить колесом вверх до шага 1 — focused индикатор перепрыгивает на 1, active по-прежнему 4.
- Когда focused === active (например, скролл назад к 4) — кружок шага 4 показывает только active-стиль (без двойного ring).

- [ ] **Step 6: Commit**

```bash
git add src/sections/signals/campaign-stepper.tsx src/sections/signals/campaign-workspace.tsx
git commit -m "feat(signals): split stepper highlight into active + focused states"
```

---

## Task 6: Decouple stepData edits from focused-but-not-active step

**Files:**
- Modify: `src/sections/signals/campaign-workspace.tsx`

PRD edge-case 4: «Если focusedStep ≠ activeStep и шаг разрешает редактирование — изменения сохраняются, activeStep остаётся прежним. Если шаг недоступен (вперёд от activeStep) — read-only».

В текущем коде шаги вперёд от maxStep вообще не рендерятся (`visibleSteps = 1..maxStep`). Это совпадает с «недоступен → не показываем». То есть focused может быть только в диапазоне `[1..maxStep]`, шаги вперёд от activeStep видеть нельзя — соответствует PRD.

Что нужно проверить: `handleNext` сейчас при `currentStep < maxStep` прыгает к `maxStep`. После рефакторинга, когда `activeStep === maxStep` всегда (мы не понижаем activeStep при скролле), эта ветка срабатывает только если шаг назад заполняется и пользователь нажимает «Далее». Поведение: остаться на activeStep (не двигать), просто скроллнуть к activeStep.

- [ ] **Step 1: Re-read `handleNext` and verify semantics**

Текущая ветка:
```tsx
if (activeStep < maxStep) {
  setAnimatingStep(null);
  setActiveStep(maxStep);
  pendingScroll.current = { step: maxStep, behavior: "smooth" };
  return;
}
```

Здесь `activeStep` — это переименованный currentStep. Но после Task 4 activeStep больше не меняется при скролле/клике в степпере — он двигается **только** через `handleNext` или `handleLaunchFromSummary`. Значит, ветка `activeStep < maxStep` теперь **никогда** не срабатывает (при наших условиях activeStep всегда === maxStep).

Решение: при сохранении изменений с focusedStep < activeStep:
- patch'им stepData
- НЕ двигаем activeStep
- скроллим к activeStep (возвращаем фокус юзеру на «текущий рабочий шаг»)

Замена:

```tsx
const handleNext = useCallback(
  (partial: Partial<StepData>) => {
    const scenarioChanged =
      partial.scenario !== undefined &&
      partial.scenario !== stepData.scenario;

    if (scenarioChanged) {
      setStepData({ ...initialStepData, ...partial });
      const next = activeStep + 1;
      setMaxStep(next);
      setAnimatingStep(next);
      setActiveStep(next);
      pendingScroll.current = { step: next, behavior: "smooth" };
      return;
    }

    setStepData((prev) => ({ ...prev, ...partial }));

    // Edit on a focused-but-not-active step: persist changes but stay on
    // activeStep — user keeps their place in the linear flow.
    if (focusedStep !== activeStep) {
      pendingScroll.current = { step: activeStep, behavior: "smooth" };
      return;
    }

    const next = activeStep + 1;
    advanceTo(next);
  },
  [activeStep, advanceTo, focusedStep, stepData.scenario],
);
```

Удалить старую ветку `if (activeStep < maxStep)`.

- [ ] **Step 2: Auto-sync focusedStep to new activeStep on advance**

PRD: «При завершении activeStep автоматически: focusedStep синхронизируется с новым activeStep (плавный скролл к нему)».

`advanceTo` уже ставит `pendingScroll.current = { step: next, behavior: "smooth" }`, и пост-коммит-эффект зовёт `peekScrollToStep`, который ставит focusedStep. Поведение OK — проверяем визуально.

- [ ] **Step 3: Visual smoke check**

В dev-сервере:
- Дойти до шага 4 (activeStep = 4).
- Кликнуть степпер на шаг 2 → focusedStep = 2.
- На шаге 2 поправить интересы и нажать «Далее» внутри Step2 — изменения должны сохраниться (в том числе в URL/state), фокус плавно вернуться на шаг 4.
- Шаг 4 заполнить → нажать «Далее» → activeStep становится 5, focusedStep тоже плавно перескакивает на 5.

- [ ] **Step 4: Commit**

```bash
git add src/sections/signals/campaign-workspace.tsx
git commit -m "feat(signals): edit-in-focused-step keeps active step pinned"
```

---

## Task 7: «Return to active step» pill

**Files:**
- Create: `src/sections/signals/peek-navigation/return-to-active-pill.tsx`
- Modify: `src/sections/signals/campaign-workspace.tsx`

PRD open question 3: «Что если activeStep вне вьюпорта надолго? Нужен ли pill ↓ вернуться к шагу 4». Ответ — да, делаем минимальный pill, появляется когда `focusedStep !== activeStep`.

- [ ] **Step 1: Create the pill component**

```tsx
// src/sections/signals/peek-navigation/return-to-active-pill.tsx
"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";

interface ReturnToActivePillProps {
  /** True when focusedStep differs from activeStep — pill is visible. */
  visible: boolean;
  /** Negative = active is above focused, positive = below. */
  direction: "up" | "down";
  activeStep: number;
  onClick: () => void;
}

const STEP_LABELS: Record<number, string> = {
  1: "сценарий",
  2: "интересы",
  3: "сегменты",
  4: "база",
  5: "бюджет",
  6: "сводка",
  7: "обработка",
  8: "результат",
};

export function ReturnToActivePill({
  visible,
  direction,
  activeStep,
  onClick,
}: ReturnToActivePillProps) {
  const Icon = direction === "up" ? ArrowUp : ArrowDown;
  const label = STEP_LABELS[activeStep] ?? `шаг ${activeStep}`;
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: direction === "down" ? 12 : -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: direction === "down" ? 12 : -12 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className={
            direction === "down"
              ? "pointer-events-none absolute bottom-24 left-1/2 z-20 -translate-x-1/2"
              : "pointer-events-none absolute top-20 left-1/2 z-20 -translate-x-1/2"
          }
        >
          <Button
            size="sm"
            variant="outline"
            onClick={onClick}
            className="pointer-events-auto rounded-full bg-background/90 backdrop-blur-sm shadow-sm"
          >
            <Icon className="mr-1.5 h-3.5 w-3.5" />
            Вернуться к шагу {activeStep} · {label}
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Mount in workspace**

В `campaign-workspace.tsx` импорт:
```tsx
import { ReturnToActivePill } from "@/sections/signals/peek-navigation/return-to-active-pill";
```

В JSX, внутри корневого `<div>` с `relative flex flex-1 ...`, добавить (после `<CampaignStepper>` блока):

```tsx
<ReturnToActivePill
  visible={focusedStep !== activeStep}
  direction={focusedStep < activeStep ? "down" : "up"}
  activeStep={activeStep}
  onClick={() => peekScrollToStep(activeStep, { smooth: true })}
/>
```

- [ ] **Step 3: Visual smoke check**

- На шаге 4 кликнуть в степпере шаг 2 → пилл появляется снизу с текстом «Вернуться к шагу 4 · бюджет», стрелка ↓.
- На шаге 4 проскроллить вниз за пределы (если будут другие шаги после active — например, если допустим maxStep=4, то нет), иначе оставляем только down. Кейс up может не сработать в текущей сборке — это OK, направление up задействуется когда maxStep > activeStep, что не возникает (мы не показываем шаги вперёд activeStep).
  - Проверить: пилл ↑ должен исчезнуть при scroll к activeStep (focusedStep === activeStep после snap).

⚠️ Поскольку `visibleSteps` всегда [1..maxStep] и activeStep === maxStep — focusedStep всегда ≤ activeStep. Значит, направление пилла всегда `down`. Уберём `up`-ветку:

В JSX упростить:
```tsx
<ReturnToActivePill
  visible={focusedStep !== activeStep}
  direction="down"
  activeStep={activeStep}
  onClick={() => peekScrollToStep(activeStep, { smooth: true })}
/>
```

И в `ReturnToActivePill` убрать prop `direction`, оставить только `down`-вариант. Перепиши компонент короче:

```tsx
// src/sections/signals/peek-navigation/return-to-active-pill.tsx
"use client";

import { ArrowDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";

interface ReturnToActivePillProps {
  visible: boolean;
  activeStep: number;
  onClick: () => void;
}

const STEP_LABELS: Record<number, string> = {
  1: "сценарий",
  2: "интересы",
  3: "сегменты",
  4: "база",
  5: "бюджет",
  6: "сводка",
  7: "обработка",
  8: "результат",
};

export function ReturnToActivePill({
  visible,
  activeStep,
  onClick,
}: ReturnToActivePillProps) {
  const label = STEP_LABELS[activeStep] ?? `шаг ${activeStep}`;
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-none absolute bottom-24 left-1/2 z-20 -translate-x-1/2"
        >
          <Button
            size="sm"
            variant="outline"
            onClick={onClick}
            className="pointer-events-auto rounded-full bg-background/90 backdrop-blur-sm shadow-sm"
          >
            <ArrowDown className="mr-1.5 h-3.5 w-3.5" />
            Вернуться к шагу {activeStep} · {label}
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

И на использование:
```tsx
<ReturnToActivePill
  visible={focusedStep !== activeStep}
  activeStep={activeStep}
  onClick={() => peekScrollToStep(activeStep, { smooth: true })}
/>
```

- [ ] **Step 4: Commit**

```bash
git add src/sections/signals/peek-navigation/return-to-active-pill.tsx src/sections/signals/campaign-workspace.tsx
git commit -m "feat(signals): add 'return to active step' pill when focus drifts"
```

---

## Task 8: Keyboard navigation

**Files:**
- Modify: `src/sections/signals/campaign-workspace.tsx`

PRD edge-case 5: «Tab/стрелки должны синхронизироваться с focusedStep, чтобы фокус всегда был виден».

Минимум: ловим `ArrowUp`/`ArrowDown` (или `PageUp`/`PageDown`) на скролл-контейнере → меняем focusedStep на соседний (в пределах `[1..maxStep]`). Tab оставляем нативный — браузер сам скроллит к фокусированному элементу, intersection-listener подхватит и обновит focusedStep.

- [ ] **Step 1: Add keydown handler**

В `WorkspaceInner` после `useStepPeekNavigation`:

```tsx
useEffect(() => {
  const container = scrollContainerRef.current;
  if (!container) return;
  function onKeyDown(e: KeyboardEvent) {
    // Don't fight inputs/textareas inside steps.
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if ((e.target as HTMLElement)?.isContentEditable) return;

    if (e.key === "ArrowDown" || e.key === "PageDown") {
      const next = Math.min(maxStep, focusedStep + 1);
      if (next !== focusedStep) {
        e.preventDefault();
        peekScrollToStep(next, { smooth: true });
      }
    } else if (e.key === "ArrowUp" || e.key === "PageUp") {
      const next = Math.max(1, focusedStep - 1);
      if (next !== focusedStep) {
        e.preventDefault();
        peekScrollToStep(next, { smooth: true });
      }
    }
  }
  container.addEventListener("keydown", onKeyDown);
  return () => container.removeEventListener("keydown", onKeyDown);
}, [focusedStep, maxStep, peekScrollToStep]);
```

- [ ] **Step 2: Make container focusable**

На скролл-контейнере добавить `tabIndex={0}` чтобы клавиши слушались:

```tsx
<div
  ref={scrollContainerRef}
  tabIndex={0}
  className="flex flex-1 flex-col overflow-y-auto py-[15vh] focus-visible:outline-none"
>
```

- [ ] **Step 3: Visual smoke check**

- На шаге 3, фокус на пустом месте контейнера, нажать ↓ — плавный скролл к шагу 3+1=4 (если maxStep ≥ 4).
- ↑ возвращает к шагу 2.
- Внутри input'а ↓/↑ работают как обычно (не перехватывает).

- [ ] **Step 4: Commit**

```bash
git add src/sections/signals/campaign-workspace.tsx
git commit -m "feat(signals): keyboard navigation between focused steps"
```

---

## Task 9: Edge case — single visible step (early wizard)

**Files:**
- Modify: `src/sections/signals/campaign-workspace.tsx` (если потребуется)

PRD: «Только один шаг → peek нет ни сверху, ни снизу. Карточка просто по центру».

Это уже работает естественно: `visibleSteps = [1]`, контейнер pad`ится на 15vh сверху/снизу, шаг центрируется в `min-h-[70vh]`, никаких соседей нет → peek по умолчанию пустой. Степпер скрыт (`activeStep < 2` ветка `currentStep >= 2 && <CampaignStepper>`). Pill скрыт (focusedStep === activeStep === 1).

- [ ] **Step 1: Verify in browser**

Открыть визард с нуля (шаг 1, без сценария):
- Шаг 1 центрирован, нет «дырок» сверху/снизу (точнее — есть, но чистые, без странных артефактов).
- Степпер не виден.
- Pill не виден.

Если есть визуальные регрессии — исправить prep-padding (например, на шаге 1 убрать py-[15vh] если оно создаёт пустую полосу).

Если регрессий нет — задача завершена без изменений.

- [ ] **Step 2: Commit (только если были правки)**

Если не пришлось ничего менять — пропускаем коммит.

---

## Task 10: Final pass — full verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run full test suite**

```bash
npm run lint && npx vitest run
```
Expected: PASS, no errors.

- [ ] **Step 2: Walk all PRD scenarios in browser**

Запустить dev-сервер и пройти таблицу из PRD:

| Сценарий | Проверить |
|---|---|
| Юзер только зашёл, шаг 1 | focusedStep=1, activeStep=1, peek сверху нет, peek снизу нет (т.к. шаг 2 не виден до advance) |
| Юзер на шаге 3 | focusedStep=3, activeStep=3, peek сверху: шаг 2 (~15%), peek снизу: шаг 4 если visible (или нет, если activeStep === maxStep === 3) |
| Юзер на activeStep 4, проскроллил наверх | focusedStep=1, activeStep=4, peek сверху нет, peek снизу: шаг 2; pill «Вернуться к шагу 4 · бюджет» виден |
| Юзер завершил последний шаг | focusedStep=8, activeStep=8, peek сверху: шаг 7, peek снизу нет |

- [ ] **Step 3: Walk all PRD edge cases**

1. **Только один шаг** ✅ Task 9.
2. **Шаг выше высоты вьюпорта** — Step5 limit/Step6 summary в потенциально-длинном виде. Внутри карточки — обычный скролл; magnetic snap не должен срабатывать. Проверить: на узком окне (например, mobile-emulator height 600 px) длинный шаг скроллится внутри, без рывков.
3. **Очень быстрый скролл (flick)** — пройтись flick-жестом вверх-вниз. Snap должен ловить тот шаг, на котором scroll реально остановился, без «перелёта».
4. **Юзер заполняет focusedStep ≠ activeStep** — Task 6 это покрывает; перепроверить, что данные сохраняются и activeStep не съезжает.
5. **Tab/стрелки** — Task 8.

- [ ] **Step 4: Open question follow-up**

Зафиксировать в комментариях/notes к PR оставшиеся PRD-вопросы:
- Тайминг snap — текущее значение `180ms`, default параметр хука. Если по-фиде понадобится 150 — менять одну константу.
- Высота peek — `15vh` через Tailwind class. Если потребуется адаптив для коротких/высоких шагов — TODO.
- Конфликт «скролл внутри длинной карточки» vs «между шагами» — текущее решение: блокируем snap, когда focused-step выше контейнера. Альтернатива (если потребуется) — снапить только когда внутренний скролл уже на крае; это можно будет добавить позже.

- [ ] **Step 5: Final commit (если были tweaks)**

```bash
git add -A
git commit -m "chore(signals): polish peek navigation edge cases"
```

- [ ] **Step 6: Report worktree path & branch to user**

Сообщить путь до worktree и имя ветки `feature/<task-name>` (создан в начале — см. AGENTS.md). Слияние и удаление worktree — на стороне пользователя.

---

## Self-review

**Coverage map (PRD → Task):**
- Layout с peek сверху/снизу → Task 3
- focusedStep vs activeStep → Task 4 + Task 5
- Magnetic snap (180ms) → Task 2 + Task 4
- Свободный скролл → Task 3 (нативный) + Task 4 (snap-only-after-pause)
- Степпер показывает activeStep, клик меняет focusedStep → Task 5
- Поведение activeStep (двигается только по «Далее»; auto-sync focusedStep после advance) → Task 6
- Edge: одиночный шаг → Task 9
- Edge: высокий шаг → Task 2 (no-snap-when-taller-than-container) + Task 10 step 3
- Edge: быстрый flick → Task 2 (debounce ловит точку остановки) + Task 10
- Edge: edit на focused≠active → Task 6
- Edge: клавиатурная навигация → Task 8
- Открытый вопрос «вернуться к activeStep» → Task 7 (pill, направление down — единственное возможное)
- Открытые вопросы по таймингам/высоте → Task 10 step 4 (документируем для будущей итерации)

**Out-of-scope (per PRD):**
- Анимации перехода между шагами — оставляем существующий staggered reveal как есть.
- Изменения в карточках шагов — не трогаем.
- Логика разблокировки шагов — `maxStep`/`activeStep` гейтят без изменений.

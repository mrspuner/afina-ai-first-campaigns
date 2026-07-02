# Welcome Page + Signal Flow Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a centered welcome screen and improve the signal campaign flow: budget-based input, chat-style step animations, stepper scroll navigation, and clickable summary rows.

**Architecture:** New `WelcomeView` component rendered in `page.tsx` when `activeNav === null` (the new default). Clicking step 1 calls `setActiveNav("Кампании")` which swaps to `CampaignWorkspace`. No new routes or state machines needed.

**Tech Stack:** Next.js App Router, React, Tailwind CSS v4, `PromptInput` from `@/components/ai-elements/prompt-input`, Lucide icons.

---

### Task 1: Create WelcomeView component

**Files:**
- Create: `src/components/welcome-view.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

interface WelcomeViewProps {
  onStep1Click: () => void;
}

const steps = [
  { n: 1, label: "Получение сигнала", active: true },
  { n: 2, label: "Запуск кампании", active: false },
  { n: 3, label: "Статистика кампании", active: false },
];

export function WelcomeView({ onStep1Click }: WelcomeViewProps) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex w-full max-w-[480px] flex-col items-center gap-8">
        {/* Heading */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">
            Добро пожаловать
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Три шага до первой кампании —<br />
            начните с получения сигналов
          </p>
        </div>

        {/* Chat input */}
        <div className="w-full">
          <PromptInputProvider>
            <PromptInput>
              <PromptInputBody>
                <PromptInputTextarea placeholder="Выберите шаг или задайте вопрос…" />
              </PromptInputBody>
              <PromptInputFooter>
                <PromptInputSubmit />
              </PromptInputFooter>
            </PromptInput>
          </PromptInputProvider>
        </div>

        {/* Step badges */}
        <div className="flex w-full flex-col gap-1.5">
          {steps.map(({ n, label, active }) => (
            <button
              key={n}
              type="button"
              disabled={!active}
              onClick={active ? onStep1Click : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
                active
                  ? "cursor-pointer border-border bg-card hover:bg-accent"
                  : "cursor-not-allowed border-border/40 bg-card/40 opacity-35"
              )}
            >
              <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
                Шаг {n}
              </span>
              <div className="h-3 w-px shrink-0 bg-border" />
              <span className="text-sm font-medium text-foreground">
                {label}
              </span>
              {active && (
                <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the file compiles — check for TypeScript errors in the IDE or run:**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to `welcome-view.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/welcome-view.tsx
git commit -m "feat: add WelcomeView component with step badges and chat input"
```

---

### Task 2: Wire WelcomeView into page.tsx

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace page.tsx with the updated version**

```tsx
"use client";

import { useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { CampaignWorkspace } from "@/components/campaign-workspace";
import { StatisticsView } from "@/components/statistics-view";
import { LaunchFlyout } from "@/components/launch-flyout";
import { WelcomeView } from "@/components/welcome-view";

export default function Home() {
  const [activeNav, setActiveNav] = useState<string | null>(null);
  const [launchOpen, setLaunchOpen] = useState(false);

  function renderMain() {
    if (activeNav === null) {
      return <WelcomeView onStep1Click={() => setActiveNav("Кампании")} />;
    }
    if (activeNav === "Статистика") {
      return <StatisticsView />;
    }
    return <CampaignWorkspace />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar
        activeNav={activeNav ?? undefined}
        onNavChange={setActiveNav}
        onLaunchOpen={() => setLaunchOpen(true)}
        flyoutOpen={launchOpen}
      />
      <LaunchFlyout open={launchOpen} onClose={() => setLaunchOpen(false)} />
      {renderMain()}
    </div>
  );
}
```

Note: `activeNav ?? undefined` converts `null` to `undefined` so the sidebar prop (`activeNav?: string`) stays type-safe. When `undefined` is passed, the sidebar's internal check `activeNav === label` is always false — no item is highlighted.

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 3: Open http://localhost:3000 and verify:**
  - On load: welcome screen is centered, no sidebar item is active
  - Clicking «Шаг 1 · Получение сигнала» → shows CampaignWorkspace with title «Выберите тип сигнала»
  - Шаг 2 and Шаг 3 badges are dimmed and not clickable
  - Clicking any sidebar nav item (Сигналы, Кампании, Статистика) navigates normally
  - Clicking sidebar nav item then navigating back resets correctly

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: wire WelcomeView as default screen, activeNav starts null"
```

---

### Task 3: Replace signal limit with max budget input (Step 4)

**Files:**
- Modify: `src/types/campaign.ts`
- Modify: `src/components/steps/step-4-limit.tsx`
- Modify: `src/components/steps/step-6-summary.tsx`
- Modify: `src/components/campaign-stepper.tsx`

**Context:** Currently Step 4 asks for "количество сигналов" (signal count) and calculates cost. New behavior: user enters a max budget in €, system calculates the maximum number of signals achievable within that budget across the selected segments.

Budget→signals formula: `maxSignals = floor(budget / cheapestSelectedSegmentPrice)` where cheapest gives the most signals. Range: `min = floor(budget / maxPrice)`, `max = floor(budget / minPrice)`.

- [ ] **Step 1: Update `src/types/campaign.ts`**

Replace `signalLimit` with `budget`:

```ts
export interface StepData {
  scenario: string | null;
  interests: string[];
  triggers: string[];
  segments: string[];
  budget: number | null;
  file: File | null;
}

export const initialStepData: StepData = {
  scenario: null,
  interests: [],
  triggers: [],
  segments: [],
  budget: null,
  file: null,
};

export interface StepProps {
  data: StepData;
  onNext: (partial: Partial<StepData>) => void;
  onGoToStep?: (step: number) => void;
}
```

- [ ] **Step 2: Update `src/components/steps/step-4-limit.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StepContent } from "@/components/steps/step-content";
import { StepProps } from "@/types/campaign";

const SEGMENT_PRICES: Record<string, number> = {
  max: 0.45,
  "very-high": 0.35,
  high: 0.25,
  medium: 0.07,
};

function calcSignals(segments: string[], budget: number): string {
  if (segments.length === 0) return "—";
  const prices = segments.map((s) => SEGMENT_PRICES[s] ?? 0).filter(Boolean);
  if (prices.length === 0) return "—";
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const maxSignals = Math.floor(budget / minPrice);
  const minSignals = Math.floor(budget / maxPrice);
  if (minSignals === maxSignals) return `${maxSignals.toLocaleString("ru")} сигналов`;
  return `${minSignals.toLocaleString("ru")} – ${maxSignals.toLocaleString("ru")} сигналов`;
}

export function Step4Limit({ data, onNext }: StepProps) {
  const [value, setValue] = useState<string>(
    data.budget ? String(data.budget) : ""
  );

  const parsed = parseFloat(value);
  const isValid = !isNaN(parsed) && parsed > 0;
  const estimatedSignals = calcSignals(data.segments, isValid ? parsed : 0);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".");
    setValue(raw);
  }

  return (
    <StepContent
      title="Укажите максимальный бюджет"
      subtitle="Мы найдём максимальное количество сигналов в рамках этой суммы"
      maxWidth="max-w-md"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Input
            type="text"
            inputMode="decimal"
            placeholder="Например, 500"
            value={value}
            onChange={handleChange}
            className="text-lg"
          />
          <p className="text-sm text-muted-foreground">
            Максимальное количество сигналов:{" "}
            <span className="font-medium text-foreground">
              {isValid ? estimatedSignals : "—"}
            </span>
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            disabled={!isValid}
            onClick={() => onNext({ budget: parsed })}
          >
            Далее
          </Button>
        </div>
      </div>
    </StepContent>
  );
}
```

- [ ] **Step 3: Update `src/components/steps/step-6-summary.tsx`** — replace `signalLimit` references with `budget`, update cost calculation, update row labels

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StepContent } from "@/components/steps/step-content";
import { StepProps } from "@/types/campaign";
import { cn } from "@/lib/utils";

const SCENARIO_NAMES: Record<string, string> = {
  registration: "Регистрация",
  "first-deal": "Первая сделка",
  upsell: "Апсейл",
  retention: "Удержание",
  return: "Возврат",
  reactivation: "Реактивация",
};

const SEGMENT_NAMES: Record<string, string> = {
  max: "Максимальный (€ 0.45 / сигнал)",
  "very-high": "Очень высокий (€ 0.35 / сигнал)",
  high: "Высокий (€ 0.25 / сигнал)",
  medium: "Средний и ниже (€ 0.07 / сигнал)",
};

const SEGMENT_PRICES: Record<string, number> = {
  max: 0.45,
  "very-high": 0.35,
  high: 0.25,
  medium: 0.07,
};

function SummaryRow({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-start justify-between gap-4 py-3 transition-colors",
        onClick && "cursor-pointer rounded px-2 -mx-2 hover:bg-accent"
      )}
    >
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}

export function Step6Summary({ data, onNext, onGoToStep }: StepProps) {
  const budget = data.budget ?? 0;
  const prices = data.segments.map((s) => SEGMENT_PRICES[s] ?? 0).filter(Boolean);
  const minSignals = prices.length ? Math.floor(budget / Math.max(...prices)) : 0;
  const maxSignals = prices.length ? Math.floor(budget / Math.min(...prices)) : 0;
  const signalsStr =
    minSignals === maxSignals
      ? `${maxSignals.toLocaleString("ru")} сигналов`
      : `${minSignals.toLocaleString("ru")} – ${maxSignals.toLocaleString("ru")} сигналов`;

  const goto = onGoToStep;

  return (
    <StepContent
      title="Проверьте настройки кампании"
      subtitle="Нажмите на строку, чтобы вернуться к шагу для редактирования"
    >
      <div className="rounded-lg border border-border bg-card">
        <div className="divide-y divide-border px-4">
          <SummaryRow
            label="Сценарий"
            value={SCENARIO_NAMES[data.scenario ?? ""] ?? "—"}
            onClick={goto ? () => goto(1) : undefined}
          />
          <SummaryRow
            label="Интересы"
            value={data.interests.length ? data.interests.join(", ") : "—"}
            onClick={goto ? () => goto(2) : undefined}
          />
          <SummaryRow
            label="Триггеры"
            value={data.triggers.length ? data.triggers.join(", ") : "—"}
            onClick={goto ? () => goto(2) : undefined}
          />
          <SummaryRow
            label="Сегменты"
            value={
              data.segments.length
                ? data.segments.map((s) => SEGMENT_NAMES[s]).join("; ")
                : "—"
            }
            onClick={goto ? () => goto(3) : undefined}
          />
          <SummaryRow
            label="Максимальный бюджет"
            value={budget ? `€ ${budget.toFixed(2)}` : "—"}
            onClick={goto ? () => goto(4) : undefined}
          />
          <SummaryRow
            label="Максимум сигналов"
            value={budget && prices.length ? signalsStr : "—"}
          />
          <SummaryRow
            label="Файл с базой"
            value={data.file ? data.file.name : "—"}
            onClick={goto ? () => goto(5) : undefined}
          />
        </div>
      </div>

      <Separator className="my-4" />

      <div className="flex justify-end">
        <Button onClick={() => onNext({})}>Подтвердить и запустить</Button>
      </div>
    </StepContent>
  );
}
```

- [ ] **Step 4: Update stepper label in `src/components/campaign-stepper.tsx`** — rename "Лимиты" to "Бюджет"

```ts
const STEPPER_ITEMS = [
  { label: "Интересы", step: 2 },
  { label: "Сегменты", step: 3 },
  { label: "Бюджет", step: 4 },   // was "Лимиты"
  { label: "База", step: 5 },
  { label: "Сводка", step: 6 },
  { label: "Обработка", step: 7 },
  { label: "Результат", step: 8 },
];
```

- [ ] **Step 5: Verify TypeScript — no `signalLimit` references remain**

```bash
grep -r "signalLimit" src/
```

Expected: no output.

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/types/campaign.ts src/components/steps/step-4-limit.tsx src/components/steps/step-6-summary.tsx src/components/campaign-stepper.tsx
git commit -m "feat: replace signal limit with max budget input, clickable summary rows"
```

---

### Task 4: Chat-style step animations + stepper scroll navigation

**Files:**
- Modify: `src/components/campaign-workspace.tsx`

**Context:** Currently `AnimatePresence` shows one step at a time, sliding in/out. New behavior:
- All steps from 1 through `maxStep` are rendered in a scrollable column (chat style)
- Going forward for the **first time**: new step animates in from below (`y: 60 → 0`), auto-scroll to it
- Going forward **when returning** (step already exists): just smooth-scroll to the next step, no animation
- Stepper click: instant scroll to that step, no animation, no re-render
- `handleNext` when `currentStep < maxStep`: smooth-scroll to `currentStep + 1`, update `currentStep`

New state shape:
- `currentStep: number` — which step is active / being edited (used for stepper highlight)
- `maxStep: number` — highest step ever reached (determines which steps are rendered)
- `animatingStep: number | null` — the step that should play its enter animation (set only when first reaching a new step frontier)

- [ ] **Step 1: Rewrite `src/components/campaign-workspace.tsx`**

```tsx
"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "motion/react";
import { Mic } from "lucide-react";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputTextarea,
  PromptInputTools,
  PromptInputButton,
  PromptInputSubmit,
  PromptInputProvider,
} from "@/components/ai-elements/prompt-input";
import { CampaignStepper } from "@/components/campaign-stepper";
import { StepData, initialStepData } from "@/types/campaign";
import { Step1Scenario } from "@/components/steps/step-1-scenario";
import { Step2Interests } from "@/components/steps/step-2-interests";
import { Step3Segments } from "@/components/steps/step-3-segments";
import { Step4Limit } from "@/components/steps/step-4-limit";
import { Step5Upload } from "@/components/steps/step-5-upload";
import { Step6Summary } from "@/components/steps/step-6-summary";
import { Step7Processing } from "@/components/steps/step-7-processing";
import { Step8Result } from "@/components/steps/step-8-result";

function WorkspaceInner() {
  const [currentStep, setCurrentStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);
  const [animatingStep, setAnimatingStep] = useState<number | null>(1);
  const [stepData, setStepData] = useState<StepData>(initialStepData);
  const stepRefs = useRef<Record<number, HTMLDivElement | null>>({});

  function scrollToStep(step: number, behavior: ScrollBehavior = "smooth") {
    stepRefs.current[step]?.scrollIntoView({ behavior, block: "start" });
  }

  const handleNext = useCallback(
    (partial: Partial<StepData>) => {
      setStepData((prev) => ({ ...prev, ...partial }));
      const next = currentStep + 1;
      if (next > maxStep) {
        // First time reaching this step — animate it in
        setMaxStep(next);
        setAnimatingStep(next);
        setCurrentStep(next);
        requestAnimationFrame(() => scrollToStep(next, "smooth"));
      } else {
        // Returning scenario — step already rendered, just scroll
        setAnimatingStep(null);
        setCurrentStep(next);
        requestAnimationFrame(() => scrollToStep(next, "smooth"));
      }
    },
    [currentStep, maxStep]
  );

  const handleStepperClick = useCallback((step: number) => {
    setAnimatingStep(null);
    setCurrentStep(step);
    requestAnimationFrame(() => scrollToStep(step, "instant"));
  }, []);

  const handleGoToStep = useCallback((step: number) => {
    setAnimatingStep(null);
    setCurrentStep(step);
    requestAnimationFrame(() => scrollToStep(step, "smooth"));
  }, []);

  const handleLaunchNew = useCallback(() => {
    setStepData(initialStepData);
    setCurrentStep(1);
    setMaxStep(1);
    setAnimatingStep(1);
    requestAnimationFrame(() => scrollToStep(1, "instant"));
  }, []);

  function renderStepContent(step: number) {
    const props = { data: stepData, onNext: handleNext };
    switch (step) {
      case 1: return <Step1Scenario {...props} />;
      case 2: return <Step2Interests {...props} />;
      case 3: return <Step3Segments {...props} />;
      case 4: return <Step4Limit {...props} />;
      case 5: return <Step5Upload {...props} />;
      case 6: return <Step6Summary {...props} onGoToStep={handleGoToStep} />;
      case 7: return <Step7Processing {...props} />;
      case 8: return <Step8Result data={stepData} onNext={handleLaunchNew} />;
      default: return null;
    }
  }

  const visibleSteps = Array.from({ length: maxStep }, (_, i) => i + 1);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {currentStep >= 2 && (
        <div className="absolute right-6 top-6 z-10">
          <CampaignStepper
            currentStep={currentStep}
            onStepClick={handleStepperClick}
            disabled={currentStep === 7}
          />
        </div>
      )}

      {/* Scrollable step column */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {visibleSteps.map((step) => (
          <motion.div
            key={step}
            ref={(el) => { stepRefs.current[step] = el; }}
            initial={step === animatingStep ? { y: 60, opacity: 0 } : false}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="flex min-h-screen flex-col items-center justify-center px-8 py-10"
          >
            {renderStepContent(step)}
          </motion.div>
        ))}
      </div>

      {/* Chat input — pinned to bottom */}
      <div className="border-t border-border bg-background px-8 py-4">
        <div className="mx-auto w-full max-w-2xl">
          <PromptInput
            onSubmit={(msg) => {
              console.log("chat submit", msg);
            }}
          >
            <PromptInputBody>
              <PromptInputTextarea placeholder="Опишите вашу кампанию..." />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <PromptInputButton tooltip="Голосовой ввод">
                  <Mic className="h-4 w-4" />
                </PromptInputButton>
              </PromptInputTools>
              <PromptInputSubmit />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}

export function CampaignWorkspace() {
  return (
    <PromptInputProvider>
      <WorkspaceInner />
    </PromptInputProvider>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Manual verification at http://localhost:3000**
  - Click «Шаг 1» → enter campaign wizard
  - Select a scenario → step 1 stays visible, step 2 animates in from below, auto-scrolls
  - Complete step 2 → step 3 animates in
  - Click stepper item for step 2 → instant scroll to step 2, no animation
  - Click «Далее» on step 2 again → smooth scroll to step 3, no re-animation
  - In step 6 summary: click "Сценарий" row → smooth scroll to step 1

- [ ] **Step 4: Commit**

```bash
git add src/components/campaign-workspace.tsx
git commit -m "feat: chat-style step scroll animation, stepper instant scroll, return-next scroll"
```

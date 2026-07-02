# Campaign Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully clickable 8-step campaign creation wizard with smooth step-transition animations.

**Architecture:** Variant B — `CampaignWorkspace` owns `currentStep` + `stepData` state and renders step components from `src/components/steps/`. `AnimatePresence` handles exit animation (slide up), a shared `StepContent` wrapper handles title/subtitle typewriter sequence + content fade-in.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, `motion` v12 (`motion/react`), shadcn/ui on top of `@base-ui/react`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/types/campaign.ts` | Shared `StepData` type + initial value |
| Create | `src/hooks/use-typewriter.ts` | Char-by-char text reveal hook |
| Create | `src/components/steps/step-content.tsx` | Title+subtitle typewriter + content fade-in wrapper |
| Modify | `src/components/campaign-workspace.tsx` | Wizard shell: state, AnimatePresence, step routing |
| Create | `src/components/campaign-stepper.tsx` | Stepper UI, shown on steps 2–8 |
| Create | `src/components/steps/step-1-scenario.tsx` | Scenario grid (extracted from workspace) |
| Create | `src/components/steps/step-2-interests.tsx` | Interests + triggers multi-select |
| Create | `src/components/steps/step-3-segments.tsx` | Segment checkbox-buttons |
| Create | `src/components/steps/step-4-limit.tsx` | Signal limit input + cost calculation |
| Create | `src/components/steps/step-5-upload.tsx` | File drag-drop + hashing loader |
| Create | `src/components/steps/step-6-summary.tsx` | Read-only summary of all stepData |
| Create | `src/components/steps/step-7-processing.tsx` | Progress bar auto-advance |
| Create | `src/components/steps/step-8-result.tsx` | Result: download + launch buttons |

---

## Task 1: Shared types + useTypewriter hook

**Files:**
- Create: `src/types/campaign.ts`
- Create: `src/hooks/use-typewriter.ts`

- [ ] **Step 1: Create `src/types/campaign.ts`**

```ts
export interface StepData {
  scenario: string | null;
  interests: string[];
  triggers: string[];
  segments: string[];
  signalLimit: number | null;
  file: File | null;
}

export const initialStepData: StepData = {
  scenario: null,
  interests: [],
  triggers: [],
  segments: [],
  signalLimit: null,
  file: null,
};

export interface StepProps {
  data: StepData;
  onNext: (partial: Partial<StepData>) => void;
}
```

- [ ] **Step 2: Create `src/hooks/use-typewriter.ts`**

```ts
"use client";

import { useState, useEffect } from "react";

export function useTypewriter(text: string, speed = 25) {
  const [displayed, setDisplayed] = useState("");
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    if (!text) {
      setDisplayed("");
      setIsDone(true);
      return;
    }
    setDisplayed("");
    setIsDone(false);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        setIsDone(true);
      }
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);

  return { displayed, isDone };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/types/campaign.ts src/hooks/use-typewriter.ts
git commit -m "feat: add StepData types and useTypewriter hook"
```

---

## Task 2: StepContent wrapper

**Files:**
- Create: `src/components/steps/step-content.tsx`

This component handles the full animation sequence for every step: title types → subtitle types → content fades in.

- [ ] **Step 1: Create `src/components/steps/step-content.tsx`**

```tsx
"use client";

import { motion } from "motion/react";
import { useTypewriter } from "@/hooks/use-typewriter";

interface StepContentProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export function StepContent({
  title,
  subtitle,
  children,
  maxWidth = "max-w-2xl",
}: StepContentProps) {
  const { displayed: titleText, isDone: titleDone } = useTypewriter(title, 25);
  const { displayed: subtitleText, isDone: subtitleDone } = useTypewriter(
    titleDone ? subtitle : "",
    18
  );

  return (
    <div className={`w-full ${maxWidth}`}>
      <div className="mb-8 text-center">
        <h1 className="min-h-[2rem] text-2xl font-semibold tracking-tight text-foreground">
          {titleText}
          {!titleDone && (
            <span className="ml-0.5 animate-pulse opacity-60">|</span>
          )}
        </h1>
        <p className="mt-1.5 min-h-[1.25rem] text-sm text-muted-foreground">
          {subtitleText}
          {titleDone && !subtitleDone && (
            <span className="ml-0.5 animate-pulse opacity-60">|</span>
          )}
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: subtitleDone ? 1 : 0 }}
        transition={{ duration: 0.35 }}
      >
        {children}
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/steps/step-content.tsx
git commit -m "feat: add StepContent wrapper with typewriter + fade-in sequence"
```

---

## Task 3: Refactor CampaignWorkspace to wizard shell

**Files:**
- Modify: `src/components/campaign-workspace.tsx`

Replace the current single-step implementation with the wizard shell. Step 1 component doesn't exist yet — render a placeholder `<div>Step 1 placeholder</div>` for now so the file compiles.

- [ ] **Step 1: Replace `src/components/campaign-workspace.tsx`**

```tsx
"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
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
  usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import { StepData, initialStepData } from "@/types/campaign";

// Step components — imported one by one as they are built
// import { Step1Scenario } from "@/components/steps/step-1-scenario";

function WorkspaceInner() {
  const [currentStep, setCurrentStep] = useState(1);
  const [stepData, setStepData] = useState<StepData>(initialStepData);
  const { textInput } = usePromptInputController();

  function handleNext(partial: Partial<StepData>) {
    setStepData((prev) => ({ ...prev, ...partial }));
    setCurrentStep((prev) => prev + 1);
  }

  function handleStepperClick(step: number) {
    setCurrentStep(step);
  }

  function renderStep() {
    // Replace each placeholder with the real import as tasks complete
    switch (currentStep) {
      case 1:
        return <div className="text-muted-foreground">Step 1 placeholder</div>;
      default:
        return <div className="text-muted-foreground">Step {currentStep} placeholder</div>;
    }
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* Stepper — rendered from step 2 onward (added in Task 4) */}

      {/* Animated step area */}
      <div className="flex flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-8 py-10"
            exit={{ y: -60, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeIn" }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Chat input — pinned to bottom, outside animation */}
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

- [ ] **Step 2: Run dev server and verify it compiles**

```bash
npm run dev
```

Open `http://localhost:3000`. Expected: page loads, shows "Step 1 placeholder" text, no console errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaign-workspace.tsx
git commit -m "feat: refactor CampaignWorkspace to wizard shell with AnimatePresence"
```

---

## Task 4: CampaignStepper component

**Files:**
- Create: `src/components/campaign-stepper.tsx`
- Modify: `src/components/campaign-workspace.tsx` (add stepper)

The stepper maps flow `currentStep` to display items:
- Item 1 "Интересы" ↔ step 2
- Item 2 "Сегменты" ↔ step 3
- Item N ↔ step N+1

State per item: `completed` if its step < currentStep, `active` if its step === currentStep, `pending` otherwise.

- [ ] **Step 1: Create `src/components/campaign-stepper.tsx`**

```tsx
"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPPER_ITEMS = [
  { label: "Интересы", step: 2 },
  { label: "Сегменты", step: 3 },
  { label: "Лимиты", step: 4 },
  { label: "База", step: 5 },
  { label: "Сводка", step: 6 },
  { label: "Обработка", step: 7 },
  { label: "Результат", step: 8 },
];

interface CampaignStepperProps {
  currentStep: number;
  onStepClick: (step: number) => void;
  disabled?: boolean;
}

export function CampaignStepper({
  currentStep,
  onStepClick,
  disabled = false,
}: CampaignStepperProps) {
  return (
    <div className="flex flex-col gap-1">
      {STEPPER_ITEMS.map(({ label, step }, idx) => {
        const isCompleted = step < currentStep;
        const isActive = step === currentStep;
        const isPending = step > currentStep;
        const isClickable = isCompleted && !disabled;

        return (
          <div key={step} className="flex items-center gap-2.5">
            {/* Connector line above (except first item) */}
            <div className="flex flex-col items-center self-stretch">
              <div
                className={cn(
                  "w-px flex-1",
                  idx === 0 ? "invisible" : isCompleted ? "bg-primary" : "bg-border"
                )}
              />
              {/* Circle */}
              <div
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium transition-colors",
                  isCompleted &&
                    "border-primary bg-primary text-primary-foreground",
                  isActive &&
                    "border-primary bg-background text-primary ring-2 ring-primary/20",
                  isPending && "border-border bg-background text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>
              <div
                className={cn(
                  "w-px flex-1",
                  idx === STEPPER_ITEMS.length - 1
                    ? "invisible"
                    : isCompleted
                    ? "bg-primary"
                    : "bg-border"
                )}
              />
            </div>

            {/* Label */}
            <button
              onClick={() => isClickable && onStepClick(step)}
              disabled={!isClickable}
              className={cn(
                "py-1 text-xs transition-colors",
                isActive && "font-medium text-foreground",
                isCompleted && !disabled
                  ? "cursor-pointer text-foreground hover:text-primary"
                  : "cursor-default",
                isPending && "text-muted-foreground"
              )}
            >
              {label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Wire stepper into `campaign-workspace.tsx`**

Add import at top of `campaign-workspace.tsx`:
```tsx
import { CampaignStepper } from "@/components/campaign-stepper";
```

In `WorkspaceInner`, replace the `{/* Stepper — rendered from step 2 onward */}` comment with:
```tsx
{currentStep >= 2 && (
  <div className="absolute right-6 top-6 z-10">
    <CampaignStepper
      currentStep={currentStep}
      onStepClick={handleStepperClick}
      disabled={currentStep === 7}
    />
  </div>
)}
```

- [ ] **Step 3: Temporarily advance to step 2 to verify stepper renders**

In the `renderStep()` switch, temporarily add `case 1: return` with a button that calls `handleNext({})`:
```tsx
case 1:
  return (
    <button
      onClick={() => handleNext({})}
      className="rounded border px-4 py-2 text-sm"
    >
      Go to step 2 (temp)
    </button>
  );
```

Open `http://localhost:3000`. Click the button. Expected: stepper appears top-right with item 1 "Интересы" active. Click nothing yet (other steps are placeholders).

- [ ] **Step 4: Revert the temp button** (keep `case 1` as placeholder until Task 5)

```tsx
case 1:
  return <div className="text-muted-foreground">Step 1 placeholder</div>;
```

- [ ] **Step 5: Commit**

```bash
git add src/components/campaign-stepper.tsx src/components/campaign-workspace.tsx
git commit -m "feat: add CampaignStepper with completed/active/pending states"
```

---

## Task 5: Step 1 — Scenario selection

**Files:**
- Create: `src/components/steps/step-1-scenario.tsx`
- Modify: `src/components/campaign-workspace.tsx` (import + wire)

Step 1 has no Stepper. Clicking a card triggers `onNext({ scenario: id })` immediately (no "Continue" button). Chat input pre-fills with scenario name.

- [ ] **Step 1: Create `src/components/steps/step-1-scenario.tsx`**

```tsx
"use client";

import { usePromptInputController } from "@/components/ai-elements/prompt-input";
import { StepContent } from "@/components/steps/step-content";
import { StepProps } from "@/types/campaign";
import { cn } from "@/lib/utils";

const SCENARIOS = [
  {
    id: "registration",
    name: "Регистрация",
    description: "Возврат пользователей после незавершённой регистрации или брошенной корзины",
  },
  {
    id: "first-deal",
    name: "Первая сделка",
    description: "Обогащение данных о клиенте, оценка потенциала и рисков",
  },
  {
    id: "upsell",
    name: "Апсейл",
    description: "Мониторинг интереса к конкурентам, предотвращение оттока",
  },
  {
    id: "retention",
    name: "Удержание",
    description: "Мониторинг интереса к конкурентам и предотвращение оттока",
  },
  {
    id: "return",
    name: "Возврат",
    description: "Определение оптимального момента для повторного контакта",
  },
  {
    id: "reactivation",
    name: "Реактивация",
    description: "Определение оптимального момента для повторного контакта",
  },
];

export function Step1Scenario({ data, onNext }: StepProps) {
  const { textInput } = usePromptInputController();

  function handleSelect(id: string, name: string) {
    textInput.setInput(`Сценарий: ${name}. `);
    onNext({ scenario: id });
  }

  return (
    <StepContent
      title="Создайте новую кампанию"
      subtitle="Выберите сценарий — мы зададим нужные вопросы"
    >
      <div className="grid grid-cols-3 gap-3">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            onClick={() => handleSelect(s.id, s.name)}
            className={cn(
              "flex flex-col items-start rounded-lg border p-4 text-left transition-all",
              data.scenario === s.id
                ? "border-primary bg-accent ring-1 ring-primary"
                : "border-border bg-card hover:bg-accent hover:border-border"
            )}
          >
            <span className="text-sm font-medium text-foreground">{s.name}</span>
            <span className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {s.description}
            </span>
          </button>
        ))}
      </div>
    </StepContent>
  );
}
```

- [ ] **Step 2: Wire Step1Scenario into `campaign-workspace.tsx`**

Add import:
```tsx
import { Step1Scenario } from "@/components/steps/step-1-scenario";
```

Update `renderStep()`:
```tsx
case 1:
  return (
    <Step1Scenario
      data={stepData}
      onNext={(partial) => {
        handleNext(partial);
        // pre-fill chat already handled inside Step1Scenario
      }}
    />
  );
```

Note: `Step1Scenario` calls `usePromptInputController()` internally, so it must be rendered inside `PromptInputProvider` — which it already is (via `WorkspaceInner` being a child of `CampaignWorkspace` which wraps in `PromptInputProvider`). No extra wiring needed.

Actually, simplify the case:
```tsx
case 1:
  return <Step1Scenario data={stepData} onNext={handleNext} />;
```

- [ ] **Step 3: Verify on localhost**

Open `http://localhost:3000`. Expected:
- Title "Создайте новую кампанию" types out character by character
- Subtitle types out after title completes
- 6 scenario cards fade in after subtitle finishes
- Clicking a card immediately advances to step 2 (shows placeholder "Step 2 placeholder" with stepper appearing top-right, item 1 "Интересы" active)
- Chat input pre-fills with "Сценарий: {name}. "
- Transition: current content exits upward, step 2 area appears

- [ ] **Step 4: Commit**

```bash
git add src/components/steps/step-1-scenario.tsx src/components/campaign-workspace.tsx
git commit -m "feat: add Step1Scenario with typewriter animation and scenario selection"
```

---

## Task 6: Step 2 — Interests & Triggers

**Files:**
- Create: `src/components/steps/step-2-interests.tsx`
- Modify: `src/components/campaign-workspace.tsx`

Multi-select: toggle on/off. "Продолжить" disabled until at least one card selected in either group.

- [ ] **Step 1: Create `src/components/steps/step-2-interests.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StepContent } from "@/components/steps/step-content";
import { StepProps } from "@/types/campaign";
import { cn } from "@/lib/utils";

const INTERESTS = [
  "Недвижимость",
  "Автомобили",
  "Финансовые услуги",
  "Страхование",
  "Путешествия",
  "Электроника",
  "Образование",
  "Здоровье и медицина",
];

const TRIGGERS = [
  "Посещение сайтов конкурентов",
  "Поиск альтернативных предложений",
  "Истечение срока договора",
  "Смена места жительства",
  "Смена работы",
  "Крупная покупка",
  "Оформление кредита",
];

function TagCard({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "rounded-lg border px-3 py-2 text-left text-sm transition-all",
        selected
          ? "border-primary bg-accent ring-1 ring-primary text-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

export function Step2Interests({ data, onNext }: StepProps) {
  const [interests, setInterests] = useState<string[]>(data.interests);
  const [triggers, setTriggers] = useState<string[]>(data.triggers);

  function toggle(list: string[], setList: (v: string[]) => void, item: string) {
    setList(
      list.includes(item) ? list.filter((i) => i !== item) : [...list, item]
    );
  }

  const canContinue = interests.length > 0 || triggers.length > 0;

  return (
    <StepContent
      title="Какие интересы и триггеры вы ищете?"
      subtitle="Выберите одно или несколько. Если нужного нет — напишите в поле чата"
    >
      <div className="flex flex-col gap-6">
        {/* Interests group */}
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Интересы
          </p>
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((item) => (
              <TagCard
                key={item}
                label={item}
                selected={interests.includes(item)}
                onToggle={() => toggle(interests, setInterests, item)}
              />
            ))}
          </div>
        </div>

        {/* Triggers group */}
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Триггеры
          </p>
          <div className="flex flex-wrap gap-2">
            {TRIGGERS.map((item) => (
              <TagCard
                key={item}
                label={item}
                selected={triggers.includes(item)}
                onToggle={() => toggle(triggers, setTriggers, item)}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <Button
            disabled={!canContinue}
            onClick={() => onNext({ interests, triggers })}
          >
            Продолжить
          </Button>
          <p className="text-xs text-muted-foreground">
            Если нужного нет в списке — напишите в поле чата
          </p>
        </div>
      </div>
    </StepContent>
  );
}
```

- [ ] **Step 2: Wire into `campaign-workspace.tsx`**

Add import:
```tsx
import { Step2Interests } from "@/components/steps/step-2-interests";
```

Add case to `renderStep()`:
```tsx
case 2:
  return <Step2Interests data={stepData} onNext={handleNext} />;
```

- [ ] **Step 3: Verify on localhost**

Open `http://localhost:3000`. Click any scenario card → lands on step 2. Expected:
- Stepper shows item 1 "Интересы" active
- Title + subtitle type out, then cards fade in
- Clicking cards toggles selected state (highlighted border)
- "Продолжить" is disabled (greyed out) until at least one card selected
- After selecting one card, "Продолжить" becomes active
- Clicking "Продолжить" advances to step 3 placeholder, stepper shows item 2 "Сегменты" active, item 1 shows checkmark

- [ ] **Step 4: Commit**

```bash
git add src/components/steps/step-2-interests.tsx src/components/campaign-workspace.tsx
git commit -m "feat: add Step2Interests with multi-select interests and triggers"
```

---

## Task 7: Step 3 — Segments

**Files:**
- Create: `src/components/steps/step-3-segments.tsx`
- Modify: `src/components/campaign-workspace.tsx`

4 checkbox-style buttons. Selecting multiple is allowed. At least one required to continue.

- [ ] **Step 1: Create `src/components/steps/step-3-segments.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StepContent } from "@/components/steps/step-content";
import { StepProps } from "@/types/campaign";
import { cn } from "@/lib/utils";

const SEGMENTS = [
  {
    id: "max",
    name: "Максимальный",
    price: 0.45,
    description: "Высочайшая вероятность отклика",
  },
  {
    id: "very-high",
    name: "Очень высокий",
    price: 0.35,
    description: "Сильный интерес, высокая готовность",
  },
  {
    id: "high",
    name: "Высокий",
    price: 0.25,
    description: "Выраженный интерес к категории",
  },
  {
    id: "medium",
    name: "Средний и ниже",
    price: 0.07,
    description: "Общий интерес без явных триггеров",
  },
];

export function Step3Segments({ data, onNext }: StepProps) {
  const [selected, setSelected] = useState<string[]>(data.segments);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  const canContinue = selected.length > 0;

  return (
    <StepContent
      title="Выберите потенциал отклика"
      subtitle="Чем выше потенциал — тем точнее сигнал и выше стоимость. Можно выбрать несколько"
    >
      <div className="flex flex-col gap-3">
        {SEGMENTS.map((seg) => {
          const isSelected = selected.includes(seg.id);
          return (
            <button
              key={seg.id}
              onClick={() => toggle(seg.id)}
              className={cn(
                "flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-all",
                isSelected
                  ? "border-primary bg-accent ring-1 ring-primary"
                  : "border-border bg-card hover:bg-accent"
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    isSelected
                      ? "border-primary bg-primary"
                      : "border-border bg-background"
                  )}
                >
                  {isSelected && (
                    <svg
                      className="h-2.5 w-2.5 text-primary-foreground"
                      viewBox="0 0 10 10"
                      fill="none"
                    >
                      <path
                        d="M2 5l2.5 2.5L8 3"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{seg.name}</p>
                  <p className="text-xs text-muted-foreground">{seg.description}</p>
                </div>
              </div>
              <span className="ml-4 shrink-0 text-sm font-medium text-foreground">
                € {seg.price.toFixed(2)} / сигнал
              </span>
            </button>
          );
        })}

        <div className="mt-2 flex justify-end">
          <Button disabled={!canContinue} onClick={() => onNext({ segments: selected })}>
            Продолжить
          </Button>
        </div>
      </div>
    </StepContent>
  );
}
```

- [ ] **Step 2: Wire into `campaign-workspace.tsx`**

Add import:
```tsx
import { Step3Segments } from "@/components/steps/step-3-segments";
```

Add case:
```tsx
case 3:
  return <Step3Segments data={stepData} onNext={handleNext} />;
```

- [ ] **Step 3: Verify on localhost**

Flow through steps 1 → 2 → 3. Expected:
- Step 3 shows 4 segment rows with checkbox, name, description, price
- Multiple can be selected simultaneously
- "Продолжить" disabled until at least one selected
- Advancing goes to step 4 placeholder, stepper shows "Лимиты" active

- [ ] **Step 4: Commit**

```bash
git add src/components/steps/step-3-segments.tsx src/components/campaign-workspace.tsx
git commit -m "feat: add Step3Segments with checkbox-style segment selection"
```

---

## Task 8: Step 4 — Signal limit & budget

**Files:**
- Create: `src/components/steps/step-4-limit.tsx`
- Modify: `src/components/campaign-workspace.tsx`

Input accepts only positive integers. Cost is calculated as: average price of selected segments × signalLimit.

- [ ] **Step 1: Create `src/components/steps/step-4-limit.tsx`**

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

function calcCost(segments: string[], limit: number | null): string {
  if (!limit || segments.length === 0) return "—";
  const prices = segments.map((s) => SEGMENT_PRICES[s] ?? 0);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return `€ ${(max * limit).toFixed(2)}`;
  return `€ ${(min * limit).toFixed(2)} – € ${(max * limit).toFixed(2)}`;
}

export function Step4Limit({ data, onNext }: StepProps) {
  const [value, setValue] = useState<string>(
    data.signalLimit ? String(data.signalLimit) : ""
  );

  const parsed = parseInt(value, 10);
  const isValid = !isNaN(parsed) && parsed > 0;
  const estimatedCost = calcCost(data.segments, isValid ? parsed : null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9]/g, "");
    setValue(raw);
  }

  return (
    <StepContent
      title="Укажите лимит сигналов"
      subtitle="Мы остановимся, как только наберём нужное количество"
      maxWidth="max-w-md"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Input
            type="text"
            inputMode="numeric"
            placeholder="Например, 1000"
            value={value}
            onChange={handleChange}
            className="text-lg"
          />
          <p className="text-sm text-muted-foreground">
            Ориентировочная стоимость:{" "}
            <span className="font-medium text-foreground">{estimatedCost}</span>
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            disabled={!isValid}
            onClick={() => onNext({ signalLimit: parsed })}
          >
            Далее
          </Button>
        </div>
      </div>
    </StepContent>
  );
}
```

- [ ] **Step 2: Wire into `campaign-workspace.tsx`**

Add import:
```tsx
import { Step4Limit } from "@/components/steps/step-4-limit";
```

Add case:
```tsx
case 4:
  return <Step4Limit data={stepData} onNext={handleNext} />;
```

- [ ] **Step 3: Verify on localhost**

Flow through steps 1–4. Expected:
- Only digits accepted in the input
- Cost shows "—" when empty, calculates in real time as you type
- If two segments selected with different prices, shows a range "€ X – € Y"
- "Далее" disabled until valid positive integer entered

- [ ] **Step 4: Commit**

```bash
git add src/components/steps/step-4-limit.tsx src/components/campaign-workspace.tsx
git commit -m "feat: add Step4Limit with signal count input and cost calculation"
```

---

## Task 9: Step 5 — File upload + hashing animation

**Files:**
- Create: `src/components/steps/step-5-upload.tsx`
- Modify: `src/components/campaign-workspace.tsx`

Custom drag-and-drop zone (no external library needed). After clicking "Далее", the hashing loader runs for ~4.2s total before auto-advancing to step 6.

- [ ] **Step 1: Create `src/components/steps/step-5-upload.tsx`**

```tsx
"use client";

import { useState, useRef, useCallback } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StepContent } from "@/components/steps/step-content";
import { StepProps } from "@/types/campaign";
import { useTypewriter } from "@/hooks/use-typewriter";
import { cn } from "@/lib/utils";

const HASHING_STAGES = [
  { text: "Проверка формата файла...", duration: 1200 },
  { text: "Хеширование данных...", duration: 2000 },
  { text: "Подготовка к импорту...", duration: 1000 },
];

function HashingLoader({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const [stageIndex, setStageIndex] = useState(0);
  const stage = HASHING_STAGES[stageIndex];
  const { displayed, isDone } = useTypewriter(stage.text, 30);

  // When typing finishes for this stage, wait the remaining duration then advance
  const advancedRef = useRef(false);
  if (isDone && !advancedRef.current) {
    advancedRef.current = true;
    const remaining = stage.duration - stage.text.length * 30;
    setTimeout(() => {
      if (stageIndex < HASHING_STAGES.length - 1) {
        setStageIndex((i) => i + 1);
        advancedRef.current = false;
      } else {
        onComplete();
      }
    }, Math.max(remaining, 300));
  }

  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <div className="h-8 flex items-center">
        <p className="text-sm font-medium text-foreground">
          {displayed}
          {!isDone && <span className="ml-0.5 animate-pulse opacity-60">|</span>}
        </p>
      </div>
      <div className="flex gap-1">
        {HASHING_STAGES.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 w-8 rounded-full transition-colors duration-500",
              i < stageIndex
                ? "bg-primary"
                : i === stageIndex
                ? "bg-primary/60"
                : "bg-border"
            )}
          />
        ))}
      </div>
    </div>
  );
}

export function Step5Upload({ data, onNext }: StepProps) {
  const [file, setFile] = useState<File | null>(data.file);
  const [isDragging, setIsDragging] = useState(false);
  const [isHashing, setIsHashing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setFile(f);
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  function handleNext() {
    setIsHashing(true);
  }

  function handleHashingComplete() {
    onNext({ file });
  }

  function formatSize(bytes: number) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <StepContent
      title="Загрузите вашу базу"
      subtitle="Файл с номерами телефонов. Данные будут автоматически захешированы перед отправкой"
    >
      <div className="flex flex-col gap-4">
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => !isHashing && inputRef.current?.click()}
          className={cn(
            "relative flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors",
            isDragging
              ? "border-primary bg-accent"
              : "border-border bg-card hover:border-primary/50 hover:bg-accent/50"
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />

          {isHashing ? (
            <HashingLoader onComplete={handleHashingComplete} />
          ) : file ? (
            <div className="flex flex-col items-center gap-1.5 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Upload className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">{file.name}</p>
              <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
              <p className="mt-1 text-xs text-muted-foreground underline-offset-2 hover:underline">
                Нажмите чтобы заменить
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Upload className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">
                Перетащите файл или нажмите для выбора
              </p>
            </div>
          )}
        </div>

        {/* File format hint */}
        <p className="text-center text-xs text-muted-foreground">
          Поддерживаемые форматы: CSV, XLSX, TXT · Максимальный размер: 50 МБ · До 1 000 000
          строк · Один номер на строку
        </p>

        <div className="flex justify-end">
          <Button disabled={!file || isHashing} onClick={handleNext}>
            Далее
          </Button>
        </div>
      </div>
    </StepContent>
  );
}
```

- [ ] **Step 2: Wire into `campaign-workspace.tsx`**

Add import:
```tsx
import { Step5Upload } from "@/components/steps/step-5-upload";
```

Add case:
```tsx
case 5:
  return <Step5Upload data={stepData} onNext={handleNext} />;
```

- [ ] **Step 3: Verify on localhost**

Flow through steps 1–5. Expected:
- Drop zone renders with upload icon
- Clicking opens file picker; selecting a file shows filename and size
- Drag a file onto the zone — border turns primary, releases and shows file info
- "Далее" disabled until file selected
- Clicking "Далее" triggers hashing loader: 3 stages type out one by one, progress dots fill
- After ~4s, automatically advances to step 6 placeholder

- [ ] **Step 4: Commit**

```bash
git add src/components/steps/step-5-upload.tsx src/components/campaign-workspace.tsx
git commit -m "feat: add Step5Upload with drag-drop and hashing animation"
```

---

## Task 10: Step 6 — Summary

**Files:**
- Create: `src/components/steps/step-6-summary.tsx`
- Modify: `src/components/campaign-workspace.tsx`

Read-only display of all collected stepData. No typewriter needed for the summary rows — only title/subtitle use it via `StepContent`.

- [ ] **Step 1: Create `src/components/steps/step-6-summary.tsx`**

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StepContent } from "@/components/steps/step-content";
import { StepProps } from "@/types/campaign";

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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export function Step6Summary({ data, onNext }: StepProps) {
  const limit = data.signalLimit ?? 0;
  const prices = data.segments.map((s) => SEGMENT_PRICES[s] ?? 0);
  const minCost = prices.length ? Math.min(...prices) * limit : 0;
  const maxCost = prices.length ? Math.max(...prices) * limit : 0;
  const costStr =
    minCost === maxCost
      ? `€ ${minCost.toFixed(2)}`
      : `€ ${minCost.toFixed(2)} – € ${maxCost.toFixed(2)}`;

  return (
    <StepContent
      title="Проверьте настройки кампании"
      subtitle="Если что-то нужно изменить — вернитесь к нужному шагу через навигацию"
    >
      <div className="rounded-lg border border-border bg-card">
        <div className="divide-y divide-border px-4">
          <SummaryRow
            label="Сценарий"
            value={SCENARIO_NAMES[data.scenario ?? ""] ?? "—"}
          />
          <SummaryRow
            label="Интересы"
            value={data.interests.length ? data.interests.join(", ") : "—"}
          />
          <SummaryRow
            label="Триггеры"
            value={data.triggers.length ? data.triggers.join(", ") : "—"}
          />
          <SummaryRow
            label="Сегменты"
            value={
              data.segments.length
                ? data.segments.map((s) => SEGMENT_NAMES[s]).join("; ")
                : "—"
            }
          />
          <SummaryRow
            label="Лимит сигналов"
            value={limit ? `${limit.toLocaleString("ru")} сигналов` : "—"}
          />
          <SummaryRow label="Ориентировочная стоимость" value={costStr} />
          <SummaryRow
            label="Файл с базой"
            value={data.file ? data.file.name : "—"}
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

- [ ] **Step 2: Wire into `campaign-workspace.tsx`**

Add import:
```tsx
import { Step6Summary } from "@/components/steps/step-6-summary";
```

Add case:
```tsx
case 6:
  return <Step6Summary data={stepData} onNext={handleNext} />;
```

- [ ] **Step 3: Verify on localhost**

Flow through steps 1–6. Expected:
- Summary shows all data collected in previous steps
- Scenario name is human-readable (not the id)
- Segments show price alongside name
- Cost range reflects selected segments × limit
- File name shows correctly
- "Подтвердить и запустить" advances to step 7

- [ ] **Step 4: Commit**

```bash
git add src/components/steps/step-6-summary.tsx src/components/campaign-workspace.tsx
git commit -m "feat: add Step6Summary with read-only display of all campaign settings"
```

---

## Task 11: Step 7 — Processing

**Files:**
- Create: `src/components/steps/step-7-processing.tsx`
- Modify: `src/components/campaign-workspace.tsx`

Full-screen animated progress bar. Auto-advances after ~4s. Stepper is non-clickable on this step (already handled in `CampaignStepper` via `disabled={currentStep === 7}` passed from workspace).

- [ ] **Step 1: Create `src/components/steps/step-7-processing.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { StepContent } from "@/components/steps/step-content";
import { StepProps } from "@/types/campaign";

const TOTAL_DURATION = 4000; // ms
const TICK = 50;

export function Step7Processing({ data, onNext }: StepProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const steps = TOTAL_DURATION / TICK;
    let count = 0;
    const id = setInterval(() => {
      count++;
      setProgress(Math.min((count / steps) * 100, 100));
      if (count >= steps) {
        clearInterval(id);
        setTimeout(() => onNext({}), 200);
      }
    }, TICK);
    return () => clearInterval(id);
  }, [onNext]);

  return (
    <StepContent
      title="Ваша кампания обрабатывается"
      subtitle="Это займёт некоторое время. Скоро вы получите сигналы"
      maxWidth="max-w-md"
    >
      <div className="flex flex-col gap-3">
        {/* Progress track */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={{ width: "0%" }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.05, ease: "linear" }}
          />
        </div>
        <p className="text-right text-xs tabular-nums text-muted-foreground">
          {Math.round(progress)}%
        </p>
      </div>
    </StepContent>
  );
}
```

- [ ] **Step 2: Wire into `campaign-workspace.tsx`**

Add import:
```tsx
import { Step7Processing } from "@/components/steps/step-7-processing";
```

Add case:
```tsx
case 7:
  return <Step7Processing data={stepData} onNext={handleNext} />;
```

- [ ] **Step 3: Verify on localhost**

Flow through steps 1–7. Expected:
- Processing screen appears with title + subtitle typing out
- Progress bar fills smoothly over ~4 seconds
- Percentage counter ticks up
- Stepper is visible but all items are not clickable (disabled)
- After 4s, automatically advances to step 8 placeholder

- [ ] **Step 4: Commit**

```bash
git add src/components/steps/step-7-processing.tsx src/components/campaign-workspace.tsx
git commit -m "feat: add Step7Processing with animated progress bar and auto-advance"
```

---

## Task 12: Step 8 — Result

**Files:**
- Create: `src/components/steps/step-8-result.tsx`
- Modify: `src/components/campaign-workspace.tsx`

Final screen. Mock signal count (random 80–95% of signalLimit). Download button logs to console. "Запустить кампанию" resets the wizard to step 1 (new flow).

- [ ] **Step 1: Create `src/components/steps/step-8-result.tsx`**

```tsx
"use client";

import { Download, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StepContent } from "@/components/steps/step-content";
import { StepProps } from "@/types/campaign";

export function Step8Result({ data, onNext }: StepProps) {
  // Mock signal count: 80–95% of limit
  const signalCount = data.signalLimit
    ? Math.floor(data.signalLimit * (0.8 + Math.random() * 0.15))
    : 0;

  function handleDownload() {
    console.log("Download signals", { signalCount, data });
  }

  return (
    <StepContent
      title="Мы собрали сигналы по вашей базе"
      subtitle="Файл готов к скачиванию"
      maxWidth="max-w-md"
    >
      <div className="flex flex-col gap-6">
        {/* Signal count */}
        <div className="rounded-lg border border-border bg-card px-6 py-5 text-center">
          <p className="text-4xl font-bold tabular-nums text-foreground">
            {signalCount.toLocaleString("ru")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">сигналов найдено</p>
        </div>

        <Button onClick={handleDownload} variant="outline" className="w-full gap-2">
          <Download className="h-4 w-4" />
          Скачать сигналы
        </Button>

        <Separator />

        {/* What's next */}
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
          <p className="text-sm font-medium text-foreground">Готовы к запуску?</p>
          <p className="text-sm text-muted-foreground">
            Используйте собранные сигналы для настройки рекламной кампании
          </p>
          <Button
            onClick={() => onNext({})}
            className="w-full gap-2"
          >
            <Zap className="h-4 w-4" />
            Запустить кампанию
          </Button>
        </div>
      </div>
    </StepContent>
  );
}
```

- [ ] **Step 2: Wire into `campaign-workspace.tsx`** — add import and case, plus reset logic

Add import:
```tsx
import { Step8Result } from "@/components/steps/step-8-result";
```

For step 8, `onNext` should reset the wizard. Add a dedicated handler in `WorkspaceInner`:

```tsx
function handleLaunchNew() {
  setStepData(initialStepData);
  setCurrentStep(1);
}
```

Import `initialStepData`:
```tsx
import { StepData, initialStepData } from "@/types/campaign";
```

Add case:
```tsx
case 8:
  return (
    <Step8Result
      data={stepData}
      onNext={handleLaunchNew}
    />
  );
```

Update `renderStep()` to use `handleLaunchNew` directly in case 8 — replace the `onNext={handleNext}` with `onNext={handleLaunchNew}`:
```tsx
case 8:
  return <Step8Result data={stepData} onNext={handleLaunchNew} />;
```

Make sure `handleLaunchNew` is defined inside `WorkspaceInner` before the `renderStep` function.

- [ ] **Step 3: Verify the complete flow end-to-end on localhost**

Flow through all 8 steps:
1. Scenario → click a card → animates to step 2
2. Interests/triggers → select some → Continue → step 3 (stepper: ✓ Интересы, active Сегменты)
3. Segments → select some → Continue → step 4
4. Limit → type a number → see cost update → Далее → step 5
5. Upload → drag or pick a file → Далее → hashing animation runs → step 6
6. Summary → verify all data shown correctly → Подтвердить и запустить → step 7
7. Processing → progress bar fills → auto-advance → step 8 (stepper: all ✓)
8. Result → signal count shown → Download logs to console → Запустить кампанию → resets to step 1 (stepper disappears, typewriter restarts)

Stepper back-navigation: at step 4, click stepper item "Интересы" → jumps to step 2 with previous selections preserved.

- [ ] **Step 4: Commit**

```bash
git add src/components/steps/step-8-result.tsx src/components/campaign-workspace.tsx
git commit -m "feat: add Step8Result and complete the campaign flow wizard"
```

---

## Self-Review

**Spec coverage:**
- ✅ Step 1: scenario grid 3×2, click → auto-advance, chat pre-fill
- ✅ Step 2: two groups (interests + triggers), multi-select, Continue disabled until one selected, hint text
- ✅ Step 3: 4 segments with price, multi-select checkboxes, Continue disabled
- ✅ Step 4: integer-only input, cost calculation, Далее disabled
- ✅ Step 5: drag-drop + click, formats listed, hashing animation 3 stages, typewriter per stage
- ✅ Step 6: read-only summary of all params, Подтвердить button
- ✅ Step 7: processing progress bar, no back-navigation (stepper disabled), auto-advance
- ✅ Step 8: signal count, download button, separator, "Готовы к запуску?" block with launch button
- ✅ Stepper: appears step 2+, completed/active/pending states, click completed → navigate back (data preserved), disabled on step 7
- ✅ Chat input on every step
- ✅ Transition animation: exit slides up, content types in

**Placeholder scan:** No TBD/TODO/implement-later. All code blocks complete.

**Type consistency:**
- `StepData` defined in Task 1, used identically in all step props
- `StepProps` interface: `data: StepData`, `onNext: (partial: Partial<StepData>) => void` — consistent across all steps
- `initialStepData` imported in Task 12 from same file as Task 1
- Segment IDs (`max`, `very-high`, `high`, `medium`) defined in Task 7 and reused identically in Tasks 8 and 10

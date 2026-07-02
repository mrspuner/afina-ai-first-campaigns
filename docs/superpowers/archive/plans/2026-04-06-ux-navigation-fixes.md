# UX Navigation Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four UX issues: signals section empty state, persistent step badge progress, LaunchFlyout wiring, and chat input placeholder pollution.

**Architecture:** All changes are in existing files — no new files created. `page.tsx` gains two persistent progress flags (`signalDone`, `campaignDone`) and two new handlers. `signal-type-view.tsx` becomes a pure empty state. `launch-flyout.tsx` gets action callbacks. `campaign-workspace.tsx` gains an `initialScenario` prop. `step-1-scenario.tsx` loses its input side-effect.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, React useState/useEffect

---

## File Map

| File | Change |
|---|---|
| `src/components/signal-type-view.tsx` | Replace 6 cards with empty state UI |
| `src/components/steps/step-1-scenario.tsx` | Remove `textInput.setInput()` side-effect |
| `src/app/page.tsx` | Add `signalDone`/`campaignDone` state, new handlers, update step logic, update placeholder, wire flyout |
| `src/components/launch-flyout.tsx` | Add `onSignalSelect`/`onCampaignSelect` props, wire card clicks |
| `src/components/campaign-workspace.tsx` | Add `initialScenario` prop, skip step 1 when provided |

---

## Task 1: SignalTypeView — Empty State

**Files:**
- Modify: `src/components/signal-type-view.tsx`
- Modify: `src/app/page.tsx:142` (caller)

- [ ] **Step 1: Replace signal-type-view.tsx**

Replace the entire file with:

```tsx
"use client";

import { StepContent } from "@/components/steps/step-content";

interface SignalTypeViewProps {
  onCreateSignal: () => void;
}

export function SignalTypeView({ onCreateSignal }: SignalTypeViewProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 pb-40 pt-10">
      <StepContent
        title="Нет сигналов"
        subtitle="Вы не создали ещё ни одного сигнала. Перед тем как запустить кампанию, сформируйте первый сигнал."
      >
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onCreateSignal}
            className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            Создать сигнал
          </button>
        </div>
      </StepContent>
    </div>
  );
}
```

- [ ] **Step 2: Update caller in page.tsx**

Find line 142 in `src/app/page.tsx`:
```tsx
if (activeNav === "Сигналы")    return <SignalTypeView onSelect={() => {}} />;
```

Replace with:
```tsx
if (activeNav === "Сигналы")    return <SignalTypeView onCreateSignal={handleStep1Click} />;
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "signal-type-view|page.tsx" | head -20
```

Expected: no output (no errors).

- [ ] **Step 4: Commit**

```bash
git add src/components/signal-type-view.tsx src/app/page.tsx
git commit -m "feat: signals section shows empty state instead of scenario cards"
```

---

## Task 2: Input Placeholder Fix

**Files:**
- Modify: `src/components/steps/step-1-scenario.tsx`
- Modify: `src/app/page.tsx:148-151`

- [ ] **Step 1: Remove input side-effect from step-1-scenario.tsx**

Open `src/components/steps/step-1-scenario.tsx`. Remove these two lines:

```tsx
// DELETE this import:
import { usePromptInputController } from "@/components/ai-elements/prompt-input";

// DELETE this line inside handleSelect:
textInput.setInput(`Сценарий: ${name}. `);

// DELETE this line inside Step1Scenario:
const { textInput } = usePromptInputController();
```

The final `handleSelect` function becomes:
```tsx
function handleSelect(id: string, name: string) {
  onNext({ scenario: id });
}
```

The full file after changes:
```tsx
"use client";

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
  function handleSelect(id: string, name: string) {
    onNext({ scenario: id });
  }

  return (
    <StepContent
      title="Выберите тип сигнала"
      subtitle="Выберите сценарий, мы зададим нужные вопросы"
    >
      <div className="grid grid-cols-3 gap-3">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
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

- [ ] **Step 2: Update chatPlaceholder in page.tsx**

Find lines 148-151 in `src/app/page.tsx`:
```tsx
const chatPlaceholder =
  isWorkflow              ? "Опишите изменение сценария..." :
  flowPhase === "campaign"? "Опишите вашу кампанию..."      :
                            "Выберите шаг или задайте вопрос…";
```

Replace with:
```tsx
const chatPlaceholder =
  isWorkflow               ? "Опишите изменение сценария..."                :
  flowPhase === "campaign" ? "Опишите вашу кампанию..."                     :
  flowPhase === "signal"   ? "Введите ваши параметры или задайте вопрос"    :
                             "Выберите шаг или задайте вопрос…";
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "step-1-scenario|page.tsx" | head -20
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/components/steps/step-1-scenario.tsx src/app/page.tsx
git commit -m "fix: remove input pollution on scenario select, update signal flow placeholder"
```

---

## Task 3: Global Step Badge Progress

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add signalDone and campaignDone state**

In `src/app/page.tsx`, after the existing `useState` declarations (after line 44), add:

```tsx
const [signalDone,    setSignalDone]    = useState(false);
const [campaignDone,  setCampaignDone]  = useState(false);
```

- [ ] **Step 2: Update handleSignalComplete to set signalDone**

Find `handleSignalComplete`:
```tsx
function handleSignalComplete() {
  setFlowPhase("campaign");
}
```

Replace with:
```tsx
function handleSignalComplete() {
  setSignalDone(true);
  setFlowPhase("campaign");
}
```

- [ ] **Step 3: Update "Начать кампанию" button to set campaignDone**

Find line 184 in `src/app/page.tsx`:
```tsx
onClick={() => setWorkflowLaunched(true)}
```

Replace with:
```tsx
onClick={() => { setWorkflowLaunched(true); setCampaignDone(true); }}
```

- [ ] **Step 4: Replace step active logic**

Find lines 117-119:
```tsx
const step1Active = onWelcome || flowPhase === "signal";
const step2Active = flowPhase === "awaiting-campaign" || (flowPhase === "campaign" && !workflowLaunched);
const step3Active = workflowLaunched;
```

Replace with:
```tsx
const step1Active = !signalDone;
const step2Active = signalDone && !campaignDone;
const step3Active = campaignDone;
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "page.tsx" | head -20
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: persistent signalDone/campaignDone progress flags drive step badges"
```

---

## Task 4: LaunchFlyout Wiring

**Files:**
- Modify: `src/components/launch-flyout.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/components/campaign-workspace.tsx`

### 4a — LaunchFlyout callbacks

- [ ] **Step 1: Replace launch-flyout.tsx**

Replace the entire file with:

```tsx
"use client";

import { X } from "lucide-react";

interface LaunchFlyoutProps {
  open: boolean;
  onClose: () => void;
  onSignalSelect: (id: string, name: string) => void;
  onCampaignSelect: () => void;
}

const signalCards = [
  { id: "registration",  title: "Регистрация",    description: "Возврат пользователей после незавершённой регистрации или брошенной корзины" },
  { id: "first-deal",    title: "Первая сделка",  description: "Обогащение данных о клиенте, оценка потенциала и рисков" },
  { id: "upsell",        title: "Апсейл",         description: "Мониторинг интереса к конкурентам, предотвращение оттока" },
  { id: "retention",     title: "Удержание",      description: "Мониторинг интереса к конкурентам и предотвращение оттока" },
  { id: "return",        title: "Возврат",        description: "Определение оптимального момента для повторного контакта" },
  { id: "reactivation",  title: "Реактивация",    description: "Определение оптимального момента для повторного контакта" },
];

const campaignCards = [
  { title: "Возврат брошенных действий",          description: "Возвращаем пользователей, не завершивших действие, через персонализированные касания" },
  { title: "Прогрев до следующего шага",           description: "Увеличиваем конверсию через серию касаний с нарастающей ценностью" },
  { title: "Стимулирование повторной активности",  description: "Возвращаем интерес пользователей через офферы и релевантные напоминания" },
  { title: "Удержание через поведенческие триггеры", description: "Предотвращаем отток через своевременные реакции на изменения поведения" },
  { title: "Реактивация через адаптивный сценарий", description: "Перестраиваем коммуникацию по сегментам, реакции и времени отклика пользователей" },
];

export function LaunchFlyout({ open, onClose, onSignalSelect, onCampaignSelect }: LaunchFlyoutProps) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />

      <div className="fixed inset-y-0 left-[120px] z-50 flex w-[360px] flex-col bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Запустить</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-2">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-foreground">
              Запустить поиск сигналов
            </p>
            <div className="flex flex-col gap-2">
              {signalCards.map((card) => (
                <button
                  key={card.id}
                  onClick={() => { onSignalSelect(card.id, card.title); onClose(); }}
                  className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent"
                >
                  <p className="text-sm font-medium text-foreground">{card.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{card.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-foreground">
              Запустить новую кампанию
            </p>
            <div className="flex flex-col gap-2">
              {campaignCards.map((card) => (
                <button
                  key={card.title}
                  onClick={() => { onCampaignSelect(); onClose(); }}
                  className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent"
                >
                  <p className="text-sm font-medium text-foreground">{card.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{card.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
```

### 4b — page.tsx: new state + handlers + flyout wiring

- [ ] **Step 2: Add initialScenario state to page.tsx**

After the `workflowCommand` state declaration (line 44), add:

```tsx
const [initialScenario, setInitialScenario] = useState<{ id: string; name: string } | null>(null);
```

- [ ] **Step 3: Add handleLaunchSignal and handleLaunchCampaign handlers**

After `handleGoToStats` in page.tsx, add:

```tsx
function handleLaunchSignal(id: string, name: string) {
  setLaunchOpen(false);
  setActiveNav(null);
  setInitialScenario({ id, name });
  setFlowPhase("signal");
}

function handleLaunchCampaign() {
  setLaunchOpen(false);
  if (!signalDone) {
    setActiveNav("Сигналы");
    setFlowPhase(null);
  } else {
    setActiveNav(null);
    setFlowPhase("campaign");
  }
}
```

- [ ] **Step 4: Wire LaunchFlyout in page.tsx JSX**

Find line 165:
```tsx
<LaunchFlyout open={launchOpen} onClose={() => setLaunchOpen(false)} />
```

Replace with:
```tsx
<LaunchFlyout
  open={launchOpen}
  onClose={() => setLaunchOpen(false)}
  onSignalSelect={handleLaunchSignal}
  onCampaignSelect={handleLaunchCampaign}
/>
```

- [ ] **Step 5: Pass initialScenario to CampaignWorkspace**

Find line 124:
```tsx
return <CampaignWorkspace onSignalComplete={handleSignalComplete} onStep8Reached={handleStep8Reached} />;
```

Replace with:
```tsx
return (
  <CampaignWorkspace
    onSignalComplete={handleSignalComplete}
    onStep8Reached={handleStep8Reached}
    initialScenario={initialScenario ?? undefined}
  />
);
```

Also clear `initialScenario` when navigating away so a stale scenario is never reused. In `handleNavChange`, add:
```tsx
setInitialScenario(null);
```
And in `handleSignalComplete`, add:
```tsx
setInitialScenario(null);
```

### 4c — CampaignWorkspace: initialScenario prop

- [ ] **Step 6: Update CampaignWorkspace**

In `src/components/campaign-workspace.tsx`, update `WorkspaceInner` to accept and use `initialScenario`:

Find the `WorkspaceInner` function signature:
```tsx
function WorkspaceInner({ onSignalComplete, onStep8Reached }: { onSignalComplete?: () => void; onStep8Reached?: () => void }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);
  const [animatingStep, setAnimatingStep] = useState<number | null>(1);
  const [stepData, setStepData] = useState<StepData>(initialStepData);
```

Replace with:
```tsx
function WorkspaceInner({
  onSignalComplete,
  onStep8Reached,
  initialScenario,
}: {
  onSignalComplete?: () => void;
  onStep8Reached?: () => void;
  initialScenario?: { id: string; name: string };
}) {
  const startStep = initialScenario ? 2 : 1;
  const [currentStep, setCurrentStep] = useState(startStep);
  const [maxStep, setMaxStep] = useState(startStep);
  const [animatingStep, setAnimatingStep] = useState<number | null>(startStep);
  const [stepData, setStepData] = useState<StepData>(
    initialScenario
      ? { ...initialStepData, scenario: initialScenario.id }
      : initialStepData
  );
```

Also update the exported wrapper at the bottom of the file:

Find:
```tsx
export function CampaignWorkspace({ onSignalComplete, onStep8Reached }: { onSignalComplete?: () => void; onStep8Reached?: () => void } = {}) {
  return <WorkspaceInner onSignalComplete={onSignalComplete} onStep8Reached={onStep8Reached} />;
}
```

Replace with:
```tsx
export function CampaignWorkspace({
  onSignalComplete,
  onStep8Reached,
  initialScenario,
}: {
  onSignalComplete?: () => void;
  onStep8Reached?: () => void;
  initialScenario?: { id: string; name: string };
} = {}) {
  return (
    <WorkspaceInner
      onSignalComplete={onSignalComplete}
      onStep8Reached={onStep8Reached}
      initialScenario={initialScenario}
    />
  );
}
```

- [ ] **Step 7: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "launch-flyout|campaign-workspace|page.tsx" | head -20
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/components/launch-flyout.tsx src/app/page.tsx src/components/campaign-workspace.tsx
git commit -m "feat: wire LaunchFlyout — signal launches flow at step 2, campaign checks signalDone"
```

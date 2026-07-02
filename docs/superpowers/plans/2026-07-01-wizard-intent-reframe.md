# Wizard Intent Reframe — Implementation Plan (Часть I)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe wizard step 2 from source («Откуда берём аудиторию?») to intent («Что хотите получить?») with three paths A/B/C, add a «Режим анализа» step, make file upload explicit in every path, and make communication channels mandatory (drop the «Получить только сигналы» escape).

**Architecture:** Introduce `intent` (A/B/C) + `analysisMode` (once/stream) as the new branch keys in `StepData`, keep the existing `sourceType` as a **derived** value (`deriveSourceType`) so the ~30 downstream read-sites (budget, workflow templates, progress, presets, reducer) keep working untouched. Reshape `stepsForSource → stepsForIntent`, add an `analysis` step id + `StepAnalysis` component, swap `StepSource → StepIntent`, and clean up `StepChannels`. Reuse the existing navigation/reset state machine (`computeStepTransition`) — only the branch-change key changes (`sourceChanged → intentChanged`).

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, shadcn/base-ui, Vitest + React Testing Library (jsdom), Playwright (e2e + visual).

**Working directory:** worktree `.worktrees/wizard-intent-reframe` (branch `feature/wizard-intent-reframe`, off `integration`). Run all commands there. Spec: `docs/superpowers/specs/2026-07-01-wizard-intent-reframe-design.md` (Часть I, §1–11).

**Conventions:**
- Run a single test file: `npx vitest run <path>`
- Typecheck: `npx tsc --noEmit`
- Tests stub the typewriter wrapper: `vi.mock("@/sections/campaigns/wizard/steps/step-content", ...)` (see existing `step-source.test.tsx`).
- Commit messages follow repo style: `feat(wizard): …`, `test(wizard): …`, Russian summary.

---

## Task 1: Data model — `intent`, `analysisMode`, `deriveSourceType`

**Files:**
- Modify: `src/types/campaign.ts`
- Test: `src/types/campaign.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/types/campaign.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveSourceType, initialStepData } from "./campaign";

describe("deriveSourceType", () => {
  it("comms-own → own regardless of analysis mode", () => {
    expect(deriveSourceType("comms-own", "once")).toBe("own");
    expect(deriveSourceType("comms-own", "stream")).toBe("own");
  });
  it("signals / signals-comms + once → new", () => {
    expect(deriveSourceType("signals", "once")).toBe("new");
    expect(deriveSourceType("signals-comms", "once")).toBe("new");
  });
  it("signals / signals-comms + stream → stream", () => {
    expect(deriveSourceType("signals", "stream")).toBe("stream");
    expect(deriveSourceType("signals-comms", "stream")).toBe("stream");
  });
});

describe("initialStepData defaults", () => {
  it("intent=signals-comms, analysisMode=once, sourceType stays consistent", () => {
    expect(initialStepData.intent).toBe("signals-comms");
    expect(initialStepData.analysisMode).toBe("once");
    expect(initialStepData.sourceType).toBe(
      deriveSourceType(initialStepData.intent, initialStepData.analysisMode),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/types/campaign.test.ts`
Expected: FAIL — `deriveSourceType` is not exported / `intent` undefined.

- [ ] **Step 3: Add types, helper, and StepData fields**

In `src/types/campaign.ts`, after the `SourceType` definition (line 3) add:

```ts
export type CampaignIntent = "signals" | "signals-comms" | "comms-own";
export type AnalysisMode = "once" | "stream";

/**
 * The legacy `sourceType` is kept as a DERIVED value so the ~30 downstream
 * read-sites (budget, workflow templates, progress, presets, reducer) keep
 * working unchanged. Intent decides the branch; analysisMode decides
 * one-time vs streaming.
 */
export function deriveSourceType(
  intent: CampaignIntent,
  analysisMode: AnalysisMode,
): SourceType {
  if (intent === "comms-own") return "own";
  return analysisMode === "stream" ? "stream" : "new";
}
```

In `interface StepData`, add two required fields (next to `sourceType`):

```ts
  /** Step-2 branch key (A/B/C). Replaces sourceType as the primary branch. */
  intent: CampaignIntent;
  /** Разовый / потоковый — only meaningful for intents A and B. */
  analysisMode: AnalysisMode;
```

In `initialStepData`, add the defaults (keep `sourceType: "new"`, which equals `deriveSourceType("signals-comms","once")`):

```ts
  intent: "signals-comms",
  analysisMode: "once",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/types/campaign.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck (only `initialStepData` constructs a StepData literal)**

Run: `npx tsc --noEmit`
Expected: no errors. (Grep confirmed `initialStepData` is the only full StepData literal; everything else spreads `...initialStepData`.)

- [ ] **Step 6: Commit**

```bash
git add src/types/campaign.ts src/types/campaign.test.ts
git commit -m "feat(wizard): intent + analysisMode модель, deriveSourceType (sourceType теперь производный)"
```

---

## Task 2: `StepIntent` component (step-2 picker)

**Files:**
- Create: `src/sections/campaigns/wizard/steps/step-intent.tsx`
- Test: `src/sections/campaigns/wizard/steps/step-intent.test.tsx` (create)

This is additive (new file) — safe to land before the cutover. `StepSource` stays until Task 5.

- [ ] **Step 1: Write the failing test**

Create `step-intent.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { canContinueFromIntent, StepIntent } from "./step-intent";
import { initialStepData, type StepData } from "@/types/campaign";

vi.mock("@/sections/campaigns/wizard/steps/step-content", () => ({
  StepContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("canContinueFromIntent", () => {
  it("true once an intent is chosen (all three valid)", () => {
    expect(canContinueFromIntent("signals")).toBe(true);
    expect(canContinueFromIntent("signals-comms")).toBe(true);
    expect(canContinueFromIntent("comms-own")).toBe(true);
  });
});

describe("StepIntent", () => {
  afterEach(cleanup);

  function renderStep(over: Partial<StepData> = {}) {
    const data: StepData = { ...initialStepData, ...over };
    const onNext = vi.fn();
    render(<StepIntent data={data} onNext={onNext} onBack={vi.fn()} />);
    return { onNext };
  }

  it("defaults to «Сигналы + коммуникация» (initialStepData.intent)", () => {
    renderStep();
    expect(
      screen.getByRole("button", { name: /Сигналы \+ коммуникация/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("switches intent on click and emits it (with derived sourceType) on continue", () => {
    const { onNext } = renderStep();
    fireEvent.click(screen.getByRole("button", { name: /Коммуникация по своим сигналам/i }));
    fireEvent.click(screen.getByRole("button", { name: /Далее/i }));
    expect(onNext).toHaveBeenCalledWith({ intent: "comms-own", sourceType: "own" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sections/campaigns/wizard/steps/step-intent.test.tsx`
Expected: FAIL — module `./step-intent` not found.

- [ ] **Step 3: Create the component**

Create `src/sections/campaigns/wizard/steps/step-intent.tsx`:

```tsx
"use client";

import { useState } from "react";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepFooter } from "@/sections/campaigns/wizard/steps/step-footer";
import { StepProps, deriveSourceType, type CampaignIntent } from "@/types/campaign";
import { cn } from "@/lib/utils";

interface IntentOption {
  value: CampaignIntent;
  label: string;
  description: string;
}

const INTENT_OPTIONS: IntentOption[] = [
  { value: "signals", label: "Только сигналы", description: "Соберём горячую аудиторию по интент-сигналам." },
  { value: "signals-comms", label: "Сигналы + коммуникация", description: "Соберём аудиторию и запустим по ней рекламу." },
  { value: "comms-own", label: "Коммуникация по своим сигналам", description: "Загрузите свою базу — запустим по ней коммуникацию." },
];

/** Pure continue-gate: an intent must be selected (always true given the default). */
export function canContinueFromIntent(intent: CampaignIntent): boolean {
  return Boolean(intent);
}

function RadioDot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute right-3 top-3 h-3 w-3 rounded-full border-2 transition-colors",
        active ? "border-foreground bg-foreground" : "border-border bg-transparent",
      )}
    />
  );
}

export function StepIntent({ data, onNext, onBack }: StepProps) {
  const [intent, setIntent] = useState<CampaignIntent>(() => data.intent);
  const canContinue = canContinueFromIntent(intent);

  return (
    <StepContent
      title="Что хотите получить?"
      subtitle="Выберите, что нужно на выходе — остальное настроим под это."
    >
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-3 gap-3">
          {INTENT_OPTIONS.map((opt) => {
            const active = intent === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setIntent(opt.value)}
                aria-pressed={active}
                className={cn(
                  "relative flex h-[120px] flex-col items-start gap-1.5 rounded-lg border p-4 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  active ? "border-brand/60 bg-brand-muted" : "border-border bg-card hover:bg-accent/50",
                )}
              >
                <RadioDot active={active} />
                <span className={cn("text-sm font-medium", active ? "text-foreground" : "text-muted-foreground")}>
                  {opt.label}
                </span>
                <span className="text-xs text-muted-foreground">{opt.description}</span>
              </button>
            );
          })}
        </div>

        <StepFooter
          onBack={onBack}
          onContinue={() => onNext({ intent, sourceType: deriveSourceType(intent, data.analysisMode) })}
          continueLabel="Далее"
          continueDisabled={!canContinue}
        />
      </div>
    </StepContent>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sections/campaigns/wizard/steps/step-intent.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/campaigns/wizard/steps/step-intent.tsx src/sections/campaigns/wizard/steps/step-intent.test.tsx
git commit -m "feat(wizard): StepIntent — развилка «Что хотите получить?» (A/B/C)"
```

---

## Task 3: `StepAnalysis` component (Режим анализа)

**Files:**
- Create: `src/sections/campaigns/wizard/steps/step-analysis.tsx`
- Test: `src/sections/campaigns/wizard/steps/step-analysis.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `step-analysis.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { canContinueFromAnalysis, StepAnalysis } from "./step-analysis";
import { initialStepData, type StepData } from "@/types/campaign";

vi.mock("@/sections/campaigns/wizard/steps/step-content", () => ({
  StepContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("canContinueFromAnalysis", () => {
  it("true once a mode is chosen", () => {
    expect(canContinueFromAnalysis("once")).toBe(true);
    expect(canContinueFromAnalysis("stream")).toBe(true);
  });
});

describe("StepAnalysis", () => {
  afterEach(cleanup);

  function renderStep(over: Partial<StepData> = {}) {
    const data: StepData = { ...initialStepData, intent: "signals", ...over };
    const onNext = vi.fn();
    render(<StepAnalysis data={data} onNext={onNext} onBack={vi.fn()} />);
    return { onNext };
  }

  it("defaults to «Разовый» (initialStepData.analysisMode)", () => {
    renderStep();
    expect(screen.getByRole("button", { name: /Разовый/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("picking «Потоковый» emits analysisMode + derived sourceType (stream)", () => {
    const { onNext } = renderStep({ intent: "signals" });
    fireEvent.click(screen.getByRole("button", { name: /Потоковый/i }));
    fireEvent.click(screen.getByRole("button", { name: /Далее/i }));
    expect(onNext).toHaveBeenCalledWith({ analysisMode: "stream", sourceType: "stream" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sections/campaigns/wizard/steps/step-analysis.test.tsx`
Expected: FAIL — module `./step-analysis` not found.

- [ ] **Step 3: Create the component**

Create `src/sections/campaigns/wizard/steps/step-analysis.tsx`:

```tsx
"use client";

import { useState } from "react";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepFooter } from "@/sections/campaigns/wizard/steps/step-footer";
import { StepProps, deriveSourceType, type AnalysisMode } from "@/types/campaign";
import { cn } from "@/lib/utils";

interface AnalysisOption {
  value: AnalysisMode;
  label: string;
  description: string;
}

const ANALYSIS_OPTIONS: AnalysisOption[] = [
  { value: "once", label: "Разовый", description: "Проверим базу один раз и соберём аудиторию." },
  { value: "stream", label: "Потоковый", description: "Будем постоянно отслеживать новые сигналы." },
];

/** Pure continue-gate: a mode must be selected (always true given the default). */
export function canContinueFromAnalysis(mode: AnalysisMode): boolean {
  return Boolean(mode);
}

function RadioDot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute right-3 top-3 h-3 w-3 rounded-full border-2 transition-colors",
        active ? "border-foreground bg-foreground" : "border-border bg-transparent",
      )}
    />
  );
}

export function StepAnalysis({ data, onNext, onBack }: StepProps) {
  const [mode, setMode] = useState<AnalysisMode>(() => data.analysisMode);
  const canContinue = canContinueFromAnalysis(mode);

  return (
    <StepContent
      title="Разовый или потоковый анализ?"
      subtitle="Как собирать сигналы — один раз или непрерывно."
    >
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3">
          {ANALYSIS_OPTIONS.map((opt) => {
            const active = mode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMode(opt.value)}
                aria-pressed={active}
                className={cn(
                  "relative flex h-[120px] flex-col items-start gap-1.5 rounded-lg border p-4 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  active ? "border-brand/60 bg-brand-muted" : "border-border bg-card hover:bg-accent/50",
                )}
              >
                <RadioDot active={active} />
                <span className={cn("text-sm font-medium", active ? "text-foreground" : "text-muted-foreground")}>
                  {opt.label}
                </span>
                <span className="text-xs text-muted-foreground">{opt.description}</span>
              </button>
            );
          })}
        </div>

        <StepFooter
          onBack={onBack}
          onContinue={() => onNext({ analysisMode: mode, sourceType: deriveSourceType(data.intent, mode) })}
          continueLabel="Далее"
          continueDisabled={!canContinue}
        />
      </div>
    </StepContent>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sections/campaigns/wizard/steps/step-analysis.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/campaigns/wizard/steps/step-analysis.tsx src/sections/campaigns/wizard/steps/step-analysis.test.tsx
git commit -m "feat(wizard): StepAnalysis — шаг «Режим анализа» (разовый/потоковый)"
```

---

## Task 4: `StepChannels` — drop «Получить только сигналы», channels mandatory

**Files:**
- Modify: `src/sections/campaigns/wizard/steps/step-channels.tsx`
- Test: `src/sections/campaigns/wizard/steps/step-channels.test.tsx`

Independent of the cutover — safe to land any time.

- [ ] **Step 1: Update the test to the new contract**

In `step-channels.test.tsx`, replace any test that references `noComms` / «Получить только сигналы» / «Без коммуникации» with these (keep existing `toggleChannel`/`formatUnitCost` tests):

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { StepChannels } from "./step-channels";
import { initialStepData, type StepData } from "@/types/campaign";

vi.mock("@/sections/campaigns/wizard/steps/step-content", () => ({
  StepContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("StepChannels — channels are mandatory (no «только сигналы» escape)", () => {
  afterEach(cleanup);

  function renderStep(over: Partial<StepData> = {}) {
    const data: StepData = { ...initialStepData, channels: [], ...over };
    const onNext = vi.fn();
    render(<StepChannels data={data} onNext={onNext} onBack={vi.fn()} />);
    return { onNext };
  }

  it("does NOT render the «Получить только сигналы» option", () => {
    renderStep();
    expect(screen.queryByText("Получить только сигналы")).toBeNull();
  });

  it("«Далее» is disabled with no channels and enabled after selecting one", () => {
    renderStep();
    expect(screen.getByRole("button", { name: /Далее/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /SMS/i }));
    expect(screen.getByRole("button", { name: /Далее/i })).not.toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sections/campaigns/wizard/steps/step-channels.test.tsx`
Expected: FAIL — «Получить только сигналы» still rendered / continue enabled with empty channels.

- [ ] **Step 3: Edit `step-channels.tsx`**

Remove the `noComms` state, the `selectNoComms` handler, and the entire «Получить только сигналы» button block plus the `border-t` divider above it. Specifically:

Delete the state + reset lines (were 29–39):
```tsx
  // "Без коммуникации" — explicit degenerate-campaign choice (empty channels).
  const [noComms, setNoComms] = useState(false);

  function toggle(channel: Channel) {
    setNoComms(false);
    setChannels((prev) => toggleChannel(prev, channel));
  }

  function selectNoComms() {
    setNoComms(true);
    setChannels([]);
  }
```
Replace with:
```tsx
  function toggle(channel: Channel) {
    setChannels((prev) => toggleChannel(prev, channel));
  }
```

Change the continue-gate (was line 43):
```tsx
  // Communication is mandatory here: signals-only is now path A (chosen at step 2).
  const canContinue = channels.length > 0;
```

Delete the divider + «Получить только сигналы» block (was lines 90–115): the `<div className="border-t border-border" />` and the whole `<button … onClick={selectNoComms} …>…Получить только сигналы…</button>`.

Update the subtitle (was line 48) to drop the "или запустите без неё" clause:
```tsx
      subtitle="Выберите каналы коммуникации."
```

Remove the now-unused `useState` import if nothing else uses it (check the top of the file — `channels` still uses `useState`, so keep it).

- [ ] **Step 4: Run test + full step-channels suite**

Run: `npx vitest run src/sections/campaigns/wizard/steps/step-channels.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/campaigns/wizard/steps/step-channels.tsx src/sections/campaigns/wizard/steps/step-channels.test.tsx
git commit -m "feat(wizard): каналы обязательны — убрать «Получить только сигналы» (переехало в шаг 2)"
```

---

## Task 5: Cutover — flip the wizard from source to intent

Renaming `stepsForSource → stepsForIntent`, `SOURCE_STEP → INTENT_STEP`, `sourceChanged → intentChanged`, `StepSource → StepIntent`, and reshaping `WizardStepId` are mutually dependent at compile time, so they land in ONE commit. Edit every file, then typecheck, then run the whole suite, then a manual smoke.

**Files:**
- Modify: `src/sections/campaigns/wizard/wizard-steps.ts`
- Modify: `src/sections/campaigns/wizard/wizard-steps.test.ts`
- Modify: `src/sections/campaigns/wizard/campaign-stepper.tsx`
- Modify: `src/sections/campaigns/wizard/campaign-stepper.test.ts`
- Modify: `src/sections/campaigns/wizard/wizard-navigation.ts`
- Modify: `src/sections/campaigns/wizard/wizard-navigation.test.ts`
- Modify: `src/sections/campaigns/wizard/campaign-workspace.tsx`
- Modify: `src/sections/shell/use-chat-submit.ts`
- Delete: `src/sections/campaigns/wizard/steps/step-source.tsx`, `src/sections/campaigns/wizard/steps/step-source.test.tsx`

- [ ] **Step 1: Update `wizard-steps.test.ts`**

Replace its whole body with:

```ts
import { describe, expect, it } from "vitest";
import { stepsForIntent } from "./wizard-steps";

describe("stepsForIntent", () => {
  it("signals (A): scenario, intent, interests, analysis, file, budget — no channels", () => {
    expect(stepsForIntent("signals")).toEqual(
      ["scenario", "intent", "interests", "analysis", "file", "budget"],
    );
    expect(stepsForIntent("signals")).not.toContain("channels");
  });
  it("signals-comms (B): scenario, intent, interests, analysis, file, channels, budget", () => {
    expect(stepsForIntent("signals-comms")).toEqual(
      ["scenario", "intent", "interests", "analysis", "file", "channels", "budget"],
    );
  });
  it("comms-own (C): scenario, intent, file, channels, budget — no interests/analysis", () => {
    expect(stepsForIntent("comms-own")).toEqual(
      ["scenario", "intent", "file", "channels", "budget"],
    );
    expect(stepsForIntent("comms-own")).not.toContain("interests");
    expect(stepsForIntent("comms-own")).not.toContain("analysis");
  });
  it("before an intent is chosen, only scenario+intent are known", () => {
    expect(stepsForIntent(undefined)).toEqual(["scenario", "intent"]);
  });
});
```

- [ ] **Step 2: Rewrite `wizard-steps.ts`**

```ts
import type { CampaignIntent } from "@/types/campaign";

export type WizardStepId =
  | "scenario" | "intent" | "interests" | "analysis" | "file" | "integration" | "channels" | "budget";

/**
 * The ordered wizard step list depends on the chosen intent (spec Часть I).
 * Until an intent is picked only scenario+intent are determined.
 *  - signals (A)        → interests, analysis, file, budget (no channels)
 *  - signals-comms (B)  → interests, analysis, file, channels, budget
 *  - comms-own (C)      → file, channels, budget (own base, no interests/analysis)
 */
export function stepsForIntent(intent: CampaignIntent | undefined): WizardStepId[] {
  const head: WizardStepId[] = ["scenario", "intent"];
  if (!intent) return head;
  const tail: WizardStepId[] =
    intent === "signals" ? ["interests", "analysis", "file", "budget"]
    : intent === "signals-comms" ? ["interests", "analysis", "file", "channels", "budget"]
    : ["file", "channels", "budget"]; // comms-own
  return [...head, ...tail];
}
```

- [ ] **Step 3: Update `campaign-stepper.tsx` labels**

Replace `STEP_LABELS` (lines 8–16):

```ts
export const STEP_LABELS: Record<WizardStepId, string> = {
  scenario: "Сценарий",
  intent: "Цель",
  interests: "Интересы",
  analysis: "Режим",
  file: "Файл",
  integration: "Интеграция",
  channels: "Каналы",
  budget: "Бюджет",
};
```

- [ ] **Step 4: Update `campaign-stepper.test.ts`**

Replace its body:

```ts
import { describe, expect, it } from "vitest";
import { STEP_LABELS } from "./campaign-stepper";
import { stepsForIntent } from "./wizard-steps";

describe("STEP_LABELS", () => {
  it("maps every wizard step id to a Russian label", () => {
    expect(STEP_LABELS).toEqual({
      scenario: "Сценарий",
      intent: "Цель",
      interests: "Интересы",
      analysis: "Режим",
      file: "Файл",
      integration: "Интеграция",
      channels: "Каналы",
      budget: "Бюджет",
    });
  });

  it("labels every step in each intent-gated sequence", () => {
    for (const intent of ["signals", "signals-comms", "comms-own"] as const) {
      const labels = stepsForIntent(intent).map((id) => STEP_LABELS[id]);
      expect(labels.every((l) => typeof l === "string" && l.length > 0)).toBe(true);
    }
  });

  it("A path renders Сценарий→Цель→Интересы→Режим→Файл→Бюджет (no Каналы)", () => {
    expect(stepsForIntent("signals").map((id) => STEP_LABELS[id])).toEqual([
      "Сценарий", "Цель", "Интересы", "Режим", "Файл", "Бюджет",
    ]);
  });

  it("C path omits Интересы and Режим", () => {
    const labels = stepsForIntent("comms-own").map((id) => STEP_LABELS[id]);
    expect(labels).not.toContain("Интересы");
    expect(labels).not.toContain("Режим");
    expect(labels).toContain("Каналы");
  });
});
```

- [ ] **Step 5: Update `wizard-navigation.ts`**

Rename the constant and the transition arg. Replace lines 4–5 and the `computeStepTransition` signature/body:

```ts
/** The wizard step on which the intent is chosen (StepIntent). */
export const INTENT_STEP = 2;
```

In `computeStepTransition`, rename `sourceChanged` → `intentChanged` everywhere and use `INTENT_STEP`:

```ts
export function computeStepTransition(args: {
  currentStep: number;
  maxStep: number;
  scenarioChanged: boolean;
  intentChanged?: boolean;
}): StepTransition {
  const { currentStep, maxStep, scenarioChanged, intentChanged } = args;

  if (scenarioChanged) {
    return { step: SCENARIO_STEP + 1, resetData: true };
  }

  if (intentChanged) {
    return { step: INTENT_STEP + 1, resetData: true };
  }

  if (currentStep < maxStep) {
    return { step: maxStep, resetData: false };
  }

  return { step: currentStep + 1, resetData: false };
}
```

Update the doc comment for case 2 to say "Intent changed — the chosen intent decides the tail of the step list … rewind to `INTENT_STEP` + 1".

- [ ] **Step 6: Update `wizard-navigation.test.ts`**

Replace every `sourceChanged` with `intentChanged`, and any `SOURCE_STEP` import/reference with `INTENT_STEP`. The transition values are unchanged (INTENT_STEP === SOURCE_STEP === 2), so only the names change. Example of the key case:

```ts
it("intent changed → rewind to INTENT_STEP + 1 with reset", () => {
  expect(
    computeStepTransition({ currentStep: 5, maxStep: 6, scenarioChanged: false, intentChanged: true }),
  ).toEqual({ step: 3, resetData: true });
});
```

- [ ] **Step 7: Rewire `campaign-workspace.tsx`**

Edit the imports (lines 9–16): remove the `StepSource` import; add `StepIntent` and `StepAnalysis`; rename `stepsForSource` → `stepsForIntent`:

```tsx
import { StepIntent } from "@/sections/campaigns/wizard/steps/step-intent";
import { Step2Interests } from "@/sections/campaigns/wizard/steps/step-2-interests";
import { StepAnalysis } from "@/sections/campaigns/wizard/steps/step-analysis";
import { StepFile } from "@/sections/campaigns/wizard/steps/step-file";
import { StepIntegration } from "@/sections/campaigns/wizard/steps/step-integration";
import { StepChannels } from "@/sections/campaigns/wizard/steps/step-channels";
import { StepBudget } from "@/sections/campaigns/wizard/steps/step-budget";
import { computeStepTransition } from "@/sections/campaigns/wizard/wizard-navigation";
import { stepsForIntent } from "@/sections/campaigns/wizard/wizard-steps";
```

In `handleNext` (lines 104–106), replace the `sourceChanged` detection with intent:

```tsx
      const intentChanged =
        partial.intent !== undefined &&
        partial.intent !== stepData.intent;
```

Pass it through (line 108–113):

```tsx
      const { step: next, resetData } = computeStepTransition({
        currentStep,
        maxStep,
        scenarioChanged,
        intentChanged,
      });
```

Update the reset branch comment/logic — the non-scenario reset now keys off intent; the body already does `{ ...initialStepData, scenario: prev.scenario, ...partial }`, which is correct (partial carries `intent` + derived `sourceType`). No code change beyond the variable rename.

Update the `useCallback` dependency array (line 158): replace `stepData.sourceType` with `stepData.intent`:

```tsx
    [advanceTo, currentStep, maxStep, stepData.scenario, stepData.intent],
```

Update the steps computation (line 195):

```tsx
  const steps = stepsForIntent(stepData.intent);
```

Update `renderStepContent` switch (lines 208–224): replace `case "source"` with `case "intent"` and add `case "analysis"`:

```tsx
    switch (id) {
      case "scenario": return <Step1Scenario {...props} />;
      case "intent": return <StepIntent {...props} onBack={onBack} />;
      case "interests": return <Step2Interests {...props} onBack={onBack} />;
      case "analysis": return <StepAnalysis {...props} onBack={onBack} />;
      case "file": return <StepFile {...props} onBack={onBack} />;
      case "integration": return <StepIntegration {...props} onBack={onBack} />;
      case "channels": return <StepChannels {...props} onBack={onBack} />;
      case "budget":
        return (
          <StepBudget
            {...props}
            onBack={onBack}
            onNext={() => handleLaunchFromBudget()}
          />
        );
      default: return null;
    }
```

- [ ] **Step 8: Update `use-chat-submit.ts`**

Line 30 import: `stepsForSource` → `stepsForIntent`. Line 403: map with the default full path (B):

```ts
        wizardStep !== null ? stepsForIntent("signals-comms")[wizardStep - 1] : undefined;
```

- [ ] **Step 9: Delete the old source step**

```bash
git rm src/sections/campaigns/wizard/steps/step-source.tsx src/sections/campaigns/wizard/steps/step-source.test.tsx
```

- [ ] **Step 10: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If anything still references `stepsForSource`, `SOURCE_STEP`, `StepSource`, or the `"source"` step id, fix it (grep: `grep -rn "stepsForSource\|SOURCE_STEP\|StepSource\|\"source\"" src`).

- [ ] **Step 11: Run the full unit suite**

Run: `npx vitest run`
Expected: all PASS (unit tests; e2e is Playwright and runs separately in Task 6).

- [ ] **Step 12: Manual smoke**

Start the dev server on port 3001 (main checkout may hold 3000): `npx next dev -p 3001`. Open the wizard, pick a scenario, then on step 2 verify:
- «Что хотите получить?» with three options; default «Сигналы + коммуникация».
- Path A «Только сигналы» → Интересы → Режим → Файл → Бюджет (no Каналы).
- Path B → …Режим → Файл → Каналы → Бюджет.
- Path C «Коммуникация по своим сигналам» → Файл → Каналы → Бюджет (no Интересы/Режим).
- Каналы step has no «Получить только сигналы»; «Далее» disabled until a channel is picked.
Stop the server (Ctrl-C).

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat(wizard): рефрейм шага 2 на намерение (intent A/B/C) + шаг «Режим анализа»"
```

---

## Task 6: e2e + visual snapshots

Changing the wizard flow breaks Playwright specs that drive the old «Откуда берём аудиторию?» source step and the removed «Получить только сигналы» option, and shifts visual snapshots.

**Files (investigate + update):** `tests/e2e/*.spec.ts` — known-affected: `no-comms.spec.ts` (tests the removed escape — rework to path A «Только сигналы» at step 2), `happy-path.spec.ts`, `scoring-files.spec.ts`, `campaign-progress.spec.ts`, `block-d.spec.ts`, `block-e.spec.ts`, `block-h.spec.ts`, `welcome-onboarding.spec.ts`.

- [ ] **Step 1: Run e2e to see what breaks**

Run: `npm run test:e2e`
Expected: failures in specs that select the old source step / no-comms option. Record the failing specs.

- [ ] **Step 2: Update selectors and flows**

For each failing spec, update the step-2 interaction from the source picker («Новая база номеров» / «Поток» / «Свои сигналы» under «Откуда берём аудиторию?») to the intent picker («Только сигналы» / «Сигналы + коммуникация» / «Коммуникация по своим сигналам» under «Что хотите получить?»), and add the «Режим анализа» step interaction (pick «Разовый» or «Потоковый») for paths A/B. Map old intent:
- old «Новая база» (new) → «Сигналы + коммуникация» + «Разовый», OR «Только сигналы» + «Разовый» if the spec expected no comms.
- old «Поток» (stream) → same intent + «Потоковый».
- old «Свои сигналы» (own) → «Коммуникация по своим сигналам».
For `no-comms.spec.ts`: the degenerate "signals only" campaign is now path A «Только сигналы» chosen at step 2 (no channels step at all) — rewrite the assertions accordingly (there is no «Получить только сигналы» button; the flow simply omits Каналы).

- [ ] **Step 3: Re-run non-visual e2e**

Run: `npm run test:e2e`
Expected: all PASS.

- [ ] **Step 4: Re-baseline visual snapshots**

Run: `npm run test:visual:update`
Then verify: `npm run test:visual`
Expected: PASS. Review the updated snapshot diffs to confirm the new step-2 / analysis screens look right (no accidental regressions elsewhere).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(e2e): визард на намерение — обновить сценарии + ре-бейзлайн визуалов"
```

---

## Self-Review (done while writing)

- **Spec coverage (Часть I §1–11):** step-1 unchanged ✓; step-2 reframe → Task 2 + Task 5; three paths → Task 5 (`stepsForIntent`); «Режим анализа» → Task 3 + Task 5; file in all paths → `stepsForIntent` tails; channels mandatory / drop «только сигналы» → Task 4; `intent`+`analysisMode` model + derived `sourceType` → Task 1; navigation reuse → Task 5 (`computeStepTransition` unchanged, arg renamed); stepper labels → Task 5; §9 backward-compat of old snapshots is a prototype non-goal (documented) — old snapshots lack `intent`; if a resumed old snapshot misbehaves, that is acceptable for the prototype (no task).
- **Placeholder scan:** none — every code + test step shows full content.
- **Type consistency:** `CampaignIntent` / `AnalysisMode` / `deriveSourceType` / `stepsForIntent` / `INTENT_STEP` / `intentChanged` used identically across Tasks 1–5; `StepIntent` emits `{ intent, sourceType }`, `StepAnalysis` emits `{ analysisMode, sourceType }`, consumed by `handleNext`'s `intentChanged` (keyed on `partial.intent` only, so the analysis step never triggers a reset).

## Next phase

**Часть II (артефакты потоковых кампаний)** is a separate plan, written after Часть I lands (it depends on `analysisMode`). Spec §12–19.

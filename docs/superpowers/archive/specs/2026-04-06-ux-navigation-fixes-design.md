# UX Navigation Fixes Design

## Goal

Fix four UX issues discovered during walkthrough: signals empty state, global step badge progress, LaunchFlyout wiring, and chat input placeholder pollution.

## Architecture

All changes live in `page.tsx` (global state), `signal-type-view.tsx` (empty state), `launch-flyout.tsx` (callbacks), `campaign-workspace.tsx` (initial scenario), and `step-1-scenario.tsx` (remove input side-effect). No new files needed.

## Tech Stack

Next.js App Router, TypeScript, Tailwind CSS v4, motion/react

---

## Task 1 — Signals Empty State

**File:** `src/components/signal-type-view.tsx`

**Current behaviour:** Always renders 6 signal scenario cards with title "Выберите тип сигнала".

**New behaviour:** Renders an empty state screen:
- Title: "Нет сигналов"
- Body: "Вы не создали ещё ни одного сигнала. Перед тем как запустить кампанию, сформируйте первый сигнал."
- Button: "Создать сигнал" — calls `onCreateSignal` prop

**Interface change:**
```ts
interface SignalTypeViewProps {
  onCreateSignal: () => void;  // replaces onSelect
}
```

The 6 scenario cards are removed from this component entirely — they exist only in `step-1-scenario.tsx` (CampaignWorkspace step 1) and `LaunchFlyout`.

**In `page.tsx`:** The sidebar "Сигналы" handler passes `handleStep1Click` as `onCreateSignal`.

---

## Task 2 — Global Step Badge Progress

**File:** `src/app/page.tsx`

**Current behaviour:** Step badges derive from `flowPhase` and reset to all-dim when user navigates via sidebar (`handleNavChange` resets `flowPhase = null`).

**New behaviour:** Two persistent boolean flags track real progress. They are set once and never reset by sidebar navigation.

```ts
const [signalDone, setSignalDone] = useState(false);
const [campaignDone, setCampaignDone] = useState(false);
```

- `signalDone` is set to `true` when `handleSignalComplete()` is called (user finishes signal flow and clicks "Запустить кампанию" on step 8).
- `campaignDone` is set to `true` when `setWorkflowLaunched(true)` is called.

**Step active logic (replaces current):**
```ts
const step1Active = !signalDone
const step2Active = signalDone && !campaignDone
const step3Active = campaignDone
```

`handleNavChange` continues to reset `workflowLaunched` and `flowPhase` (UI state), but never touches `signalDone` or `campaignDone` (progress state).

**onClick behaviour unchanged:** Step 1 clickable only from Welcome. Step 2 clickable only when `flowPhase === "awaiting-campaign"`. Step 3 never clickable.

---

## Task 3 — LaunchFlyout Wiring

**Files:** `src/components/launch-flyout.tsx`, `src/app/page.tsx`, `src/components/campaign-workspace.tsx`

### LaunchFlyout

Add two callback props:
```ts
interface LaunchFlyoutProps {
  open: boolean;
  onClose: () => void;
  onSignalSelect: (id: string, name: string) => void;
  onCampaignSelect: () => void;
}
```

Signal cards pass `id` and `name` (derived from `title`) to `onSignalSelect`. Campaign cards call `onCampaignSelect`. Both also call `onClose`.

Signal card IDs map from title:
```
Регистрация → registration
Первая сделка → first-deal
Апсейл → upsell
Удержание → retention
Возврат → return
Реактивация → reactivation
```

### page.tsx — handleLaunchSignal

```ts
function handleLaunchSignal(id: string, name: string) {
  setLaunchOpen(false);
  setActiveNav(null);
  setInitialScenario({ id, name });
  setFlowPhase("signal");
}
```

New state: `initialScenario: { id: string; name: string } | null` — passed to `CampaignWorkspace`, cleared after mount.

### page.tsx — handleLaunchCampaign

```ts
function handleLaunchCampaign() {
  setLaunchOpen(false);
  if (!signalDone) {
    // Show signals empty state — navigate to Сигналы section
    setActiveNav("Сигналы");
    setFlowPhase(null);
  } else {
    setActiveNav(null);
    setFlowPhase("campaign");
  }
}
```

### CampaignWorkspace — initialScenario prop

```ts
interface CampaignWorkspaceProps {
  onSignalComplete?: () => void;
  onStep8Reached?: () => void;
  initialScenario?: { id: string; name: string };
}
```

When `initialScenario` is provided:
- `useState(initialScenario ? 2 : 1)` for `currentStep`
- `useState(initialScenario ? 2 : 1)` for `maxStep`
- `useState({ ...initialStepData, scenario: initialScenario?.id ?? "" })` for `stepData`

This skips step 1 and goes directly to step 2 with the scenario pre-selected.

---

## Task 4 — Chat Input Placeholder Fix

**Files:** `src/components/steps/step-1-scenario.tsx`, `src/app/page.tsx`

### step-1-scenario.tsx

Remove the side-effect that writes to the chat input:
```ts
// DELETE this line:
textInput.setInput(`Сценарий: ${name}. `);
```

Also remove the `usePromptInputController` import since it's no longer used.

### page.tsx — chatPlaceholder

Add a case for the signal flow:
```ts
const chatPlaceholder =
  isWorkflow                ? "Опишите изменение сценария..." :
  flowPhase === "campaign"  ? "Опишите вашу кампанию..."      :
  flowPhase === "signal"    ? "Введите ваши параметры или задайте вопрос" :
                              "Выберите шаг или задайте вопрос…";
```

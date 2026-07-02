# Welcome + Signals Section Audit Report

**Date:** 2026-04-17  
**Project:** afina-ai-first (Next.js single-page prototype, state-machine-driven)  
**Scope:** Signal collection flow and related UI components

---

## 1. Screen Hierarchy & Content Layout

### 1.1 WelcomeView
**Location:** `src/components/welcome-view.tsx`

**Purpose:** Entry point for first-time users. Displays onboarding message.

**Visual Structure:**
- Container: Full height (`flex-1`), centered, with bottom padding (350px to clear floating input)
- Content alignment: Center
- Typography:
  - Heading: 2xl bold ("Добро пожаловать")
  - Subtitle: sm muted ("Три шага до первой кампании...")

**Interactive Elements:**
- No direct buttons in WelcomeView itself
- Trigger: Step 1 badge click below (in main page) → calls `onStep1Click()`

**State:**
- Purely presentational; receives `onStep1Click` callback
- No internal state

---

### 1.2 SignalTypeView
**Location:** `src/components/signal-type-view.tsx`

**Purpose:** Standalone sidebar section. Shows collected signals or empty state.

**Data Contract:**
```typescript
interface SignalCardData {
  scenarioId: string;
  count: number;
  createdAt: string;
}

interface SignalTypeViewProps {
  onCreateSignal: () => void;
  signal?: SignalCardData | null;
  onLaunchCampaign?: () => void;
}
```

**Visual Structure:**
- Container: Full height scrollable column, centered max-width 2xl, top padding 140px
- Heading: 38px semibold "Сигналы"

**Two States:**

**A) Empty State (no signal):**
- Position: Fixed center (left 120px for sidebar offset)
- Content:
  - Text: "Вы не создали ещё ни одного сигнала..."
  - Button: "Создать сигнал" (primary, foreground color)
- Action: Calls `onCreateSignal()` → starts guided signal flow

**B) Signal Exists:**
- Card: Rounded border, bg-card, p-5
  - Scenario name + count: sm semibold, e.g., "Регистрация · 4,312 сигналов"
  - Created date: xs muted ("22.04.2026")
  - Actions: Two buttons
    - "Скачать сигналы" (outline, secondary)
    - "Запустить кампанию" (primary) → calls `onLaunchCampaign()`
- Additional action: "+ Создать сигнал" button below (secondary style)

**Scenario name mapping:**
- "registration" → "Регистрация"
- "first-deal" → "Первая сделка"
- "upsell" → "Апсейл"
- "retention" → "Удержание"
- "return" → "Возврат"
- "reactivation" → "Реактивация"

---

### 1.3 CampaignWorkspace
**Location:** `src/components/campaign-workspace.tsx`

**Purpose:** Main guided signal collection flow container. Manages 8-step progression.

**Props:**
```typescript
interface {
  onSignalComplete?: () => void;
  onStep8Reached?: (scenarioId: string) => void;
  initialScenario?: { id: string; name: string };
}
```

**Structure:**
- Root: Flex column, full height, relative positioning
- Top-right (when step ≥ 2): CampaignStepper component (shows progress 1-8)
  - Disabled on step 7 (processing state)
  - Clickable to jump between completed/current steps
- Main content area: Scrollable column
  - min-h-screen per step (centers content vertically)
  - px-8, pb-40 (bottom padding clears floating input)
  - pt-10

**Animation:**
- Entry: `y: 60, opacity: 0` → `y: 0, opacity: 1` (0.35s, easeOut)
- Only on newly created steps (step === animatingStep)
- Smooth scroll to new step after render

**Key Logic:**
- `startStep = initialScenario ? 2 : 1` — If scenario pre-selected (from LaunchFlyout), skip Step 1
- `maxStep` tracks furthest step reached (prevents back-stepping)
- Step 8 detection: When `currentStep === 8 && maxStep < 8`, calls `onStep8Reached(scenarioId)`
- Flow state: `flowPhase="signal"` or `"awaiting-campaign"` (Step 8 visible but waiting for launch button)

---

## 2. Step-by-Step Content (src/components/steps/)

Each step inherits `StepProps`:
```typescript
interface StepProps {
  data: StepData;
  onNext: (partial: Partial<StepData>) => void;
  onGoToStep?: (step: number) => void;
}
```

All steps wrap content in `<StepContent>` which provides:
- Typewriter animation for title + subtitle (title 25ms, subtitle 18ms per char)
- Delayed content fade-in (opacity animation after subtitle done, 0.35s)

---

### Step 1: Scenario Selection
**File:** `step-1-scenario.tsx`

**Type:** Selection step (required, single choice)

**Content:**
- Title: "Выберите тип сигнала"
- Subtitle: "Выберите сценарий, мы зададим нужные вопросы"
- Layout: 3-column grid of scenario cards

**Scenarios (6 total):**
| ID | Name | Description |
|----|------|-------------|
| registration | Регистрация | Возврат пользователей после незавершённой регистрации или брошенной корзины |
| first-deal | Первая сделка | Обогащение данных о клиенте, оценка потенциала и рисков |
| upsell | Апсейл | Мониторинг интереса к конкурентам, предотвращение оттока |
| retention | Удержание | Мониторинг интереса к конкурентам и предотвращение оттока |
| return | Возврат | Определение оптимального момента для повторного контакта |
| reactivation | Реактивация | Определение оптимального момента для повторного контакта |

**Card Styling:**
- Selected: border-primary, bg-accent, ring-1 ring-primary
- Default: border-border, bg-card, hover:bg-accent

**Action:**
- Click scenario → `onNext({ scenario: id })`
- Next: Step 2

---

### Step 2: Interests & Triggers
**File:** `step-2-interests.tsx`

**Type:** Multi-select step (at least one required)

**Content:**
- Title: "Какие интересы и триггеры вы ищете?"
- Subtitle: "Выберите одно или несколько. Если нужного нет — напишите в поле чата"

**Two sections:**

**Interests (8 predefined):**
- Недвижимость
- Автомобили
- Финансовые услуги
- Страхование
- Путешествия
- Электроника
- Образование
- Здоровье и медицина

**Triggers (7 predefined):**
- Посещение сайтов конкурентов
- Поиск альтернативных предложений
- Истечение срока договора
- Смена места жительства
- Смена работы
- Крупная покупка
- Оформление кредита

**Interaction:**
- Tags are toggleable buttons
- Selected: border-primary, bg-accent, ring-1 ring-primary, text-foreground
- Validation: `canContinue = interests.length > 0 || triggers.length > 0`
- Helper text: "Если нужного нет в списке — напишите в поле чата" (twice)

**Action:**
- Continue button (disabled until valid) → `onNext({ interests, triggers })`
- Next: Step 3

---

### Step 3: Segment Selection
**File:** `step-3-segments.tsx`

**Type:** Multi-select with pricing (at least one required)

**Content:**
- Title: "Выберите сегменты сигнала"
- Subtitle: "Чем лучше сегмент, тем точнее сигнал и выше стоимость. Можно выбрать несколько"

**Segments (4 total):**
| ID | Name | Price | Description |
|----|------|-------|-------------|
| max | Максимальный | ₽0.45 | Высочайшая вероятность отклика |
| very-high | Очень высокий | ₽0.35 | Сильный интерес, высокая готовность |
| high | Высокий | ₽0.25 | Выраженный интерес к категории |
| medium | Средний и ниже | ₽0.07 | Общий интерес без явных триггеров |

**Card Layout:**
- Checkbox (left)
- Text (left): Name + description
- Price (right, shrink-0)
- Selected: border-primary, bg-accent, ring-1 ring-primary

**Action:**
- Continue button (disabled until at least 1 selected) → `onNext({ segments: selected })`
- Next: Step 4

---

### Step 4: Budget Limit
**File:** `step-4-limit.tsx`

**Type:** Numeric input with calculation

**Content:**
- Title: "Укажите максимальный бюджет"
- Subtitle: "Мы найдём максимальное количество сигналов в рамках этой суммы"
- Width: max-w-md

**Input:**
- Type: text with decimal input mode
- Placeholder: "Например, 500"
- Currency symbol: ₽ (right-aligned, non-interactive)
- Input parsing: Removes non-numeric except . and , (converts , to .)

**Dynamic Calculation:**
- Formula: `estimatedSignals = calcSignals(segments, budget)`
- Range: minSignals to maxSignals based on segment prices
- Display: "X – Y сигналов" (or singular "X сигналов" if equal, or "—" if invalid)

**Validation:**
- `isValid = !isNaN(parsed) && parsed > 0`
- Button enabled only when valid

**Action:**
- Next button → `onNext({ budget: parsed })`
- Next: Step 5

---

### Step 5: File Upload
**File:** `step-5-upload.tsx`

**Type:** File upload with async processing

**Content:**
- Title: "Загрузите вашу базу"
- Subtitle: "Файл с номерами телефонов. Данные будут автоматически захешированы перед отправкой"

**Drop Zone:**
- Min height: 160px
- Dashed border, rounded
- Accepted formats: .csv, .xlsx, .txt
- Drag-over: border-primary, bg-accent
- Default: border-border, bg-card, hover:border-primary/50

**Three render states:**

**A) Empty:**
- Icon: Upload (muted)
- Text: "Перетащите файл или нажмите для выбора"

**B) File selected (before hashing):**
- Icon: Upload (primary)
- File name
- File size (KB or MB)
- Helper: "Нажмите чтобы заменить"

**C) Hashing in progress:**
- Three-stage loader with typewriter effect:
  1. "Проверка формата файла..." (1200ms total)
  2. "Хеширование данных..." (2000ms total)
  3. "Подготовка к импорту..." (1000ms total)
- Progress indicator: 3 dots, filled left-to-right

**File constraints:**
- Max size: 50 MB
- Max rows: 1,000,000
- Format: One phone number per line

**Action:**
- Next button (disabled while hashing or no file) → Starts hashing animation → `onNext({ file })`
- Next: Step 6

---

### Step 6: Summary & Confirmation
**File:** `step-6-summary.tsx`

**Type:** Review step with edit jump points

**Content:**
- Title: "Проверьте настройки кампании"
- Subtitle: "Нажмите на строку, чтобы вернуться к шагу для редактирования"

**Card Layout:** Bordered card with divide-y rows

**Review rows (clickable jump points):**
1. Сценарий → Jump to Step 1
2. Интересы → Jump to Step 2
3. Триггеры → Jump to Step 2
4. Сегменты → Jump to Step 3
5. Максимальный бюджет → Jump to Step 4
6. Максимум сигналов (read-only, calculated)
7. Файл с базой → Jump to Step 5

**Calculations:**
- Signal range: `Math.floor(budget / Math.max(...prices))` to `Math.floor(budget / Math.min(...prices))`
- Display: "X – Y сигналов" or "X сигналов" (if equal) or "—"

**Row styling:**
- Clickable rows: `hover:bg-accent`, rounded, cursor-pointer
- Read-only rows: No hover

**Action:**
- "Подтвердить и запустить" button → `onNext({})` (empty partial, just progresses)
- Next: Step 7

---

### Step 7: Processing
**File:** `step-7-processing.tsx`

**Type:** Auto-advancing loader

**Content:**
- Title: "Ваша кампания обрабатывается"
- Subtitle: "Это займёт некоторое время. Скоро вы получите сигналы"
- Width: max-w-md

**Progress Display:**
- Animated progress bar: 0% → 100% over 4000ms (TOTAL_DURATION)
- Tick interval: 50ms
- Percentage display (tabular-nums): Right-aligned

**Auto-advance:**
- After 4000ms + 200ms delay, calls `onNext({})` automatically
- User cannot interact; step disabled in stepper

**Action:**
- Auto-triggered → Next: Step 8

---

### Step 8: Result & Launch
**File:** `step-8-result.tsx`

**Type:** Result display + campaign launch trigger

**Content:**
- Title: "Мы собрали сигналы по вашей базе"
- Subtitle: "Файл готов к скачиванию"
- Width: max-w-md

**Signal Counter:**
- Large display (4xl bold, tabular-nums)
- Calculated: `Math.floor(budget * (0.8 + Math.random() * 0.15))`
- Label: "сигналов найдено"

**Actions:**
1. "Скачать сигналы" (outline button, Download icon)
   - Log: `console.log("Download signals", { signalCount, data })`
   - No flow progression

2. "Запустить кампанию" (primary button, Zap icon)
   - Calls `onNext({})` → `onSignalComplete()` in parent
   - **Key moment:** When Step 8 first reached, `onStep8Reached(scenarioId)` was already called
   - Flow changes: `flowPhase = "awaiting-campaign"`

**Flow State:**
- When Step 8 is reached (maxStep === 8 for first time): Parent calls `onStep8Reached(scenarioId)`
- CampaignWorkspace remains visible (awaiting Step 8 button click)
- Step 2 badge pulses (1.4s animation) in main page
- User can click "Запустить кампанию" → `onSignalComplete()` → `flowPhase = "campaign"`

---

## 3. User Scenarios (Numbered)

### Scenario 1: Cold start onboarding
**Trigger:** Page loads, no active nav  
**User path:**
1. Sees WelcomeView (centered message, no buttons visible)
2. Clicks Step 1 badge at bottom ("Получение сигнала")
3. Step 1 (Scenario selection) appears
4. Selects scenario → Step 2
5. Selects interests/triggers → Step 3
6. Selects segments → Step 4
7. Enters budget → Step 5
8. Uploads CSV/XLSX file → Step 6
9. Reviews all settings, clicks clickable rows to edit any step
10. Confirms → Step 7 (auto-advances)
11. Step 8 appears with signal counter
12. "Запустить кампанию" button → `flowPhase = "campaign"` → CampaignTypeView

**Exit points:**
- At any step, click sidebar nav → closes flow (loses progress)

---

### Scenario 2: Create signal from empty Signals sidebar
**Trigger:** User navigates to "Сигналы" sidebar, no signal exists  
**User path:**
1. SignalTypeView empty state: "Вы не создали ещё ни одного сигнала..."
2. Clicks "Создать сигнал" button
3. Entry into CampaignWorkspace, Step 1 (same as Scenario 1 from step 3 onward)

**Exit points:**
- Step 8 "Запустить кампанию" → `flowPhase = "campaign"`
- Sidebar nav → closes

---

### Scenario 3: View collected signal & launch campaign
**Trigger:** Signal already collected (signalDone = true); user on Signals sidebar  
**User path:**
1. SignalTypeView shows signal card
   - Scenario name + count (e.g., "Регистрация · 4,312 сигналов")
   - Date created
   - Buttons: "Скачать сигналы", "Запустить кампанию", "+ Создать сигнал"
2. Clicks "Запустить кампанию"
3. `handleStep2Click()` → `flowPhase = "campaign"`
4. CampaignTypeView (campaign type selection)

**Parallel action:**
- Clicks "Скачать сигналы" → No flow change (logs only)

---

### Scenario 4: Guided flow Step 1 → Step 8 (detailed walkthrough)
**Each step's user action:**

| Step | User Does | Component | Data Updated | Next |
|------|-----------|-----------|--------------|------|
| 1 | Selects scenario card | Step1Scenario | `scenario: id` | Step 2 |
| 2 | Toggles interest/trigger tags | Step2Interests | `interests: [], triggers: []` | Step 3 |
| 3 | Toggles segment checkboxes | Step3Segments | `segments: []` | Step 4 |
| 4 | Types budget number | Step4Limit | `budget: number` | Step 5 |
| 5 | Drags/clicks file + hashing | Step5Upload | `file: File` | Step 6 |
| 6 | Reviews, clicks rows to jump back OR confirms | Step6Summary | No data change | Step 7 |
| 7 | Waits (auto-advance) | Step7Processing | No user action | Step 8 |
| 8 | Clicks "Запустить кампанию" | Step8Result | No data change | `onSignalComplete()` |

---

### Scenario 5: Jump editing in Step 6 summary
**Trigger:** User on Step 6, clicks "Интересы" row  
**User path:**
1. Current step: 6
2. Click row → `onGoToStep(2)`
3. CampaignWorkspace: `setCurrentStep(2)`, `setAnimatingStep(null)` (no animation for backtrack)
4. Scroll to Step 2 instantly
5. Edit interests/triggers
6. Click "Продолжить" → `onNext({ interests, triggers })`
7. Back to Step 6 (currentStep = 3 → ... → 6 via handleNext logic)

**Note:** maxStep remains 6, so clicking Next just increments currentStep, no animation.

---

### Scenario 6: Pre-selected scenario from LaunchFlyout
**Trigger:** User clicks campaign launch → "Запустить кампанию" → selects signal scenario  
**User path:**
1. LaunchFlyout: Lists available scenarios (from LaunchFlyout, out of scope)
2. User selects scenario → `handleLaunchSignal(id, name)`
3. Sets `initialScenario = { id, name }`
4. Sets `flowPhase = "signal"`
5. CampaignWorkspace: `startStep = 2` (skips Step 1)
6. `stepData.scenario` pre-filled
7. User proceeds from Step 2 onward

**Note:** This flow is triggered by LaunchFlyout button, not described in this audit.

---

### Scenario 7: Step 8 reached → awaiting-campaign state
**Trigger:** User completes Step 7, auto-advances to Step 8  
**User path:**
1. Step 7 progress bar completes (4000ms)
2. CampaignWorkspace: `setMaxStep(8)` for first time
3. Inside `handleNext()`: `next === 8` → Calls `onStep8Reached(scenarioId)`
4. Main page `handleStep8Reached()`:
   - `setSignalDone(true)`
   - `setSignalScenarioId(scenarioId)`
   - `setSignalCreatedAt(today)`
   - `setFlowPhase("awaiting-campaign")`
5. CampaignWorkspace re-renders but remains visible
6. Step 2 badge at bottom: Pulses (1.4s animation, green border + glow)
7. User sees Step 8 with signal counter and "Запустить кампанию" button
8. Click button → `onSignalComplete()` → `flowPhase = "campaign"`

**Note:** `flowPhase = "awaiting-campaign"` persists CampaignWorkspace so Step 8 stays visible during campaign setup if user navigates away and back.

---

## 4. Data Flow & State Management

### StepData Type (Immutable during flow)
```typescript
interface StepData {
  scenario: string | null;          // Step 1
  interests: string[];              // Step 2
  triggers: string[];               // Step 2
  segments: string[];               // Step 3
  budget: number | null;            // Step 4
  file: File | null;                // Step 5
}

const initialStepData: StepData = {
  scenario: null,
  interests: [],
  triggers: [],
  segments: [],
  budget: null,
  file: null,
};
```

### Flow Phase State
```typescript
type FlowPhase = "signal" | "awaiting-campaign" | "campaign" | null;
```

| Phase | Component | User can navigate away | Next Phase(s) |
|-------|-----------|------------------------|----------------|
| `"signal"` | CampaignWorkspace (Steps 1-7) | Yes, closes flow | `"awaiting-campaign"` |
| `"awaiting-campaign"` | CampaignWorkspace (Step 8 visible) | Yes, Step 2 badge active | `"campaign"` |
| `"campaign"` | CampaignTypeView or WorkflowView | Yes, closes flow | `null` (sidebar nav) |
| `null` | WelcomeView or sidebar sections (SignalTypeView, CampaignTypeView, StatisticsView) | Yes | `"signal"` or `"campaign"` |

### Main Page State Hooks
```typescript
const [activeNav, setActiveNav] = useState<string | null>(null);
  // "Статистика" | "Сигналы" | "Кампании" | null

const [flowPhase, setFlowPhase] = useState<FlowPhase>(null);
const [selectedCampaign, setSelectedCampaign] = useState<SelectedCampaign | null>(null);
const [workflowLaunched, setWorkflowLaunched] = useState(false);
const [signalDone, setSignalDone] = useState(false);
const [signalScenarioId, setSignalScenarioId] = useState<string>("");
const [signalCreatedAt, setSignalCreatedAt] = useState<string>("");
const [initialScenario, setInitialScenario] = useState<{ id: string; name: string } | null>(null);

// For step badge pulse animation
const [stepTwoNew, setStepTwoNew] = useState(false);
```

---

## 5. Entry & Exit Points

### Entry Points (How to reach this section)

**A) WelcomeView → Step 1 badge click**
```
WelcomeView (onStep1Click) → handleStep1Click()
  → setFlowPhase("signal")
  → CampaignWorkspace renders (Step 1)
```

**B) Sidebar "Сигналы" → "Создать сигнал" button**
```
activeNav = "Сигналы"
  → SignalTypeView (empty state)
  → onCreateSignal → handleStep1Click()
  → setFlowPhase("signal")
  → CampaignWorkspace renders (Step 1)
```

**C) LaunchFlyout → Signal scenario select**
```
LaunchFlyout (onSignalSelect)
  → handleLaunchSignal(id, name)
  → setInitialScenario({ id, name })
  → setFlowPhase("signal")
  → CampaignWorkspace renders with Step 1 skipped (Step 2)
```

**D) Step 2 badge (after signal done)**
```
flowPhase = "awaiting-campaign" (Step 2 badge active)
  → Click badge → handleStep2Click()
  → setFlowPhase("campaign")
  → CampaignTypeView renders
```

---

### Exit Points (How to leave this section)

**From CampaignWorkspace (Steps 1-8):**
- Sidebar nav click → `handleNavChange(nav)` → `setFlowPhase(null)`, closes flow, loses progress
- Step 8 "Запустить кампанию" → `onSignalComplete()` → `setFlowPhase("campaign")` → CampaignTypeView

**From SignalTypeView (active nav):**
- "Запустить кампанию" → `handleStep2Click()` → `setFlowPhase("campaign")`
- Other sidebar nav clicks → `handleNavChange(nav)`
- "Скачать сигналы" → No flow change

**From awaiting-campaign state:**
- Can navigate sidebar (flow closes)
- Step 8 button → `setFlowPhase("campaign")`

---

## 6. Key Interactions & Callbacks

### Parent → Child (Props)

**CampaignWorkspace receives:**
- `onSignalComplete?: () => void` — Called when Step 8 "Запустить кампанию" clicked
- `onStep8Reached?: (scenarioId: string) => void` — Called when Step 8 first appears
- `initialScenario?: { id: string; name: string }` — Pre-fills scenario (Step 2 as startStep)

**SignalTypeView receives:**
- `onCreateSignal: () => void` — Start signal creation flow
- `signal?: SignalCardData | null` — Populated signal or null
- `onLaunchCampaign?: () => void` — Transition to campaign selection

**WelcomeView receives:**
- `onStep1Click: () => void` — Start signal creation

---

### Child → Parent (Callbacks)

**Step components → CampaignWorkspace → Main page:**
- `onNext(partial: Partial<StepData>)` → CampaignWorkspace's `handleNext()`
- `handleNext()` updates `stepData` and `currentStep`
- On step 8 first appearance, calls parent's `onStep8Reached(scenarioId)`

**Step8Result:**
- `onClick={() => onNext({})}` (button) → CampaignWorkspace's `handleNext({})` → calls parent's `onSignalComplete()`

---

## 7. Visual & UX Details

### Animations
- **Step entry:** 0.35s, easeOut, slide up 60px + fade
- **Step content (StepContent):** Title typewriter (25ms/char), subtitle (18ms/char), content fade-in (0.35s delay)
- **Step 2 badge pulse:** 1.4s keyframe animation (green glow, repeats 2-3 times)
- **Progress bar:** Linear 50ms ticks over 4000ms total
- **Bottom float:** 0.55s, cubic-bezier [0.32, 0.72, 0, 1], position 40% (Welcome) → 3% (main)

### Color Tokens (Tailwind)
- Active/selected: `border-primary`, `bg-accent`, `ring-primary`
- Default: `border-border`, `bg-card`, `text-foreground`
- Muted: `text-muted-foreground`, `bg-muted`
- Hover: `hover:bg-accent`, `hover:border-primary/50`

### Responsive
- All steps centered with max-w-2xl (or max-w-md for forms)
- Sidebar offset: left-[120px] for empty states and floating input

---

## 8. Not in Scope (Referenced but Managed Elsewhere)

- **CampaignStepper** — Shown Steps 2-8, manages step clicks, disabled on Step 7
- **CampaignTypeView** — Campaign type selection, managed by CampaignTypeView agent
- **WorkflowView** — Workflow graph editing, managed by WorkflowView agent
- **StatisticsView** — Campaign statistics, managed by StatisticsView agent
- **AppSidebar** — Navigation menu, managed by AppSidebar agent
- **LaunchFlyout** — Scenario/campaign quick-launch panel, managed by LaunchFlyout agent
- **PromptInput** — AI chat input, managed by PromptInput agent

---

## Appendix: File Summary

| File | Lines | Purpose |
|------|-------|---------|
| welcome-view.tsx | 20 | Onboarding welcome screen |
| signal-type-view.tsx | 90 | Signals sidebar section |
| campaign-workspace.tsx | 153 | 8-step guided flow container |
| step-1-scenario.tsx | 73 | Scenario selection (6 cards) |
| step-2-interests.tsx | 122 | Multi-select interests & triggers |
| step-3-segments.tsx | 113 | Multi-select segments with pricing |
| step-4-limit.tsx | 83 | Budget numeric input |
| step-5-upload.tsx | 169 | File upload + hashing stages |
| step-6-summary.tsx | 125 | Review & jump editing |
| step-7-processing.tsx | 54 | Auto-advancing progress (4s) |
| step-8-result.tsx | 61 | Signal counter + launch button |
| step-content.tsx | 94 | Wrapper: typewriter title + content fade |

---

**Total code in scope:** ~1,157 lines (excluding type definitions, UI primitives, utils)


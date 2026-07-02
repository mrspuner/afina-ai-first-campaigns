# UI Polish: Section Cards & Visual Fixes Design

## Goal

Four improvements: (1) signal card in Signals section, (2) campaign card in Campaigns section, (3) hide step badges after onboarding complete, (4) fix floating chat bar overlap on Statistics and Welcome screens.

## Architecture

All changes are isolated to existing files. Two new display components (`SignalCard`, `CampaignCard`) live in their respective section view files. Step badge visibility is a one-line gate in `page.tsx`. The chat bar gets an opaque background wrapper. Welcome view gets proper bottom padding.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS v4

---

## Task 1 — Hide step badges when onboarding is complete

**File:** `src/app/page.tsx`

**Current behaviour:** The step 1/2/3 badges are always shown below the chat bar.

**New behaviour:** When `campaignDone === true`, the entire badges block is hidden.

**Change:** Wrap the badges `<div className="flex gap-2">` in a conditional: `{!campaignDone && ( ... )}`.

---

## Task 2 — Signal card in Signals section

**File:** `src/components/signal-type-view.tsx`

**New props:**
```ts
interface SignalTypeViewProps {
  onCreateSignal: () => void;
  signal?: { scenarioName: string; count: number; createdAt: string } | null;
  onLaunchCampaign?: () => void;
}
```

**New behaviour:**
- Section header: `<h1>Сигналы</h1>` + subtitle showing count e.g. `1 сигнал` (or `Нет сигналов` when empty).
- When `signal` is provided, render a card **above** the empty-state / CTA:
  - **Title:** `{scenarioName} · {count.toLocaleString("ru-RU")} сигналов`
  - **Body (small text):** `{createdAt}` (formatted date string)
  - **Buttons:** "Скачать сигналы" (no-op for now) + "Запустить кампанию" → calls `onLaunchCampaign`
- When no signal, show the existing empty-state with "Создать сигнал" button.
- When signal exists, show card + a secondary "Создать сигнал" button below it.

**Scenario name mapping** (defined in `signal-type-view.tsx`):
```ts
const SCENARIO_NAMES: Record<string, string> = {
  registration: "Регистрация",
  "first-deal":  "Первая сделка",
  upsell:        "Апсейл",
  retention:     "Удержание",
  return:        "Возврат",
  reactivation:  "Реактивация",
};
```

**Wiring in `page.tsx`:**
- Pass `signal={{ scenarioName: SCENARIO_NAMES[signalScenarioId] ?? signalScenarioId, count: 4312, createdAt: new Date().toLocaleDateString("ru-RU") }}` when `signalDone && signalScenarioId`.
- Pass `onLaunchCampaign={handleStep2Click}`.

---

## Task 3 — Campaign card in Campaigns section

**File:** `src/components/campaign-type-view.tsx`

**New props:**
```ts
interface CampaignTypeViewProps {
  onSelect: (id: string, name: string) => void;
  campaign?: { typeName: string; launchedAt: string } | null;
}
```

**New behaviour:**
- Section header: `<h1>Кампании</h1>` + subtitle `1 кампания` or `Нет кампаний`.
- When `campaign` is provided, render a card:
  - **Title:** `{typeName}` + green badge `Активна`
  - **Body (small text):** `Запущена {launchedAt}`
- Below the card (or alone if no campaign): existing campaign type selection grid, or a simple "Создать кампанию" button.

**Wiring in `page.tsx`:**
- Pass `campaign={{ typeName: selectedCampaign.name, launchedAt: campaignLaunchedAt }}` when `campaignDone && selectedCampaign`.
- Add `const [campaignLaunchedAt, setCampaignLaunchedAt] = useState<string>("")` state.
- Set it when "Начать кампанию" is clicked: `setCampaignLaunchedAt(new Date().toLocaleDateString("ru-RU"))`.

---

## Task 4 — Opaque chat bar wrapper

**File:** `src/app/page.tsx`

**Current behaviour:** The `motion.div` floating bar has no background — content bleeds through on Statistics and other dense views.

**New behaviour:** Wrap the inner `<div className="mx-auto ...">` in a container that has `bg-background` + a subtle top gradient fade, so content behind it is masked.

**Change:** Add a wrapper `<div>` around the entire `motion.div` content with `bg-background` background. Specifically, add a gradient overlay above the bar:

```tsx
// Inside motion.div, before the inner content div:
<div className="pointer-events-none absolute -top-12 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent" />
```

This creates a fade-out zone above the bar that masks underlying content cleanly.

---

## Task 5 — Welcome screen: no overlap on small screens

**File:** `src/components/welcome-view.tsx`

**Current behaviour:** Content is `items-center justify-center pb-56` — on small viewports the chat bar (which is fixed) overlaps the text.

**New behaviour:** Use `min-h-0 overflow-y-auto` on the wrapper and ensure the content has enough bottom padding to always clear the chat bar height (~160px bar + ~40px badges + safety margin = `pb-72`).

**Change:** Replace `pb-56` with `pb-72` and ensure the outer div has `overflow-y-auto` so on very small screens the user can scroll rather than content being cut off.

---

## Data Flow Summary

```
page.tsx state:
  signalDone + signalScenarioId → SignalTypeView signal prop
  campaignDone + selectedCampaign + campaignLaunchedAt → CampaignTypeView campaign prop
  campaignDone → hide step badges
```

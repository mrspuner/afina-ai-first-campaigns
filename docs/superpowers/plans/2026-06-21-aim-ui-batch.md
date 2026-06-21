# aim UI Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Implement the 15 aim-queued UI edits — survey site field, scenario-catalog restructure, source-gated dynamic wizard, budget copy + proportional recalc, scoring-node overlap fix, payment-screen cleanup.

**Architecture:** Mostly client-only React/reducer changes on `feature/finish-campaign-first`. Order: pure helpers + the layout bug first (lowest risk), then budget copy/recalc, then payment cleanup, then catalog restructure, then survey field, and finally the largest piece — the dynamic source-gated wizard. Pure logic (scale helper, node positions, stepsForSource, survey validation/reducer) is TDD; UI-only edits are verified by reading + the existing render tests.

**Tech Stack:** Next.js 16, TypeScript, Tailwind v4, React reducer state, Vitest. `nanoid` for ids.

**Source spec:** `docs/superpowers/specs/2026-06-21-aim-ui-batch-design.md`.

**⚠️ Environment:** repo dir name has a non-breaking space. Shell: `cd /tmp/afina-wt`. Read/Write/Edit: use `/tmp/afina-wt/...`.

**⚠️ Baseline gates (verified):** `npx tsc --noEmit` has exactly **13 pre-existing errors** (12 in `src/components/ai-elements/*`, 1 in `src/sections/campaigns/campaign-cost.ts:154`) — these must REMAIN, nothing else. Green = `npx tsc --noEmit 2>&1 | grep -vE "ai-elements|campaign-cost" | grep "error TS"` is empty. `npx vitest run` is fully green (919 tests) — keep it green.

---

## File Structure

**New files:**
- `src/sections/campaigns/scale-breakdown.ts` — pure `scaleBreakdown(rows, customTotal, recommendedTotal)`.
- `src/sections/campaigns/wizard/steps/step-integration.tsx` — stream API-key step.
- `src/sections/campaigns/wizard/wizard-steps.ts` — `stepsForSource(sourceType)` + step-id types.

**Modified (by theme):**
- A: `survey-form.tsx`, `survey-validation.ts`, `app-state.ts` (`survey_completed` already alias-safe).
- B: `step-1-scenario.tsx`, `scenario-card.tsx`.
- C: `step-source.tsx`, `step-2-interests.tsx`, `step-4-upload.tsx`, `campaign-workspace.tsx`, `campaign-stepper.tsx`, `wizard-navigation.ts`, `types/campaign.ts` (`apiKey?`).
- D: `step-budget.tsx`, `campaign-budget-estimate.ts`.
- E: `state/workflow-templates.ts`.
- F: `campaign-payment-screen.tsx`.

---

## Task 0: Baseline check

- [ ] **Step 1:** `cd /tmp/afina-wt && npx tsc --noEmit 2>&1 | grep -vE "ai-elements|campaign-cost" | grep "error TS"` → empty; `npx vitest run 2>&1 | tail -3` → all pass. If red, STOP and report.

---

## Task 1: `scaleBreakdown` helper (TDD)

**Files:** Create `src/sections/campaigns/scale-breakdown.ts`, `src/sections/campaigns/scale-breakdown.test.ts`.

- [ ] **Step 1: Failing test**
```ts
import { describe, expect, it } from "vitest";
import { scaleBreakdown } from "./scale-breakdown";

describe("scaleBreakdown", () => {
  it("scales component rows proportionally and pins the total to customTotal", () => {
    const rows = [
      { key: "signals", amount: 2500 },
      { key: "communication", amount: 7500 },
    ];
    const out = scaleBreakdown(rows, 20000, 10000); // 2x
    expect(out.find((r) => r.key === "signals")!.amount).toBe(5000);
    expect(out.find((r) => r.key === "communication")!.amount).toBe(15000);
  });
  it("absorbs rounding into the largest row so the sum equals customTotal", () => {
    const rows = [
      { key: "a", amount: 333 },
      { key: "b", amount: 667 },
    ];
    const out = scaleBreakdown(rows, 1001, 1000);
    expect(out.reduce((s, r) => s + r.amount, 0)).toBe(1001);
  });
  it("returns zeros safely when recommendedTotal is 0", () => {
    const out = scaleBreakdown([{ key: "a", amount: 0 }], 500, 0);
    expect(out[0].amount).toBe(0);
  });
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement**
```ts
export interface BreakdownRow {
  key: string;
  amount: number;
  /** carried through untouched (label, channel, etc.) */
  [extra: string]: unknown;
}

/**
 * Proportionally rescale component rows so they sum to `customTotal`, given the
 * original `recommendedTotal` they summed to. Rounding drift is absorbed into the
 * largest row so the displayed parts always add up to the chosen budget exactly.
 * recommendedTotal === 0 → all rows become 0 (no division by zero).
 */
export function scaleBreakdown<T extends BreakdownRow>(
  rows: T[],
  customTotal: number,
  recommendedTotal: number,
): T[] {
  if (recommendedTotal <= 0) return rows.map((r) => ({ ...r, amount: 0 }));
  const factor = customTotal / recommendedTotal;
  const scaled = rows.map((r) => ({ ...r, amount: Math.round(r.amount * factor) }));
  const drift = customTotal - scaled.reduce((s, r) => s + r.amount, 0);
  if (drift !== 0 && scaled.length > 0) {
    let maxI = 0;
    for (let i = 1; i < scaled.length; i++) if (scaled[i].amount > scaled[maxI].amount) maxI = i;
    scaled[maxI] = { ...scaled[maxI], amount: scaled[maxI].amount + drift };
  }
  return scaled;
}
```
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat(campaigns): scaleBreakdown helper for proportional budget recalc"`

---

## Task 2: Fix scoring-node overlap (#12, TDD)

**Files:** Modify `src/state/workflow-templates.ts` (`withScoring`, ~270-295). Test: `src/state/workflow-templates.test.ts` (extend).

Current: scoring placed at `entry.position.x + STEP / 2`; downstream shifted by `STEP / 2`. `STEP = 210`, node `minWidth = 110` → overlap.

- [ ] **Step 1: Failing test** — append:
```ts
import { describe, expect, it } from "vitest";
import { createTemplate } from "./workflow-templates";

describe("withScoring spacing (no overlap)", () => {
  it("keeps every adjacent node at least STEP apart on x", () => {
    const { nodes } = createTemplate("Регистрация", "new"); // new → has scoring
    const xs = nodes.map((n) => n.position.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(210);
    }
  });
});
```
> Confirm `createTemplate(signalType, sourceType)` is the real 2-arg signature (it is, per the campaign-first work). If `Регистрация` isn't a valid `SignalType`, use the correct enum value.
- [ ] **Step 2:** Run → FAIL (gap is 105 between source and scoring).
- [ ] **Step 3: Fix `withScoring`** — change the scoring x from `entry.position.x + STEP / 2` to `entry.position.x + STEP`, and the downstream shift from `STEP / 2` to `STEP` (both occurrences). Edges (`entry→scoring`, `scoring→first`) unchanged.
- [ ] **Step 4:** Run → PASS. Full suite green; tsc clean (filtered).
- [ ] **Step 5: Commit** `git commit -am "fix(workflow): space scoring node a full STEP so it no longer overlaps the source node"`

---

## Task 3: Budget step copy — ~, contacts, subtitle, daily-days (#7,#8,#9,#11)

**Files:** Modify `src/sections/campaigns/wizard/steps/step-budget.tsx`. Read it first.

- [ ] **Step 1:** `buildBudgetRows` / row rendering — prefix estimate amounts with `~`. Add a `formatRubApprox(n) => "~" + formatRub(n)` helper (reuse `formatRub`). Apply to Сигналы, Коммуникация, Итого amounts.
- [ ] **Step 2:** Сигналы row — before the amount show `~N контактов` where `N = data.fileRowCount ?? 10000` (FALLBACK_BASE; import or inline the constant the estimator uses). Render e.g. label `Сигналы`, then `~{formatNumber(N)} контактов` then the amount. Keep `formatNumber` (ru-RU grouping).
- [ ] **Step 3:** Subtitle — change to `Рассчитали стоимость по выбранному источнику, каналам${data.fileRowCount ? " и размеру базы" : ""}.`
- [ ] **Step 4:** Daily budget line (stream only) — change to `~{formatRub(dailyBudget)}/день × {STREAM_DAYS} дн · потолок ~{formatRub(total)}`. Import `STREAM_DAYS` from `campaign-budget-estimate.ts` (export it if not already exported).
- [ ] **Step 5:** Build + tests: `npx tsc --noEmit` filtered clean; `npx vitest run` green (update any step-budget snapshot/text test to the new copy — do not weaken behavioral assertions).
- [ ] **Step 6: Commit** `git commit -am "feat(budget): ~ approximations, ~N контактов, base-size subtitle, daily×days copy"`

---

## Task 4: Budget step — proportional recalc on custom sum (#10)

**Files:** Modify `src/sections/campaigns/wizard/steps/step-budget.tsx`; use `scale-breakdown.ts`.

Current: breakdown memoized on `[sourceType, channels, fileRowCount]`, independent of the custom value; only the recommended headline reflects the estimate.

- [ ] **Step 1:** Compute `recommendedRows` (the estimate-derived rows incl. their amounts) and `recommendedTotal = estimate.total`. When mode is "Своя сумма" with `customValue > 0`, derive `displayRows = scaleBreakdown(recommendedRows, customValue, recommendedTotal)`; else `displayRows = recommendedRows`. Render Сигналы/Коммуникация/Итого from `displayRows`. The `~N контактов` figure scales by the same factor: `Math.round(N * customValue / recommendedTotal)` in custom mode.
- [ ] **Step 2:** Keep the "Своя сумма" input + continue payload (`budget`) as-is; only the breakdown display now reacts to it. Ensure no infinite re-render (derive in render or `useMemo` on `[recommendedRows, mode, customValue]`).
- [ ] **Step 3:** Test — add a small render/unit test: in custom mode the displayed Итого equals the entered sum and Сигналы scales proportionally. (If component testing is heavy, add a focused test on the derivation by extracting a tiny pure `budgetDisplayRows(...)` and testing that.)
- [ ] **Step 4:** Build + tests green.
- [ ] **Step 5: Commit** `git commit -am "feat(budget): custom sum proportionally rescales the breakdown"`

---

## Task 5: Payment screen — remove block, inline shortfall, proportional recalc (#13,#14,#15)

**Files:** Modify `src/sections/campaigns/campaign-payment-screen.tsx`; use `scale-breakdown.ts`. Read it first.

- [ ] **Step 1 (#13):** Remove the amber "Стоимость / Баланс / Не хватает" block (~401-428).
- [ ] **Step 2 (#14):** Add an inline hint near the budget selection that renders only when `shortfall > 0`: `Не хватает ₽{formatRub(shortfall)}` (muted/amber text, compact). `shortfall = computeShortfall(balance, activeBudget)`; reacts to both recommended and custom. Enough balance → render nothing.
- [ ] **Step 3 (#15):** "Из чего складывается стоимость" — when "Своя сумма" with `customValue > 0`, rescale `cost.lines` proportionally via `scaleBreakdown(lines, customValue, cost.total)` and likewise the `paymentSplit` rows shown; recommended mode keeps the original. Map `cost.lines`/`paymentSplit` to `{key, amount, ...rest}` shape for the helper, then back for render.
- [ ] **Step 4:** Build + tests green (update payment-screen tests that asserted the removed block; do not weaken others).
- [ ] **Step 5: Commit** `git commit -am "feat(payment): drop balance block, inline shortfall hint, custom sum rescales breakdown"`

---

## Task 6: Scenario card — source tag inside + remove inner scroll (#2,#3)

**Files:** Modify `src/sections/signals/scenario-card.tsx`, `src/sections/campaigns/wizard/steps/step-1-scenario.tsx`. Read both.

- [ ] **Step 1 (#2):** Add optional prop `sourceLabel?: string` to `ScenarioCard`. When present, render a compact neutral badge INSIDE the card (e.g. top-right, or under the description) with just the label (no "Источник:"). Use existing badge styling (`Badge` / the chip classes), NOT brand-yellow.
- [ ] **Step 2 (#2):** In `step-1-scenario.tsx`, remove the external `SourceTypeChip` wrapper under each card; instead pass `sourceLabel={sourceTypeLabel(s.recommendedSourceType)}` into `ScenarioCard`. Keep `sourceTypeLabel`. Delete the now-unused `SourceTypeChip` component if nothing else uses it.
- [ ] **Step 3 (#3):** Remove the `max-h-[420px] overflow-y-auto pr-2 [scrollbar-*]` scroll container and its fade-gradient logic (`canScrollUp`/`canScrollDown`, scroll refs/handlers). Container grows with content; page scroll handles overflow.
- [ ] **Step 4:** Build + tests green (update step-1/scenario-card tests for the new chip placement; keep selection-behavior assertions).
- [ ] **Step 5: Commit** `git commit -am "feat(catalog): source tag inside scenario card; remove inner scroll"`

---

## Task 7: Catalog restructure — Подобрали для вас + Показать все (#4)

**Files:** Modify `src/sections/campaigns/wizard/steps/step-1-scenario.tsx`. Reuse `curatedScenarioCount`/`SCENARIOS` from `src/data/scenarios.ts`.

- [ ] **Step 1:** Add local `const [showAll, setShowAll] = useState(false)` (reset on mount/step entry).
- [ ] **Step 2 (default view, `!showAll`):** Render a single section titled **«Подобрали для вас»** with the curated scenarios (`SCENARIOS.filter(s => s.isCurated)`) as a `grid grid-cols-3` of `ScenarioCard`s (with `sourceLabel`). Below it a **«Показать все»** button → `setShowAll(true)`.
- [ ] **Step 3 (expanded view, `showAll`):** Keep the existing category filter chips + search. Render every category section, each showing **ALL** its cards. Remove `COLLAPSED_PER_GROUP`, the per-group "Показать ещё"/"Свернуть" buttons, and `expandedGroups` state.
- [ ] **Step 4:** Selecting a card in either view → `onNext({ scenario: id })` (unchanged auto-advance).
- [ ] **Step 5:** Build + tests green (update step-1 tests: default shows curated + «Показать все»; after click shows all categories fully expanded with filter chips).
- [ ] **Step 6: Commit** `git commit -am "feat(catalog): curated default + Показать все full categorized catalog"`

---

## Task 8: Survey — optional «Сайт компании» field (#1, TDD on logic)

**Files:** Modify `src/sections/survey/survey-form.tsx`, `src/state/survey-validation.ts` (if a helper is added), `src/state/app-state.ts` (verify `survey_completed` alias handling). Tests: `src/sections/survey/survey-form.test.tsx` (or a reducer/validation test).

- [ ] **Step 1: Failing test** — assert the submit splits the two fields: filling task + leaving site empty yields a `survey` with `taskDescription` set and `companyWebsite` empty, and submit is allowed (valid). Filling both yields both set. (Test the submit handler's produced `Survey` patch, or via a small extracted pure `buildSurveyPatch(task, site)` if cleaner.)
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** In `SurveyForm`: add a second optional `Input` «Сайт компании» (`survey.companyWebsite` seed; separate local state `site`). On submit: `companyWebsite = site.trim()`, `taskDescription = task.trim()` (no longer mirror task into companyWebsite). Validation gate stays `isTaskDescriptionValid(task)` only — site optional. Keep the existing `survey_updated` dispatch + `onSubmit`.
- [ ] **Step 4:** Verify reducer `survey_completed` writes `accountSettings.companyWebsite` from `action.survey.companyWebsite || state.accountSettings.companyWebsite` (already alias-safe — empty site won't clobber). No reducer change expected; confirm by reading.
- [ ] **Step 5:** Run → PASS; full suite green; tsc clean.
- [ ] **Step 6: Commit** `git commit -am "feat(survey): optional Сайт компании field, split from task description"`

---

## Task 9: Dynamic wizard foundation — `stepsForSource` (#5 core, TDD)

**Files:** Create `src/sections/campaigns/wizard/wizard-steps.ts` + test. This task ONLY adds the step model + switches the stepper/workspace to consume it; step CONTENT comes in Task 10.

- [ ] **Step 1: Failing test** `wizard-steps.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { stepsForSource } from "./wizard-steps";

describe("stepsForSource", () => {
  it("new: scenario, source, interests, file, channels, budget", () => {
    expect(stepsForSource("new")).toEqual(["scenario","source","interests","file","channels","budget"]);
  });
  it("own: scenario, source, file, channels, budget (no interests)", () => {
    expect(stepsForSource("own")).toEqual(["scenario","source","file","channels","budget"]);
  });
  it("stream: scenario, source, interests, integration, channels, budget (no file)", () => {
    expect(stepsForSource("stream")).toEqual(["scenario","source","interests","integration","channels","budget"]);
  });
  it("before a source is chosen, only scenario+source are known", () => {
    expect(stepsForSource(undefined)).toEqual(["scenario","source"]);
  });
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `wizard-steps.ts`:
```ts
import type { SourceType } from "@/types/campaign";

export type WizardStepId =
  | "scenario" | "source" | "interests" | "file" | "integration" | "channels" | "budget";

/** The ordered step list depends on the chosen source (spec §C). Until a source
 *  is picked only scenario+source are determined. */
export function stepsForSource(source: SourceType | undefined): WizardStepId[] {
  const head: WizardStepId[] = ["scenario", "source"];
  if (!source) return head;
  const tail: WizardStepId[] =
    source === "new" ? ["interests", "file"]
    : source === "own" ? ["file"]
    : ["interests", "integration"]; // stream
  return [...head, ...tail, "channels", "budget"];
}
```
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Wire the stepper/workspace to the dynamic list** (read `campaign-stepper.tsx`, `campaign-workspace.tsx`, `wizard-navigation.ts` first):
  - `campaign-stepper.tsx`: derive visible step labels from `stepsForSource(stepData.sourceType)` (map step-id → ru label) instead of hardcoded `STEPPER_ITEMS`.
  - `campaign-workspace.tsx`: `renderStepContent` switches on `WizardStepId` (by current step's id from the dynamic list, not a fixed 1-4). Advance/back operate on the index in the dynamic list. Changing `sourceType` on the `source` step recomputes the tail and resets downstream `stepData` (mirror existing scenario-change reset in `computeStepTransition`).
  - `wizard-navigation.ts`: update `computeStepTransition` to take/produce positions in the dynamic list, or add a parallel helper; keep scenario-change reset semantics.
- [ ] **Step 6:** Until Task 10 adds new content components, map `interests`/`integration`/`file` to the CURRENT `StepSource` render (or a temporary passthrough) so the build stays green. Prefer to land Task 9 + Task 10 close together; if the wiring can't stay green alone, fold Step 5-6 wiring into Task 10 and keep Task 9 as just the pure `stepsForSource` + test + commit.
- [ ] **Step 7:** tsc clean (filtered); vitest green.
- [ ] **Step 8: Commit** `git commit -am "feat(wizard): stepsForSource model + dynamic stepper wiring"`

---

## Task 10: Source-gated wizard step content (#5, #6)

**Files:** Modify `src/sections/campaigns/wizard/steps/step-source.tsx` (source-only); reuse/adapt `step-2-interests.tsx` (interests), `step-4-upload.tsx` (file); create `step-integration.tsx`; `src/types/campaign.ts` (`apiKey?: string`). Wire into `campaign-workspace.tsx` `renderStepContent`.

- [ ] **Step 1:** `step-source.tsx` → render ONLY the 3 source radio-cards + Back/Continue. Remove the interests block, the file `DropZone`, and the stream auto-note from this step. Continue is enabled once a `sourceType` is set; selecting/continuing advances into the recomputed tail.
- [ ] **Step 2 (interests step):** Use `step-2-interests.tsx` (or extract the interests chip block from the old step-source) as the `interests` step for `new`/`stream`. It reads/writes `stepData.interests`. Has Back/Continue.
- [ ] **Step 3 (file step):** Use `step-4-upload.tsx` (or the DropZone block) as the `file` step.
  - `new` → header «Загрузите вашу базу», file REQUIRED to continue.
  - `own` → header/ copy «Загрузите ваш список сигналов» (own ready signals, no scoring — mirror the old `upload-signal-dialog` framing), file required. Same `DropZone` + hashing + `simulateRowCount` → `stepData.fileRowCount`.
  - Distinguish copy by `stepData.sourceType`.
- [ ] **Step 4 (integration step, #6):** Create `step-integration.tsx` for `stream`: short integration instruction text + an `Input` «API-ключ» bound to `stepData.apiKey`. Add `apiKey?: string` to `StepData` in `types/campaign.ts` and to `initialStepData`. Prototype validation: Continue allowed even if empty (non-blocking) — or require non-empty; default to non-blocking per spec open-question. Back/Continue present.
- [ ] **Step 5:** `renderStepContent` (campaign-workspace) maps each `WizardStepId` to its component, threading `data`/`onNext`/`onBack`. The Budget step stays the launch step (its `onNext` → `handleLaunchFromBudget`). Channels step unchanged.
- [ ] **Step 6:** Continue gates per step: `source` needs sourceType; `file` (new/own) needs a file; `interests` no hard gate; `integration` non-blocking; `channels`/`budget` as today.
- [ ] **Step 7:** Build + tests: tsc clean (filtered); vitest green. Update wizard tests that assumed the old single StepSource (source+interests+file together) → now separate steps. Add/adjust tests: new has interests+file steps; own has file-only (no interests); stream has interests+integration (no file).
- [ ] **Step 8: Commit** `git commit -am "feat(wizard): source-gated steps — interests/file/integration split per source"`

---

## Task 11: End-to-end verification

- [ ] **Step 1:** `cd /tmp/afina-wt && npx tsc --noEmit 2>&1 | grep -c "error TS"` → 13; `... | grep -vE "ai-elements|campaign-cost" | grep "error TS"` → empty. `npx vitest run 2>&1 | tail -3` → all pass.
- [ ] **Step 2: Manual smoke** (`npm run dev` already runs from this worktree on :3000). Walk: survey (site optional) → catalog (Подобрали + Показать все, chip inside card, no inner scroll) → pick scenario → source-only step → per-source steps (new: interests→file required; own: signals-file; stream: interests→API-key) → channels → budget (~, ~N контактов, subtitle, custom-sum rescales, stream daily×days) → launch → payment (no balance block, inline shortfall only when short, custom-sum rescales breakdown). Open a launched campaign's workflow → scoring node no longer overlaps the source node.
- [ ] **Step 3:** Report branch + commit list. Do not merge (AGENTS.md).

---

## Self-Review notes

- **Spec coverage:** A→T8; B(#2,#3)→T6, B(#4)→T7; C(#5)→T9+T10, C(#6)→T10; D(#7,#8,#9,#11)→T3, D(#10)→T4; E→T2; F→T5. Shared helper (#10/#15)→T1.
- **Type consistency:** `scaleBreakdown` row shape `{key, amount, ...}` used in T1/T4/T5; `WizardStepId`/`stepsForSource` in T9/T10; `StepData.apiKey?` added T10.
- **Risk order:** pure helper + bug + copy first; biggest (dynamic wizard) last (T9→T10 land together to stay green).
- **Open (per spec):** API-key validation non-blocking for the prototype; exact chip placement in `ScenarioCard` per existing badge patterns.

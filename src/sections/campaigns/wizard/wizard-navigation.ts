import type { StepData } from "@/types/campaign";
import type { WizardStepId } from "./wizard-steps";

/** The wizard step on which the scenario is chosen (Step1Scenario). */
export const SCENARIO_STEP = 1;

/** The wizard step on which the intent is chosen (StepIntent). */
export const INTENT_STEP = 2;

export interface StepTransition {
  /** Step to land on after the transition. */
  step: number;
  /**
   * When true, the caller must rewind progress (collapse `maxStep`/
   * `currentStep` back to `step`) AND apply a data reset — the shape of that
   * reset differs by cause:
   *  - scenario changed: narrow cascade, only the fields listed for
   *    `"scenario"` in `STEP_INVALIDATES` (currently just the budget) —
   *    interests/triggers/base/channels don't depend on the scenario.
   *  - intent changed: full downstream reset, because the intent decides the
   *    step list's tail, not just some field values.
   * NOT renamed to something graph-flavored: this codebase already has an
   * unrelated `CampaignGraph`/comm-graph concept (workflow-graph-cache,
   * use-campaign-graph-applier), and this flag still drives step-position
   * rewind, not just a data reset — a graph-themed name would misleadingly
   * suggest it touches that other graph.
   */
  resetData: boolean;
}

/**
 * Computes the next wizard step when a step submits its data.
 *
 * Four cases, in priority order:
 *
 * 1. Scenario changed — rewind to the step immediately after the scenario
 *    picker (always {@link SCENARIO_STEP} + 1). The scenario no longer wipes
 *    everything downstream — only the narrow cascade in `STEP_INVALIDATES`
 *    (the budget) — since interests/triggers/base/channels don't depend on
 *    the scenario. This is keyed off the scenario step, NOT `currentStep`:
 *    the user can scroll back to the rendered step-1 panel and pick a new
 *    scenario without clicking the stepper, which leaves `currentStep`
 *    further along. Using `currentStep + 1` there would skip steps
 *    (2 → 3 → 4 …) on each re-pick. Takes priority over an intent change (a
 *    new scenario resets everything, including the intent).
 *
 * 2. Intent changed — the chosen intent decides the tail of the step list
 *    (interests / analysis / file / channels differ per intent), so rewind to
 *    the step right after the intent picker ({@link INTENT_STEP} + 1) and reset
 *    ALL downstream data (unlike the scenario case above, this one really
 *    does invalidate everything, because the step list itself changes
 *    shape). Analogous to the scenario rewind but anchored one step later,
 *    keeping scenario + the new intent.
 *
 * 3. Revisited an earlier step (no scenario/intent change) — jump forward to
 *    the furthest step already reached instead of advancing by one, so filled
 *    progress isn't re-walked.
 *
 * 4. Otherwise — advance one step.
 */
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

/**
 * Что обнуляется при смене значения шага.
 *
 * Таблица закрывает и обычный проход визарда, и точечную правку с карточки —
 * иначе два пути неизбежно разъехались бы в том, что считается протухшим.
 *
 * Шаг «Бюджет» пересчитывается по `[scenario, sourceType, channels,
 * fileRowCount]` (см. `step-budget.tsx`) — исчерпывающий список входов,
 * отсюда и состав ключей. «Цель» отсутствует намеренно: она меняет сам
 * СОСТАВ шагов, а не значения, и обрабатывается отдельной веткой полного
 * сброса в `computeStepTransition`.
 */
export const STEP_INVALIDATES: Partial<Record<WizardStepId, WizardStepId[]>> = {
  scenario: ["budget"],
  analysis: ["budget"],
  file: ["budget"],
  channels: ["budget"],
};

export function invalidatedBy(step: WizardStepId): WizardStepId[] {
  return STEP_INVALIDATES[step] ?? [];
}

/** Значения по умолчанию для обнулённых шагов. Автоматического пересчёта нет —
 *  в том числе для рекомендуемой суммы бюджета: шаг проходится заново вручную. */
export function resetFieldsFor(steps: WizardStepId[]): Partial<StepData> {
  const patch: Partial<StepData> = {};
  if (steps.includes("budget")) {
    patch.budget = null;
    patch.budgetMode = undefined;
    patch.dailyBudget = undefined;
    patch.maxDailyBudget = undefined;
  }
  return patch;
}

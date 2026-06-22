/** The wizard step on which the scenario is chosen (Step1Scenario). */
export const SCENARIO_STEP = 1;

/** The wizard step on which the source is chosen (StepSource). */
export const SOURCE_STEP = 2;

export interface StepTransition {
  /** Step to land on after the transition. */
  step: number;
  /**
   * When true, every downstream StepData field must be reset to defaults —
   * the scenario changed, so prior interests/triggers/segments/budget no
   * longer apply.
   */
  resetData: boolean;
}

/**
 * Computes the next wizard step when a step submits its data.
 *
 * Four cases, in priority order:
 *
 * 1. Scenario changed — rewind to the step immediately after the scenario
 *    picker (always {@link SCENARIO_STEP} + 1) and reset downstream data.
 *    This is keyed off the scenario step, NOT `currentStep`: the user can
 *    scroll back to the rendered step-1 panel and pick a new scenario without
 *    clicking the stepper, which leaves `currentStep` further along. Using
 *    `currentStep + 1` there would skip steps (2 → 3 → 4 …) on each re-pick.
 *    Takes priority over a source change (a new scenario resets everything,
 *    including the source).
 *
 * 2. Source changed — the chosen source decides the tail of the step list
 *    (interests / file / integration differ per source), so rewind to the
 *    step right after the source picker ({@link SOURCE_STEP} + 1) and reset
 *    downstream data. Analogous to the scenario rewind but anchored one step
 *    later, keeping scenario + the new source.
 *
 * 3. Revisited an earlier step (no scenario/source change) — jump forward to
 *    the furthest step already reached instead of advancing by one, so filled
 *    progress isn't re-walked.
 *
 * 4. Otherwise — advance one step.
 */
export function computeStepTransition(args: {
  currentStep: number;
  maxStep: number;
  scenarioChanged: boolean;
  sourceChanged?: boolean;
}): StepTransition {
  const { currentStep, maxStep, scenarioChanged, sourceChanged } = args;

  if (scenarioChanged) {
    return { step: SCENARIO_STEP + 1, resetData: true };
  }

  if (sourceChanged) {
    return { step: SOURCE_STEP + 1, resetData: true };
  }

  if (currentStep < maxStep) {
    return { step: maxStep, resetData: false };
  }

  return { step: currentStep + 1, resetData: false };
}

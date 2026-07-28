import { describe, expect, it } from "vitest";
import { computeStepTransition, invalidatedBy, resetFieldsFor } from "./wizard-navigation";

describe("computeStepTransition", () => {
  it("advances one step on a normal submit", () => {
    expect(
      computeStepTransition({ currentStep: 2, maxStep: 2, scenarioChanged: false })
    ).toEqual({ step: 3, resetData: false });
  });

  it("jumps to the furthest reached step when revisiting an earlier step", () => {
    expect(
      computeStepTransition({ currentStep: 2, maxStep: 5, scenarioChanged: false })
    ).toEqual({ step: 5, resetData: false });
  });

  it("rewinds to step 2 and resets data when the scenario changes from step 1", () => {
    expect(
      computeStepTransition({ currentStep: 1, maxStep: 1, scenarioChanged: true })
    ).toEqual({ step: 2, resetData: true });
  });

  // The reported bug: the user advances to step 2, scrolls back to the
  // still-rendered step-1 panel (without clicking the stepper, so currentStep
  // stays 2) and picks a different scenario. Must land on step 2, not 3.
  it("rewinds to step 2 even when scenario is changed after scrolling back (currentStep > 1)", () => {
    expect(
      computeStepTransition({ currentStep: 2, maxStep: 2, scenarioChanged: true })
    ).toEqual({ step: 2, resetData: true });
  });

  it("rewinds to step 2 no matter how far along currentStep is", () => {
    expect(
      computeStepTransition({ currentStep: 5, maxStep: 5, scenarioChanged: true })
    ).toEqual({ step: 2, resetData: true });
  });

  it("intent changed → rewind to INTENT_STEP + 1 with reset", () => {
    expect(
      computeStepTransition({ currentStep: 5, maxStep: 6, scenarioChanged: false, intentChanged: true }),
    ).toEqual({ step: 3, resetData: true });
  });

  it("scenario change takes priority over a simultaneous intent change", () => {
    expect(
      computeStepTransition({
        currentStep: 4,
        maxStep: 6,
        scenarioChanged: true,
        intentChanged: true,
      })
    ).toEqual({ step: 2, resetData: true });
  });
});

describe("STEP_INVALIDATES", () => {
  it("смена каналов обнуляет бюджет", () => {
    expect(invalidatedBy("channels")).toEqual(["budget"]);
  });

  it("смена базы и режима анализа обнуляет бюджет", () => {
    expect(invalidatedBy("file")).toEqual(["budget"]);
    expect(invalidatedBy("analysis")).toEqual(["budget"]);
  });

  it("смена сценария обнуляет только бюджет — интересы и база от него не зависят", () => {
    expect(invalidatedBy("scenario")).toEqual(["budget"]);
  });

  it("интересы и бюджет не обнуляют ничего", () => {
    expect(invalidatedBy("interests")).toEqual([]);
    expect(invalidatedBy("budget")).toEqual([]);
  });

  it("сброс бюджета возвращает поля шага к значениям по умолчанию", () => {
    expect(resetFieldsFor(["budget"])).toEqual({
      budget: null,
      budgetMode: undefined,
      dailyBudget: undefined,
      maxDailyBudget: undefined,
    });
  });
});

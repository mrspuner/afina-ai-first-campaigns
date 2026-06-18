import { describe, expect, it } from "vitest";
import { STEPPER_ITEMS } from "./campaign-stepper";

describe("STEPPER_ITEMS", () => {
  it("starts with 'Выбор сценария' as step 1", () => {
    expect(STEPPER_ITEMS[0]).toEqual({ label: "Выбор сценария", step: 1 });
  });

  it("keeps interests as step 2 and result as step 8", () => {
    expect(STEPPER_ITEMS.find((i) => i.step === 2)?.label).toBe("Интересы");
    expect(STEPPER_ITEMS.find((i) => i.step === 8)?.label).toBe("Результат");
  });

  it("covers steps 1..8 contiguously", () => {
    expect(STEPPER_ITEMS.map((i) => i.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

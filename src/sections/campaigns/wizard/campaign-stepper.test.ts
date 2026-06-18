import { describe, expect, it } from "vitest";
import { STEPPER_ITEMS } from "./campaign-stepper";

describe("STEPPER_ITEMS", () => {
  it("has exactly the four campaign steps in order", () => {
    expect(STEPPER_ITEMS.map((s) => s.label)).toEqual([
      "Сценарий",
      "Источник",
      "Каналы",
      "Бюджет",
    ]);
  });

  it("covers steps 1..4 contiguously", () => {
    expect(STEPPER_ITEMS.map((i) => i.step)).toEqual([1, 2, 3, 4]);
  });
});

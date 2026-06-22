import { describe, expect, it } from "vitest";
import { STEP_LABELS } from "./campaign-stepper";
import { stepsForSource } from "./wizard-steps";

describe("STEP_LABELS", () => {
  it("maps every wizard step id to a Russian label", () => {
    expect(STEP_LABELS).toEqual({
      scenario: "Сценарий",
      source: "Источник",
      interests: "Интересы",
      file: "Файл",
      integration: "Интеграция",
      channels: "Каналы",
      budget: "Бюджет",
    });
  });

  it("labels every step in each source-gated sequence", () => {
    for (const source of ["new", "own", "stream"] as const) {
      const labels = stepsForSource(source).map((id) => STEP_LABELS[id]);
      expect(labels.every((l) => typeof l === "string" && l.length > 0)).toBe(true);
    }
  });

  it("new sequence renders Сценарий→Источник→Интересы→Файл→Каналы→Бюджет", () => {
    expect(stepsForSource("new").map((id) => STEP_LABELS[id])).toEqual([
      "Сценарий",
      "Источник",
      "Интересы",
      "Файл",
      "Каналы",
      "Бюджет",
    ]);
  });

  it("own sequence omits Интересы; stream omits Файл and adds Интеграция", () => {
    const own = stepsForSource("own").map((id) => STEP_LABELS[id]);
    expect(own).not.toContain("Интересы");
    expect(own).toContain("Файл");

    const stream = stepsForSource("stream").map((id) => STEP_LABELS[id]);
    expect(stream).not.toContain("Файл");
    expect(stream).toContain("Интеграция");
    expect(stream).toContain("Интересы");
  });
});

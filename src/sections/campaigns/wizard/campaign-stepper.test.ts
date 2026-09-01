import { describe, expect, it } from "vitest";
import { STEP_LABELS } from "./campaign-stepper";
import { stepsForIntent } from "./wizard-steps";

describe("STEP_LABELS", () => {
  it("maps every wizard step id to a Russian label", () => {
    expect(STEP_LABELS).toEqual({
      scenario: "Сценарий",
      intent: "Цель",
      interests: "Интересы",
      analysis: "Режим",
      file: "Файл",
      integration: "Интеграция",
      channels: "Каналы",
      budget: "Бюджет",
    });
  });

  it("labels every step in each intent-gated sequence", () => {
    for (const intent of ["signals", "signals-comms", "comms-own"] as const) {
      const labels = stepsForIntent(intent).map((id) => STEP_LABELS[id]);
      expect(labels.every((l) => typeof l === "string" && l.length > 0)).toBe(true);
    }
  });

  // STEP_LABELS — семантические названия шагов: их читают поповер пилюли на
  // карточке («Настройка · Бюджет») и контекст ИИ. Подпись В СТЕППЕРЕ у
  // последнего шага другая («Проверка настроек») и живёт отдельной картой —
  // см. тест рендера в campaign-stepper.test.tsx.
  it("A path renders Сценарий→Цель→Интересы→Режим→Файл→Бюджет (no Каналы)", () => {
    expect(stepsForIntent("signals").map((id) => STEP_LABELS[id])).toEqual([
      "Сценарий", "Цель", "Интересы", "Режим", "Файл", "Бюджет",
    ]);
  });

  it("C path omits Интересы and Режим", () => {
    const labels = stepsForIntent("comms-own").map((id) => STEP_LABELS[id]);
    expect(labels).not.toContain("Интересы");
    expect(labels).not.toContain("Режим");
    expect(labels).toContain("Каналы");
  });
});

// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { StepBudget } from "./step-budget";
import { initialStepData } from "@/types/campaign";

// StepContent прячет детей за печатающейся анимацией — стабим, как в других
// тестах шагов, чтобы тело шага рендерилось синхронно.
vi.mock("@/sections/campaigns/wizard/steps/step-content", () => ({
  StepContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
// Шагу нужен только рендер тела: подсказки экрана к бюджету отношения не имеют.
vi.mock("@/hooks/use-screen-hints", () => ({ useScreenHints: () => {} }));

afterEach(cleanup);

const streamData = {
  ...initialStepData,
  scenario: "base-registration",
  sourceType: "stream" as const,
  channels: ["sms" as const],
  fileRowCount: 10_000,
};

function renderStep(over: Partial<typeof streamData> = {}) {
  const onNext = vi.fn();
  render(
    <StepBudget data={{ ...streamData, ...over }} onNext={onNext} onBack={vi.fn()} active />,
  );
  return onNext;
}

/**
 * Регрессия: «Максимальный дневной бюджет» жил только в локальном useState —
 * proceed() его не передавал, поэтому введённое значение терялось при уходе
 * со шага и никогда не доезжало до кампании.
 */
describe("StepBudget — потолок дневного бюджета сохраняется", () => {
  it("введённое значение уезжает в onNext", () => {
    const onNext = renderStep();
    fireEvent.change(screen.getByLabelText("Максимальный дневной бюджет"), {
      target: { value: "5000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({ maxDailyBudget: 5000 }),
    );
  });

  it("инпут восстанавливается из уже сохранённых данных", () => {
    renderStep({ maxDailyBudget: 7000 });
    expect(screen.getByLabelText("Максимальный дневной бюджет")).toHaveValue("7000");
  });

  it("очистка поля снимает потолок (undefined, а не 0)", () => {
    const onNext = renderStep({ maxDailyBudget: 7000 });
    fireEvent.change(screen.getByLabelText("Максимальный дневной бюджет"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({ maxDailyBudget: undefined }),
    );
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { canContinueFromIntent, StepIntent } from "./step-intent";
import { initialStepData, type StepData } from "@/types/campaign";

vi.mock("@/sections/campaigns/wizard/steps/step-content", () => ({
  StepContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("canContinueFromIntent", () => {
  it("true once an intent is chosen (all three valid)", () => {
    expect(canContinueFromIntent("signals")).toBe(true);
    expect(canContinueFromIntent("signals-comms")).toBe(true);
    expect(canContinueFromIntent("comms-own")).toBe(true);
  });
});

describe("StepIntent", () => {
  afterEach(cleanup);

  function renderStep(over: Partial<StepData> = {}) {
    const data: StepData = { ...initialStepData, ...over };
    const onNext = vi.fn();
    render(<StepIntent data={data} onNext={onNext} onBack={vi.fn()} />);
    return { onNext };
  }

  it("defaults to «Сигналы + коммуникация» (initialStepData.intent)", () => {
    renderStep();
    expect(
      screen.getByRole("button", { name: /Сигналы \+ коммуникация/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("switches intent on click and emits it (with derived sourceType) on continue", () => {
    const { onNext } = renderStep();
    fireEvent.click(screen.getByRole("button", { name: /Коммуникация по своим сигналам/i }));
    fireEvent.click(screen.getByRole("button", { name: /Далее/i }));
    expect(onNext).toHaveBeenCalledWith({ intent: "comms-own", sourceType: "own" });
  });
});

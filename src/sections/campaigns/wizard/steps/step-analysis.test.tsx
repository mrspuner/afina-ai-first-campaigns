import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { canContinueFromAnalysis, StepAnalysis } from "./step-analysis";
import { initialStepData, type StepData } from "@/types/campaign";

vi.mock("@/sections/campaigns/wizard/steps/step-content", () => ({
  StepContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("canContinueFromAnalysis", () => {
  it("true once a mode is chosen", () => {
    expect(canContinueFromAnalysis("once")).toBe(true);
    expect(canContinueFromAnalysis("stream")).toBe(true);
  });
});

describe("StepAnalysis", () => {
  afterEach(cleanup);

  function renderStep(over: Partial<StepData> = {}) {
    const data: StepData = { ...initialStepData, intent: "signals", ...over };
    const onNext = vi.fn();
    render(<StepAnalysis data={data} onNext={onNext} onBack={vi.fn()} />);
    return { onNext };
  }

  it("defaults to «Разовый» (initialStepData.analysisMode)", () => {
    renderStep();
    expect(screen.getByRole("button", { name: /Разовый/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("picking «Потоковый» emits analysisMode + derived sourceType (stream)", () => {
    const { onNext } = renderStep({ intent: "signals" });
    fireEvent.click(screen.getByRole("button", { name: /Потоковый/i }));
    fireEvent.click(screen.getByRole("button", { name: /Далее/i }));
    expect(onNext).toHaveBeenCalledWith({ analysisMode: "stream", sourceType: "stream" });
  });
});

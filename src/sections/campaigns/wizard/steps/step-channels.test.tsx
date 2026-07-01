import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { StepChannels, toggleChannel, formatUnitCost } from "./step-channels";
import { initialStepData, type StepData } from "@/types/campaign";

vi.mock("@/sections/campaigns/wizard/steps/step-content", () => ({
  StepContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("toggleChannel (StepChannels selection logic)", () => {
  it("adds a channel when absent", () => {
    expect(toggleChannel([], "sms")).toEqual(["sms"]);
  });
  it("removes a channel when present", () => {
    expect(toggleChannel(["sms", "push"], "sms")).toEqual(["push"]);
  });
  it("preserves canonical channel order", () => {
    const out = toggleChannel(["push"], "sms");
    expect(out).toEqual(["sms", "push"]);
  });
});

describe("formatUnitCost (стоимость канала за отправку)", () => {
  it("целое число рублей без копеек", () => {
    expect(formatUnitCost("sms")).toBe("5 ₽ / отправка");
    expect(formatUnitCost("email")).toBe("1 ₽ / отправка");
    expect(formatUnitCost("ivr")).toBe("8 ₽ / отправка");
  });
  it("дробное — через запятую", () => {
    expect(formatUnitCost("push")).toBe("0,5 ₽ / отправка");
  });
});

describe("StepChannels — стоимость каналов", () => {
  afterEach(cleanup);

  it("показывает стоимость каждого канала за отправку", () => {
    render(<StepChannels data={initialStepData} onNext={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText("5 ₽ / отправка")).toBeInTheDocument();
    expect(screen.getByText("1 ₽ / отправка")).toBeInTheDocument();
    expect(screen.getByText("0,5 ₽ / отправка")).toBeInTheDocument();
    expect(screen.getByText("8 ₽ / отправка")).toBeInTheDocument();
  });
});

describe("StepChannels — channels are mandatory (no «только сигналы» escape)", () => {
  afterEach(cleanup);

  function renderStep(over: Partial<StepData> = {}) {
    const data: StepData = { ...initialStepData, channels: [], ...over };
    const onNext = vi.fn();
    render(<StepChannels data={data} onNext={onNext} onBack={vi.fn()} />);
    return { onNext };
  }

  it("does NOT render the «Получить только сигналы» option", () => {
    renderStep();
    expect(screen.queryByText("Получить только сигналы")).toBeNull();
  });

  it("«Далее» is disabled with no channels and enabled after selecting one", () => {
    renderStep();
    expect(screen.getByRole("button", { name: /Далее/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /SMS/i }));
    expect(screen.getByRole("button", { name: /Далее/i })).not.toBeDisabled();
  });
});

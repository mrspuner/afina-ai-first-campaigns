import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StepChannels, toggleChannel, formatUnitCost } from "./step-channels";
import { initialStepData } from "@/types/campaign";

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

describe("StepChannels — стоимость и блок «Получить только сигналы»", () => {
  afterEach(cleanup);

  it("показывает стоимость каждого канала за отправку", () => {
    render(<StepChannels data={initialStepData} onNext={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText("5 ₽ / отправка")).toBeInTheDocument();
    expect(screen.getByText("1 ₽ / отправка")).toBeInTheDocument();
    expect(screen.getByText("0,5 ₽ / отправка")).toBeInTheDocument();
    expect(screen.getByText("8 ₽ / отправка")).toBeInTheDocument();
  });

  it("блок «Получить только сигналы» с заголовком и описанием", () => {
    render(<StepChannels data={initialStepData} onNext={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText("Получить только сигналы")).toBeInTheDocument();
    expect(screen.getByText("Не проводить коммуникации")).toBeInTheDocument();
  });
});

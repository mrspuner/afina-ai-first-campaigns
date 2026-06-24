import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OnboardingScenariosScreen } from "./onboarding-scenarios-screen";

describe("OnboardingScenariosScreen — навигация", () => {
  it("показывает «Назад» (слева) и «Далее» (справа)", () => {
    render(<OnboardingScenariosScreen onChooseScenario={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Назад" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Далее" })).toBeInTheDocument();
  });
  it("«Назад» вызывает onBack", () => {
    const onBack = vi.fn();
    render(<OnboardingScenariosScreen onChooseScenario={vi.fn()} onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
  it("«Далее» вызывает onChooseScenario", () => {
    const onChoose = vi.fn();
    render(<OnboardingScenariosScreen onChooseScenario={onChoose} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(onChoose).toHaveBeenCalledTimes(1);
  });
});

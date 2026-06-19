import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OnboardingStepCards } from "./onboarding-step-cards";

describe("OnboardingStepCards — block-7 copy", () => {
  it("renders the three concept headings with the first card as Кампании", () => {
    render(<OnboardingStepCards />);
    expect(screen.getByText("Кампании")).toBeInTheDocument();
    expect(screen.getByText("Коммуникация")).toBeInTheDocument();
    expect(screen.getByText("Статистика")).toBeInTheDocument();
    expect(screen.queryByText("Сигналы")).not.toBeInTheDocument();
  });

  it("renders the Коммуникация description", () => {
    render(<OnboardingStepCards />);
    expect(
      screen.getByText(
        "Запускаем нужное сообщение в нужный момент — по выбранным каналам.",
      ),
    ).toBeInTheDocument();
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OnboardingStepCards } from "./onboarding-step-cards";

describe("OnboardingStepCards — block-8 copy", () => {
  it("renders the three concept headings with the first card as Сигналы", () => {
    render(<OnboardingStepCards />);
    expect(screen.getByText("Сигналы")).toBeInTheDocument();
    expect(screen.getByText("Кампании")).toBeInTheDocument();
    expect(screen.getByText("Статистика")).toBeInTheDocument();
    expect(screen.queryByText("Коммуникация")).not.toBeInTheDocument();
  });

  it("renders the Сигналы description about intent audiences", () => {
    render(<OnboardingStepCards />);
    expect(
      screen.getByText(
        "Находим, кому из клиентов нужна коммуникация прямо сейчас — по поведению и данным.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the Кампании description about launching on the audience", () => {
    render(<OnboardingStepCards />);
    expect(
      screen.getByText(
        "Запускаем кампанию на собранную аудиторию — нужное сообщение в нужный момент, по выбранным каналам.",
      ),
    ).toBeInTheDocument();
  });
});

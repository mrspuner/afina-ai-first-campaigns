import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OnboardingStepCards } from "./onboarding-step-cards";

describe("OnboardingStepCards — копирайт услуг", () => {
  it("рендерит три карточки: Сигналы / Коммуникации / Статистика", () => {
    render(<OnboardingStepCards />);
    expect(screen.getByText("Сигналы")).toBeInTheDocument();
    expect(screen.getByText("Коммуникации")).toBeInTheDocument();
    expect(screen.getByText("Статистика")).toBeInTheDocument();
    expect(screen.queryByText("Кампании")).not.toBeInTheDocument();
  });

  it("карточка «Сигналы» — описание про intent-аудитории", () => {
    render(<OnboardingStepCards />);
    expect(
      screen.getByText(
        "Находим, кому из клиентов нужна коммуникация прямо сейчас — по поведению и данным.",
      ),
    ).toBeInTheDocument();
  });

  it("карточка «Коммуникации» — описание про сообщение по каналам", () => {
    render(<OnboardingStepCards />);
    expect(
      screen.getByText(
        "Запускаем нужное сообщение в нужный момент — по выбранным каналам.",
      ),
    ).toBeInTheDocument();
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OnboardingStepCards } from "./onboarding-step-cards";

describe("OnboardingStepCards — три модели оплаты", () => {
  it("рендерит три карточки: Только сигналы / Сигналы + коммуникация / Коммуникация по файлу", () => {
    render(<OnboardingStepCards />);
    expect(screen.getByText("Только сигналы")).toBeInTheDocument();
    expect(screen.getByText("Сигналы + коммуникация")).toBeInTheDocument();
    expect(screen.getByText("Коммуникация по файлу")).toBeInTheDocument();
    // «Статистика» убрана из карточек.
    expect(screen.queryByText("Статистика")).not.toBeInTheDocument();
    expect(screen.queryByText("Кампании")).not.toBeInTheDocument();
  });

  it("карточка «Только сигналы» — про готовые сегменты и оплату за сигналы", () => {
    render(<OnboardingStepCards />);
    expect(
      screen.getByText(
        "Афина находит, кому из клиентов нужна коммуникация прямо сейчас, и отдаёт готовые сегменты. Платите за сигналы.",
      ),
    ).toBeInTheDocument();
  });

  it("карточка «Сигналы + коммуникация» — про запуск сообщений по каналам", () => {
    render(<OnboardingStepCards />);
    expect(
      screen.getByText(
        "Афина находит нужный момент и сама запускает сообщения по выбранным каналам. Платите за сигналы и коммуникацию.",
      ),
    ).toBeInTheDocument();
  });

  it("карточка «Коммуникация по файлу» — про загруженную базу", () => {
    render(<OnboardingStepCards />);
    expect(
      screen.getByText(
        "Уже знаете, кому писать — загрузите свою базу, афина отправит сообщения по каналам. Платите за коммуникацию.",
      ),
    ).toBeInTheDocument();
  });
});

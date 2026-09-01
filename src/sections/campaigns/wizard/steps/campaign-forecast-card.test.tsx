import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CampaignForecastCard } from "./campaign-forecast-card";

afterEach(cleanup);

const groups = {
  primary: [{ channel: "sms" as const, amount: 50_000 }],
  repeat: [{ channel: "sms" as const, amount: 15_000 }],
};

function renderCard() {
  render(
    <CampaignForecastCard
      budgetDisplay="~₽ 51 875"
      touchesDisplay="6 133"
      signalsDisplay="~₽ 3 125"
      communicationDisplay="~₽ 48 750"
      totalDisplay="~₽ 51 875"
      commGroups={groups}
      formatCell={(n) => `₽ ${n.toLocaleString("ru-RU")}`}
    />,
  );
}

describe("CampaignForecastCard", () => {
  it("несёт две строки прогноза и подзаголовок про источник расчёта", () => {
    renderCard();
    expect(screen.getByText("Прогноз кампании")).toBeInTheDocument();
    expect(
      screen.getByText("Рассчитан на основе настроек кампании"),
    ).toBeInTheDocument();
    expect(screen.getByText("~₽ 51 875")).toBeInTheDocument();
    expect(screen.getByText("Прогноз касаний")).toBeInTheDocument();
    expect(screen.getByText("6 133")).toBeInTheDocument();
  });

  it("разбивка свёрнута по умолчанию и раскрывается по строке бюджета", () => {
    renderCard();
    expect(screen.queryByText("Сигналы")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Рекомендуемый бюджет/ }));
    expect(screen.getByText("Сигналы")).toBeInTheDocument();
    expect(screen.getByText("~₽ 3 125")).toBeInTheDocument();
  });

  // «Итого» внутри разбивки — это та же сумма, что уже стоит в строке,
  // которая разбивку раскрывает. Два одинаковых числа подряд читались бы
  // как ошибка, поэтому строка скрыта (BudgetBreakdown hideTotal).
  it("в раскрытой разбивке нет строки «Итого» — она дублировала бы сумму выше", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Рекомендуемый бюджет/ }));
    expect(screen.queryByText("Итого")).toBeNull();
  });

  it("обещание про настройку бюджета при запуске читается как обычный текст, а не сноска", () => {
    renderCard();
    const note = screen.getByText(
      /Вы сможете настроить подходящий бюджет далее, при запуске кампании, если\s+рекомендуемый вам не подходит/,
    );
    // Не приглушён: это обещание, которое пользователь должен прочитать.
    expect(note.className).toContain("text-foreground");
    expect(note.className).not.toContain("text-muted-foreground");
  });

  it("выбора суммы на карточке нет — он живёт на экране оплаты", () => {
    renderCard();
    expect(screen.queryByText("Своя сумма")).toBeNull();
    expect(screen.queryByText("Рекомендуемая")).toBeNull();
  });
});

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CampaignCard } from "./campaign-card";
import type { Campaign } from "@/state/app-state";

const base: Campaign = {
  id: "c1",
  name: "Кампания",
  status: "draft",
  createdAt: "2026-06-01T00:00:00.000Z",
  sourceType: "stream",
  channels: ["sms"],
  scenario: { id: "base-registration", name: "Регистрация" },
};

afterEach(cleanup);

describe("CampaignCard — чип каденса", () => {
  it("stream → «Потоковая», без чипа источника", () => {
    render(<CampaignCard campaign={base} onOpen={vi.fn()} />);
    expect(screen.getByText("Потоковая")).toBeInTheDocument();
    expect(screen.queryByText("Поток")).not.toBeInTheDocument();
    expect(screen.queryByText("Новая база номеров")).not.toBeInTheDocument();
  });

  it("new → «Разовая»", () => {
    render(<CampaignCard campaign={{ ...base, sourceType: "new" }} onOpen={vi.fn()} />);
    expect(screen.getByText("Разовая")).toBeInTheDocument();
  });

  it("own → «Разовая»", () => {
    render(<CampaignCard campaign={{ ...base, sourceType: "own" }} onOpen={vi.fn()} />);
    expect(screen.getByText("Разовая")).toBeInTheDocument();
  });

  it("без sourceType → чипа каденса нет", () => {
    render(<CampaignCard campaign={{ ...base, sourceType: undefined }} onOpen={vi.fn()} />);
    expect(screen.queryByText("Разовая")).not.toBeInTheDocument();
    expect(screen.queryByText("Потоковая")).not.toBeInTheDocument();
  });
});

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "cmp_1",
    name: "Поток ЖК Заря",
    status: "active",
    createdAt: "2026-06-01T00:00:00.000Z",
    launchedAt: "2026-06-02T00:00:00.000Z",
    scenario: { id: "sc_1", name: "Удержание" },
    channels: ["sms"],
    ...overrides,
  };
}

// Показываем ВВЕДЁННЫЙ пользователем потолок (maxDailyBudget), а не расчётный
// dailyBudget (= communication / STREAM_DAYS): тот пересчитывается от стоимости
// графа и перезаписывается при запуске — из-за чего «скакал» на карточке.
describe("CampaignCard — макс. дневной бюджет", () => {
  it("показывает введённый maxDailyBudget точным значением", () => {
    render(
      <CampaignCard
        campaign={makeCampaign({ sourceType: "stream", maxDailyBudget: 12000 })}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText("Макс. дневной бюджет")).toBeInTheDocument();
    // Точный формат (ru-RU no-break space), НЕ компактный «12 тыс ₽».
    expect(screen.getByText(/^12\s000\s₽$/)).toBeInTheDocument();
    expect(screen.queryByText(/тыс ₽/)).not.toBeInTheDocument();
  });

  it("без введённого потолка строки нет", () => {
    render(
      <CampaignCard
        campaign={makeCampaign({ sourceType: "stream", maxDailyBudget: undefined })}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.queryByText("Макс. дневной бюджет")).not.toBeInTheDocument();
  });

  it("расчётный dailyBudget на карточку НЕ выводится", () => {
    render(
      <CampaignCard
        campaign={makeCampaign({ sourceType: "stream", dailyBudget: 777, maxDailyBudget: undefined })}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.queryByText("Дневной бюджет")).not.toBeInTheDocument();
    expect(screen.queryByText(/777/)).not.toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CampaignCard } from "./campaign-card";
import type { Campaign } from "@/state/app-state";

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

describe("CampaignCard — дневной бюджет (item 10)", () => {
  it("stream-кампания с dailyBudget показывает «Дневной бюджет» точным значением", () => {
    render(
      <CampaignCard
        campaign={makeCampaign({ sourceType: "stream", dailyBudget: 12000 })}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText("Дневной бюджет")).toBeInTheDocument();
    // Точный формат (ru-RU no-break space), НЕ компактный «12 тыс ₽».
    expect(screen.getByText(/^12\s000\s₽$/)).toBeInTheDocument();
    expect(screen.queryByText(/тыс ₽/)).not.toBeInTheDocument();
  });

  it("разовая (new) кампания не показывает «Дневной бюджет»", () => {
    render(
      <CampaignCard
        campaign={makeCampaign({ sourceType: "new", dailyBudget: 12000 })}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.queryByText("Дневной бюджет")).not.toBeInTheDocument();
  });

  it("stream без dailyBudget не показывает строку", () => {
    render(
      <CampaignCard
        campaign={makeCampaign({ sourceType: "stream", dailyBudget: undefined })}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.queryByText("Дневной бюджет")).not.toBeInTheDocument();
  });
});

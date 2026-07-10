import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { buildCampaignStats, CampaignStatsBlock } from "./campaign-stats-block";
import type { Campaign, Artifact } from "@/state/app-state";

afterEach(cleanup);

function campaign(partial: Partial<Campaign>): Campaign {
  return {
    id: "c1",
    name: "X",
    status: "draft",
    createdAt: new Date().toISOString(),
    ...partial,
  } as Campaign;
}

describe("buildCampaignStats", () => {
  it("returns null for a draft (no facts yet)", () => {
    expect(buildCampaignStats(campaign({ status: "draft" }))).toBeNull();
  });
  it("returns sends/cr/spend for a launched campaign with an artifact", () => {
    const art: Artifact = {
      id: "a1",
      campaignId: "c1",
      kind: "signals",
      count: 8000,
      createdAt: new Date(2024, 0, 1).toISOString(),
    };
    const s = buildCampaignStats(
      campaign({
        status: "active",
        budget: 5000,
        channels: ["sms"],
        launchedAt: new Date(2024, 0, 1).toISOString(),
      }),
      art
    );
    expect(s).not.toBeNull();
    expect(s!.sends).toBeGreaterThan(0);
    // Two distinct budget rows: planned and actual
    expect(s!.plannedBudget).toBe(5000);
    expect(typeof s!.actualSpend).toBe("number");
    expect(s!.actualSpend).toBeGreaterThan(0);
  });
});

// Внутри открытой кампании потолок должен быть виден так же, как на карточке
// в разделе «Кампании» — раньше строка жила только в CampaignCard.
describe("CampaignStatsBlock — макс. дневной бюджет", () => {
  const launched = campaign({
    status: "active",
    budget: 5000,
    launchedAt: new Date(2024, 0, 1).toISOString(),
  });

  it("показывает введённый потолок точным значением", () => {
    render(
      <CampaignStatsBlock
        campaign={{ ...launched, maxDailyBudget: 12000 }}
        populated
      />,
    );
    expect(screen.getByText("Макс. дневной бюджет")).toBeInTheDocument();
    expect(screen.getByText(/^12\s000\s₽$/)).toBeInTheDocument();
  });

  it("без потолка строки нет", () => {
    render(<CampaignStatsBlock campaign={launched} populated />);
    expect(screen.queryByText("Макс. дневной бюджет")).not.toBeInTheDocument();
  });
});

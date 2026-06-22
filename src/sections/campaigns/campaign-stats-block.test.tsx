import { describe, it, expect } from "vitest";
import { buildCampaignStats } from "./campaign-stats-block";
import type { Campaign, Artifact } from "@/state/app-state";

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

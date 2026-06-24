import { describe, it, expect } from "vitest";
import { getCampaignCardMetrics } from "./campaign-metrics";
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

describe("getCampaignCardMetrics (campaign-first)", () => {
  it("derives planned budget from the campaign, not a signal join", () => {
    const m = getCampaignCardMetrics(
      campaign({ sourceType: "own", channels: ["sms"], budget: 1234 })
    );
    expect(m.plannedBudget).toBe(1234);
  });

  it("falls back to recommendBudget from file rowCount when no budget", () => {
    const m = getCampaignCardMetrics(
      campaign({ sourceType: "own", channels: ["sms"], files: [{ name: "b.csv", rowCount: 10_000 }] })
    );
    expect(m.plannedBudget).toBeGreaterThan(0);
  });

  it("draft campaigns have no launched facts", () => {
    const m = getCampaignCardMetrics(campaign({ status: "draft", budget: 500 }));
    expect(m.launched).toBe(false);
    expect(m.sends).toBe(0);
  });

  it("a launched campaign produces sends from the cube", () => {
    const art: Artifact = {
      id: "a1",
      campaignId: "c1",
      kind: "signals",
      count: 8000,
      createdAt: new Date(2024, 0, 1).toISOString(),
    };
    const m = getCampaignCardMetrics(
      campaign({
        status: "active",
        budget: 5000,
        channels: ["sms"],
        launchedAt: new Date(2024, 0, 1).toISOString(),
      }),
      art
    );
    expect(m.launched).toBe(true);
    expect(m.sends).toBeGreaterThan(0);
  });
});

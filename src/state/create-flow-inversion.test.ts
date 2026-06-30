import { describe, expect, it } from "vitest";
import { appReducer, initialState, type Campaign } from "./app-state";

function draftCampaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: "cmp_seed",
    name: "Seed",
    status: "draft",
    createdAt: "2026-06-18T00:00:00.000Z",
    sourceType: "new",
    channels: ["sms"],
    ...over,
  };
}

describe("create-flow inversion", () => {
  it("artifacts are keyed by campaignId, not the reverse", () => {
    const state = {
      ...initialState,
      campaigns: [draftCampaign()],
      artifacts: [
        { id: "art_1", campaignId: "cmp_seed", kind: "signals" as const, count: 10, baseSize: 24, createdAt: "x" },
      ],
    };
    const linked = state.artifacts.filter((a) => a.campaignId === "cmp_seed");
    expect(linked).toHaveLength(1);
    expect("signalId" in state.campaigns[0]).toBe(false);
  });

  it("campaign_artifact_ready appends an artifact for the campaign", () => {
    const state = { ...initialState, campaigns: [draftCampaign()] };
    const next = appReducer(state, {
      type: "campaign_artifact_ready",
      campaignId: "cmp_seed",
      kind: "signals",
      count: 250,
    });
    expect(next.artifacts).toHaveLength(1);
    expect(next.artifacts[0].campaignId).toBe("cmp_seed");
    expect(next.artifacts[0].count).toBe(250);
  });
});

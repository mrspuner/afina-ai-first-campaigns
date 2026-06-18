import { describe, expect, it } from "vitest";
import { appReducer, initialState, type Campaign } from "./app-state";

function draft(): Campaign {
  return {
    id: "cmp_seed",
    name: "Seed",
    status: "draft",
    createdAt: "2026-06-18T00:00:00.000Z",
    sourceType: "new",
    channels: ["sms"],
  };
}

describe("artifact-ready fires the notifications badge", () => {
  it("sets the badge true when an artifact lands", () => {
    const state = { ...initialState, campaigns: [draft()] };
    expect(state.notifications.signalsBadge).toBe(false);
    const next = appReducer(state, {
      type: "campaign_artifact_ready",
      campaignId: "cmp_seed",
      kind: "signals",
      count: 100,
    });
    expect(next.notifications.signalsBadge).toBe(true);
    expect(next.artifacts).toHaveLength(1);
  });
});

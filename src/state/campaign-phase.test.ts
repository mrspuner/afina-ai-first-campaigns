import { describe, expect, it } from "vitest";
import { appReducer, initialState, type Campaign } from "./app-state";

function active(over: Partial<Campaign> = {}): Campaign {
  return {
    id: "cmp_1",
    name: "Active",
    status: "active",
    createdAt: "2026-06-18T00:00:00.000Z",
    sourceType: "new",
    channels: ["sms"],
    phase: "scoring",
    ...over,
  };
}

describe("campaign_phase_advanced", () => {
  it("moves the campaign to phase communicating", () => {
    const state = { ...initialState, campaigns: [active()] };
    const next = appReducer(state, { type: "campaign_phase_advanced", id: "cmp_1" });
    expect(next.campaigns[0].phase).toBe("communicating");
  });

  it("is a no-op for an unknown id", () => {
    const state = { ...initialState, campaigns: [active()] };
    const next = appReducer(state, { type: "campaign_phase_advanced", id: "nope" });
    expect(next.campaigns[0].phase).toBe("scoring");
  });
});
